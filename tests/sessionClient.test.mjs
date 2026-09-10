import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionClient, retryTime, readClaims } from '../utils/sessionClient.js';
import { emailError, passwordError } from '../utils/accountValidation.js';

const now = Date.UTC(2026, 8, 10, 12);
const token = (id = 'a', exp = now / 1000 + 900, uid = 'user-1', roles = ['USER']) =>
  `header.${Buffer.from(JSON.stringify({ uid, sub: 'test@example.com', jti: id, exp, roles })).toString('base64url')}.signature`;
const pair = (id = 'a', exp, uid) => ({ token: token(id, exp, uid), refreshToken: `refresh-${id}` });
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
function setup(handler, initial) {
  let saved = initial || null;
  const calls = [], writes = [], changes = [];
  const storage = { read: async () => saved, write: async value => { saved = value; writes.push(JSON.parse(value)); }, clear: async () => { saved = null; } };
  const client = createSessionClient({ baseUrl: 'https://api.example.com', storage, now: () => now,
    onChange: value => changes.push(value), fetchImpl: async (url, options) => {
      calls.push({ path: new URL(url).pathname, options });
      return handler(new URL(url).pathname, options, calls);
    } });
  return { client, calls, writes, changes, saved: () => saved };
}

test('parallel requests rotate once, persist the new pair and keep session identity', async () => {
  const gate = deferred();
  const h = setup(async (path, options) => {
    if (path === '/auth/login') return json(pair('a', now / 1000 - 1));
    if (path === '/auth/refresh') {
      assert.equal(options.headers.Authorization, undefined);
      assert.deepEqual(JSON.parse(options.body), { refreshToken: 'refresh-a' });
      await gate.promise; return json(pair('b'));
    }
    assert.equal(options.headers.get('Authorization'), `Bearer ${token('b')}`);
    return json({ ok: true });
  });
  await h.client.login('test@example.com', 'password1');
  const requests = [h.client.request('/api/me'), h.client.request('/api/products'), h.client.request('/api/me/ai-usage')];
  gate.resolve(); await Promise.all(requests);
  assert.equal(h.calls.filter(c => c.path === '/auth/refresh').length, 1);
  assert.equal(h.client.getSession().sessionId, 'a');
  assert.equal(JSON.parse(h.saved()).refreshToken, 'refresh-b');
  assert.ok(h.writes.some(w => w.refreshPending));
});

test('concurrent late 401s reuse the rotated token without replaying refresh credentials', async () => {
  const h = setup((path, options) => {
    if (path === '/auth/login') return json(pair());
    if (path === '/auth/refresh') return json(pair('b'));
    return options.headers.get('Authorization') === `Bearer ${token()}` ? json({}, 401) : json({ ok: true });
  });
  await h.client.login('test@example.com', 'password1');
  await Promise.all(Array.from({ length: 8 }, () => h.client.request('/api/products')));
  assert.equal(h.calls.filter(c => c.path === '/auth/refresh').length, 1);
  assert.equal(h.calls.filter(c => c.path === '/api/products').length, 16);
});

test('a second 401 clears credentials and cannot loop', async () => {
  const h = setup(path => json(path === '/auth/login' ? pair() : path === '/auth/refresh' ? pair('b') : {}, path.startsWith('/auth/') ? 200 : 401));
  await h.client.login('test@example.com', 'password1');
  await assert.rejects(h.client.request('/api/me'), { status: 401 });
  assert.equal(h.calls.length, 4); assert.equal(h.saved(), null); assert.equal(h.client.getSession(), null);
});

test('incorrect deletion password does not refresh, repeat DELETE or log out', async () => {
  const h = setup(path => path === '/auth/login' ? json(pair()) : json({}, 401));
  await h.client.login('test@example.com', 'password1');
  await assert.rejects(h.client.request('/api/me', { method: 'DELETE', body: JSON.stringify({ password: 'wrong' }) }, { passwordCheck: true }), /Konto nie zostało usunięte/);
  assert.equal(h.calls.length, 2); assert.ok(h.client.getSession()); assert.ok(h.saved());
});

test('AI budget exhaustion returns reset information and never retries generation', async () => {
  const h = setup(path => path === '/auth/login' ? json(pair()) : json({}, 429, { 'Retry-After': '90' }));
  await h.client.login('test@example.com', 'password1');
  await assert.rejects(h.client.request('/api/ai/recipes/generate', { method: 'POST' }), error => error.status === 429 && error.resetsAt > Date.now());
  assert.equal(h.calls.length, 2); assert.ok(h.client.getSession());
});

test('ambiguous network failure during AI generation is not retried', async () => {
  const h = setup(path => { if (path === '/auth/login') return json(pair()); throw new TypeError('offline'); });
  await h.client.login('test@example.com', 'password1');
  await assert.rejects(h.client.request('/api/ai/recipes/generate', { method: 'POST' }), /Brak połączenia/);
  assert.equal(h.calls.length, 2); assert.ok(h.client.getSession());
});

test('request deadline also covers a stalled response body', async () => {
  const h = setup((path, options) => {
    if (path === '/auth/login') return json(pair());
    return { text: () => new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })) };
  });
  await h.client.login('test@example.com', 'password1');
  await assert.rejects(h.client.request('/api/me', { timeoutMs: 10 }), /nie odpowiedział na czas/);
  assert.equal(h.calls.length, 2); assert.ok(h.client.getSession());
});

test('an interrupted refresh clears credentials instead of replaying a possibly used token', async () => {
  const h = setup(path => { if (path === '/auth/login') return json(pair('a', now / 1000 - 1)); throw new TypeError('offline'); });
  await h.client.login('test@example.com', 'password1');
  await assert.rejects(h.client.request('/api/me'), { status: 401 });
  await assert.rejects(h.client.request('/api/me'), { status: 401 });
  assert.equal(h.calls.length, 2); assert.equal(h.saved(), null);
});

test('restart after a crash during refresh requires login without sending the old refresh token', async () => {
  const h = setup(() => assert.fail('must not make a request'), JSON.stringify({ accessToken: token(), refreshToken: 'old', refreshPending: true }));
  await h.client.restore(); assert.equal(h.client.getSession(), null); assert.equal(h.saved(), null);
});

test('late refresh cannot restore a logged-out session', async () => {
  const gate = deferred(), started = deferred();
  const h = setup(async path => {
    if (path === '/auth/login') return json(pair('a', now / 1000 - 1));
    started.resolve(); await gate.promise; return json(pair('b'));
  });
  await h.client.login('test@example.com', 'password1');
  const request = h.client.request('/api/me');
  const rejected = assert.rejects(request, { status: 401 });
  await started.promise; await h.client.clearLocal(); gate.resolve(); await rejected;
  assert.equal(h.saved(), null); assert.equal(h.client.getSession(), null);
});

test('late data from a previous account is rejected after switching users', async () => {
  const gate = deferred(), started = deferred(); let logins = 0;
  const h = setup(async path => {
    if (path === '/auth/login') return json(pair(`login-${++logins}`, undefined, `user-${logins}`));
    started.resolve(); await gate.promise; return json({ private: 'old user' });
  });
  await h.client.login('one@example.com', 'password1');
  const rejected = assert.rejects(h.client.request('/api/me'), { status: 401 });
  await started.promise; await h.client.clearLocal(); await h.client.login('two@example.com', 'password2');
  gate.resolve(); await rejected; assert.equal(h.client.getSession().userId, 'user-2');
});

test('logout clears local credentials even when the server is unavailable', async () => {
  const h = setup(path => { if (path === '/auth/login') return json(pair()); throw new TypeError('offline'); });
  await h.client.login('test@example.com', 'password1');
  assert.equal(await h.client.logout(), false); assert.equal(h.saved(), null); assert.equal(h.client.getSession(), null);
});

test('third-party URLs cannot receive access credentials; scanner 404 remains available', async () => {
  const h = setup(path => path === '/auth/login' ? json(pair()) : json({}, 404));
  await h.client.login('test@example.com', 'password1');
  for (const url of ['https://evil.example/api', '//evil.example', 'https://api.example.com.evil.example/api']) {
    await assert.rejects(h.client.request(url), /Nieprawidłowy adres/);
  }
  assert.equal(h.calls.length, 1);
  assert.equal((await h.client.request('https://api.example.com/api/products/123')).status, 404);
});

test('registration and password recovery send the backend contract without authorization', async () => {
  const h = setup((path, options) => {
    assert.equal(options.headers.Authorization, undefined);
    if (path === '/auth/register') { assert.deepEqual(JSON.parse(options.body), { login: 'test@example.com', password: 'password1' }); return json(pair(), 201); }
    assert.deepEqual(JSON.parse(options.body), { email: 'test@example.com' }); return new Response(null, { status: 202 });
  });
  await h.client.register('test@example.com', 'password1'); await h.client.forgotPassword('test@example.com');
  assert.equal(h.client.getSession().roles[0], 'USER');
});

test('validation matches backend email and UTF-8 password constraints', () => {
  assert.equal(emailError(' valid@example.com '), null);
  assert.ok(emailError('legacy-login')); assert.ok(emailError(`${'a'.repeat(60)}@example.com`));
  assert.ok(passwordError('short')); assert.ok(passwordError('password1', 'different'));
  assert.equal(passwordError('ą'.repeat(36)), null); assert.ok(passwordError('ą'.repeat(37)));
  assert.equal(passwordError('😀'.repeat(18)), null); assert.ok(passwordError('😀'.repeat(19)));
  assert.doesNotThrow(() => passwordError('\ud800'));
  assert.deepEqual(readClaims('not-a-jwt'), {});
  assert.equal(retryTime('90', now), now + 90000);
  assert.equal(retryTime(null, now), Date.UTC(2026, 8, 11));
});
