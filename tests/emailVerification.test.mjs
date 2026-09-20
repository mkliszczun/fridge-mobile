import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionClient, responseError } from '../utils/sessionClient.js';
import { emailError } from '../utils/accountValidation.js';

const start = Date.UTC(2026, 8, 17, 12);
const secret = 'a'.repeat(43);
const challenge = (email = 'test@example.com', extra = {}) => ({ verificationToken: secret,
  email, emailRequired: !email, expiresAt: new Date(start + 1800000).toISOString(), ...extra });
const delivery = (extra = {}) => ({ codeExpiresAt: new Date(start + 600000).toISOString(),
  resendAvailableAt: new Date(start + 60000).toISOString(), ...extra });
const pair = { token: 'header.' + Buffer.from(JSON.stringify({ uid: 'user-1', sub: 'legacy',
  exp: start / 1000 + 900, jti: 'new', roles: ['USER'] })).toString('base64url') + '.signature',
  refreshToken: 'refresh-secret' };
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status,
  headers: { 'Content-Type': 'application/json', ...headers } });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

function setup(handler) {
  let time = start, saved = null;
  const calls = [], changes = [];
  const client = createSessionClient({ baseUrl: 'https://api.example.com', now: () => time,
    storage: { read: async () => saved, write: async value => { saved = value; }, clear: async () => { saved = null; } },
    onVerificationChange: value => changes.push(value),
    fetchImpl: async (url, options) => {
      const path = new URL(url).pathname, body = JSON.parse(options.body || '{}');
      calls.push({ path, body, headers: options.headers });
      assert.equal(new Headers(options.headers).get('Authorization'), null);
      return handler(path, body);
    } });
  return { client, calls, changes, saved: () => saved, advance: milliseconds => { time += milliseconds; } };
}

for (const action of ['login', 'register']) test(action + ' 202 keeps proof in memory without access to private data', async () => {
  const h = setup(() => json(challenge(), 202));
  assert.deepEqual(await h.client[action]('test@example.com', 'password1'), { verificationRequired: true });
  assert.equal(h.client.getSession(), null);
  assert.equal(h.saved(), null);
  assert.equal(h.client.getVerification().mode, action);
  assert.equal(h.client.getVerification().verificationToken, undefined);
  assert.equal(JSON.stringify(h.changes).includes(secret), false);
  await assert.rejects(h.client.request('/api/me'), { status: 401 });
  assert.equal(h.calls.length, 1);
});

test('corrected legacy address sends code and confirmation persists only the real token pair', async () => {
  const h = setup((path, body) => {
    if (path === '/auth/login') return json(challenge(null), 202);
    assert.equal(body.verificationToken, secret);
    if (path === '/auth/email/send') {
      assert.deepEqual(body, { verificationToken: secret, email: 'correct@example.com' });
      return json(delivery());
    }
    assert.equal(path, '/auth/email/verify');
    assert.deepEqual(body, { verificationToken: secret, code: '012345' });
    return json(pair);
  });
  await h.client.login('legacy', 'password1');
  assert.equal(h.client.getVerification().emailRequired, true);
  await h.client.sendVerificationEmail('Correct@example.com');
  assert.equal(h.saved(), null);
  await h.client.verifyEmail('012345');
  assert.equal(h.client.getVerification(), null);
  assert.equal(h.client.getSession().email, 'correct@example.com');
  assert.equal(JSON.parse(h.saved()).refreshToken, pair.refreshToken);
  assert.equal(h.saved().includes(secret), false);
  assert.equal(h.saved().includes('password1'), false);
  assert.equal(h.saved().includes('012345'), false);
  assert.deepEqual(h.calls.map(c => c.path), ['/auth/login', '/auth/email/send', '/auth/email/verify']);
});

test('202 clears any previous authenticated credentials and is not restored on app restart', async () => {
  let calls = 0;
  const h = setup(() => ++calls === 1 ? json(pair) : json(challenge(), 202));
  await h.client.login('old@example.com', 'password1');
  assert.ok(h.saved());
  await h.client.login('test@example.com', 'password1');
  assert.equal(h.saved(), null);
  assert.equal(h.client.getSession(), null);
  await h.client.cancelVerification();
  await h.client.restore();
  assert.equal(h.client.getVerification(), null);
  assert.equal(h.client.getSession(), null);
});

test('legacy 201 registration and verified 200 login remain compatible', async () => {
  const h = setup(path => json(pair, path === '/auth/register' ? 201 : 200));
  await h.client.register('test@example.com', 'password1');
  assert.ok(h.client.getSession());
  assert.equal(h.client.getVerification(), null);
  await h.client.login('test@example.com', 'password1');
  assert.ok(h.client.getSession());
});

test('SMTP failure permits another send with the same proof; resend cooldown prevents duplicates', async () => {
  let sends = 0;
  const h = setup(path => path === '/auth/register' ? json(challenge(), 202)
    : ++sends === 1 ? json({ error: 'Email delivery unavailable' }, 503) : json(delivery()));
  await h.client.register('test@example.com', 'password1');
  await assert.rejects(h.client.sendVerificationEmail(), /Nie udało się wysłać kodu/);
  assert.equal(h.client.getVerification().codeExpiresAt, null);
  await h.client.sendVerificationEmail();
  await assert.rejects(h.client.sendVerificationEmail(), { status: 429, resetsAt: start + 60000 });
  assert.equal(sends, 2);
  h.advance(60000);
  await h.client.sendVerificationEmail();
  assert.equal(sends, 3);
});

test('wrong code can be corrected and 429 has a verification-specific countdown', async () => {
  let tries = 0;
  const h = setup(path => path === '/auth/login' ? json(challenge(), 202)
    : ++tries === 1 ? json({ error: 'Invalid or expired verification code' }, 400)
      : tries === 2 ? json({}, 429, { 'Retry-After': '120' }) : json(pair));
  await h.client.login('test@example.com', 'password1');
  await assert.rejects(h.client.verifyEmail('123456'), /Kod jest nieprawidłowy/);
  assert.equal(h.client.getVerification().invalid, false);
  await assert.rejects(h.client.verifyEmail('123456'), error => error.status === 429 && !error.message.includes('AI'));
  assert.equal(h.client.getVerification().verifyBlockedUntil, start + 120000);
  await assert.rejects(h.client.verifyEmail('012345'), { status: 429 });
  assert.equal(tries, 2);
  h.advance(120000);
  await h.client.verifyEmail('012345');
  assert.ok(h.client.getSession());
});

test('send quota must not prevent confirmation of an already delivered code', async () => {
  const h = setup(path => path === '/auth/login' ? json(challenge(), 202) : path === '/auth/email/send'
    ? json({}, 429, { 'Retry-After': '3600' }) : json(pair));
  await h.client.login('test@example.com', 'password1');
  await assert.rejects(h.client.sendVerificationEmail(), { status: 429 });
  assert.equal(h.client.getVerification().sendBlockedUntil, start + 3600000);
  await h.client.verifyEmail('012345');
  assert.ok(h.client.getSession());
});

test('expiry and server invalidation require a fresh process without refreshing JWT', async () => {
  const h = setup(path => path === '/auth/login' ? json(challenge(), 202)
    : json({ error: '400 BAD_REQUEST "Invalid or expired verification process; sign in or register again"' }, 400));
  await h.client.login('test@example.com', 'password1');
  await assert.rejects(h.client.verifyEmail('012345'), { verificationExpired: true });
  assert.equal(h.client.getVerification().invalid, true);
  await assert.rejects(h.client.sendVerificationEmail(), { verificationExpired: true });
  assert.equal(h.calls.length, 2);
  await h.client.login('test@example.com', 'password1');
  h.advance(1800000);
  await assert.rejects(h.client.verifyEmail('012345'), { verificationExpired: true });
  assert.equal(h.calls.length, 3);
});

test('invalid six-digit codes are rejected without sending a request', async () => {
  const h = setup(() => json(challenge(), 202));
  await h.client.register('test@example.com', 'password1');
  for (const code of ['12345', '1234567', '12abcd', 123456]) {
    await assert.rejects(h.client.verifyEmail(code), /sześciocyfrowy/);
  }
  assert.equal(h.calls.length, 1);
});

test('late successful confirmation cannot sign in after cancellation or a new login', async () => {
  const gate = deferred(), started = deferred();
  const h = setup(async path => {
    if (path === '/auth/login') return json(challenge(), 202);
    started.resolve(); await gate.promise; return json(pair);
  });
  await h.client.login('test@example.com', 'password1');
  const verification = h.client.verifyEmail('012345');
  const rejected = assert.rejects(verification, { status: 401 });
  await started.promise;
  await h.client.cancelVerification();
  await h.client.login('other@example.com', 'password1');
  gate.resolve(); await rejected;
  assert.equal(h.client.getSession(), null);
  assert.equal(h.saved(), null);
  assert.ok(h.client.getVerification());
});

test('parallel confirmation clicks send only one request', async () => {
  const gate = deferred(), started = deferred();
  const h = setup(async path => {
    if (path === '/auth/register') return json(challenge(), 202);
    started.resolve(); await gate.promise; return json(pair);
  });
  await h.client.register('test@example.com', 'password1');
  const first = h.client.verifyEmail('012345');
  await started.promise;
  await assert.rejects(h.client.verifyEmail('012345'), /poprzedniej operacji/);
  gate.resolve(); await first;
  assert.equal(h.calls.length, 2);
});

test('malformed 202 response cannot authorize the app', async () => {
  for (const bad of [{}, challenge(null, { verificationToken: 'bad' }), challenge(null, { expiresAt: 'invalid' })]) {
    const h = setup(() => json(bad, 202));
    await assert.rejects(h.client.register('test@example.com', 'password1'), /rozpocząć potwierdzania/);
    assert.equal(h.client.getSession(), null);
    assert.equal(h.client.getVerification(), null);
    assert.equal(h.saved(), null);
  }
});

test('email conflicts and auth limits have Polish messages; corrected addresses may use 254 characters', async () => {
  const error = await responseError(json({}, 409), 'email-send', start);
  assert.match(error.message, /adres.*używany/);
  for (const action of ['login', 'register', 'forgot', 'email-send', 'email-verify']) {
    const limited = await responseError(json({}, 429, { 'Retry-After': '60' }), action, start);
    assert.equal(limited.resetsAt, start + 60000);
    assert.ok(!limited.message.includes('AI'));
  }
  const long = 'a'.repeat(60) + '@example.com';
  assert.ok(emailError(long));
  assert.equal(emailError(long, 254), null);
});
