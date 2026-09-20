const { test, expect } = require('@playwright/test');
const proof = 'v'.repeat(43);
const field = (page, label) => page.getByLabel(label, { exact: true }).filter({ visible: true });
const button = (page, name) => page.getByRole('button', { name, exact: true });

async function mockVerification(page, { email = 'test@example.com', sendStatuses = [], verifyStatuses = [] } = {}) {
  const calls = [], errors = [];
  let now = Date.now(), verified = false;
  await page.clock.install({ time: now });
  page.on('pageerror', error => errors.push(error.message));
  await page.route('https://fridge-app-api.fly.dev/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    calls.push({ path, body: request.postDataJSON(), authorization: request.headers().authorization, verified });
    const reply = (data, status = 200, headers = {}) => route.fulfill({
      status, contentType: 'application/json', headers: { 'Access-Control-Expose-Headers': 'Retry-After', ...headers },
      body: JSON.stringify(data),
    });
    if (path === '/auth/login' || path === '/auth/register') return reply({
      verificationToken: proof, expiresAt: new Date(now + 30 * 60000).toISOString(),
      email: path.endsWith('register') ? request.postDataJSON().login : email, emailRequired: !email,
    }, 202);
    if (path === '/auth/email/send') {
      const status = sendStatuses.shift() || 200;
      if (status !== 200) return reply({ error: status === 503 ? 'Email delivery unavailable' : 'Cannot send' }, status, { 'Retry-After': '120' });
      return reply({ codeExpiresAt: new Date(now + 10 * 60000).toISOString(), resendAvailableAt: new Date(now + 60000).toISOString() });
    }
    if (path === '/auth/email/verify') {
      const status = verifyStatuses.shift() || 200;
      if (status !== 200) return reply({
        error: status === 400 ? 'Invalid or expired verification code' : 'Verification temporarily unavailable',
      }, status, { 'Retry-After': '120' });
      verified = true;
      const claims = { uid: 'user-1', sub: 'test@example.com', exp: Math.floor(now / 1000) + 900, jti: 'verified-session', roles: ['USER'] };
      return reply({ token: 'header.' + Buffer.from(JSON.stringify(claims)).toString('base64url') + '.test', refreshToken: 'real-refresh', expiresIn: 900 });
    }
    if (path === '/api/me') return reply({ id: 'user-1', email: 'test@example.com', plan: 'FREE', adsEnabled: true });
    if (path === '/api/me/ai-usage') return reply({ limitUsd: .1, remainingUsd: .1 });
    return reply([]);
  });
  return {
    calls, errors,
    advance: async ms => { now += ms; await page.clock.fastForward(ms); },
    assertSafe: () => {
      expect(calls.filter(c => c.path.startsWith('/api/') && !c.verified)).toEqual([]);
      expect(calls.filter(c => c.path.startsWith('/auth/')).every(c => !c.authorization)).toBe(true);
      expect(page.url()).not.toContain(proof);
      expect(errors).toEqual([]);
    },
  };
}

async function startLogin(page) {
  await page.goto('/');
  await field(page, 'E-mail lub login').fill('old-login');
  await field(page, 'Hasło').fill('password1');
  await button(page, 'Zaloguj się').click();
  await expect(page.getByText('Potwierdź e-mail', { exact: true })).toBeVisible();
}

async function confirm(page, code = '012345') {
  await field(page, 'Kod z wiadomości').fill(code);
  await button(page, 'Potwierdź i zaloguj').click();
}

test('202 registration requires a code, preserves leading zero and logs in only after verification', async ({ page }, info) => {
  const state = await mockVerification(page);
  await page.goto('/register');
  await field(page, 'E-mail').fill('test@example.com');
  await field(page, 'Hasło').fill('password1');
  await field(page, 'Powtórz hasło').fill('password1');
  await button(page, 'Załóż konto').click();
  await expect(page.getByText('Potwierdź e-mail', { exact: true })).toBeVisible();
  await expect(field(page, 'E-mail')).not.toBeEditable();
  expect(state.calls.some(c => c.path === '/auth/email/send')).toBe(false);
  state.assertSafe();
  await button(page, 'Wyślij kod').click();
  await expect(field(page, 'Kod z wiadomości')).toBeVisible();
  await expect(button(page, 'Wyślij kod ponownie')).toBeDisabled();
  await page.screenshot({ path: info.outputPath('verify-email.png'), fullPage: true });
  const stored = await page.evaluate(() => JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage)]));
  expect(stored).not.toContain(proof);
  await confirm(page);
  await expect(page.getByText('Kuchnia', { exact: true })).toBeVisible();
  expect(state.calls.find(c => c.path === '/auth/email/verify').body).toEqual({ verificationToken: proof, code: '012345' });
  state.assertSafe();
});

test('legacy account can correct its address and retry SMTP failure and a wrong code', async ({ page }) => {
  const state = await mockVerification(page, { email: null, sendStatuses: [503, 200], verifyStatuses: [400, 200] });
  await startLogin(page);
  await field(page, 'E-mail').fill('correct@example.com');
  await button(page, 'Wyślij kod').click();
  await expect(page.getByText(/Nie udało się wysłać kodu/)).toBeVisible();
  await button(page, 'Wyślij kod').click();
  await expect(field(page, 'Kod z wiadomości')).toBeVisible();
  await confirm(page, '000001');
  await expect(page.getByText(/Kod jest nieprawidłowy lub wygasł/)).toBeVisible();
  await confirm(page);
  await expect(page.getByText('Kuchnia', { exact: true })).toBeVisible();
  const sends = state.calls.filter(c => c.path === '/auth/email/send');
  expect(sends).toHaveLength(2);
  expect(sends.every(c => c.body.email === 'correct@example.com' && c.body.verificationToken === proof)).toBe(true);
  state.assertSafe();
});

test('resend quota does not block verification; wrong-code quota counts down separately', async ({ page }) => {
  const state = await mockVerification(page, { sendStatuses: [200, 429], verifyStatuses: [429, 200] });
  await startLogin(page);
  await button(page, 'Wyślij kod').click();
  await expect(field(page, 'Kod z wiadomości')).toBeVisible();
  await state.advance(61000);
  await button(page, 'Wyślij kod ponownie').click();
  await expect(page.getByText(/Zbyt wiele prób/)).toBeVisible();
  await expect(button(page, 'Wyślij kod ponownie')).toBeDisabled();
  await expect(button(page, 'Potwierdź i zaloguj')).toBeEnabled();
  await confirm(page);
  await expect(page.getByText(/Kolejna próba za/)).toBeVisible();
  await expect(button(page, 'Potwierdź i zaloguj')).toBeDisabled();
  await expect(page.getByText(/Dzisiejszy limit AI/)).toHaveCount(0);
  await state.advance(121000);
  await button(page, 'Potwierdź i zaloguj').click();
  await expect(page.getByText('Kuchnia', { exact: true })).toBeVisible();
  state.assertSafe();
});

test('expired code can be replaced; changed address requires sending a new code', async ({ page }) => {
  const state = await mockVerification(page);
  await startLogin(page);
  await button(page, 'Wyślij kod').click();
  await expect(field(page, 'Kod z wiadomości')).toBeVisible();
  await state.advance(601000);
  await expect(page.getByText('Kod wygasł. Wyślij nowy kod.')).toBeVisible();
  await expect(button(page, 'Potwierdź i zaloguj')).toBeDisabled();
  await field(page, 'E-mail').fill('new@example.com');
  await expect(field(page, 'Kod z wiadomości')).toHaveCount(0);
  await button(page, 'Wyślij kod na nowy adres').click();
  await expect(field(page, 'Kod z wiadomości')).toBeVisible();
  await expect(field(page, 'Kod z wiadomości')).toHaveValue('');
  await confirm(page);
  await expect(page.getByText('Kuchnia', { exact: true })).toBeVisible();
  state.assertSafe();
});

test('expired process returns to login and a reload cannot restore the temporary proof', async ({ page }) => {
  const state = await mockVerification(page);
  await startLogin(page);
  await state.advance(1801000);
  await expect(page.getByText('Potwierdzenie utraciło ważność. Rozpocznij ponownie.')).toBeVisible();
  await expect(button(page, 'Wyślij kod')).toHaveCount(0);
  await button(page, 'Wróć do logowania').click();
  await expect(page.getByText('Dobrze Cię widzieć')).toBeVisible();
  await startLogin(page);
  await page.reload();
  await expect(page.getByText('Dobrze Cię widzieć')).toBeVisible();
  await page.goto('/verify-email');
  await expect(page.getByText('Dobrze Cię widzieć')).toBeVisible();
  state.assertSafe();
});

test('address conflict can be corrected without restarting the legacy login process', async ({ page }) => {
  const state = await mockVerification(page, { sendStatuses: [409, 200] });
  await startLogin(page);
  await button(page, 'Wyślij kod').click();
  await expect(page.getByText(/Ten adres jest już używany przez inne konto/)).toBeVisible();
  await field(page, 'E-mail').fill('unused@example.com');
  await button(page, 'Wyślij kod').click();
  await expect(field(page, 'Kod z wiadomości')).toBeVisible();
  await button(page, 'Wróć do logowania').click();
  await expect(page.getByText('Dobrze Cię widzieć')).toBeVisible();
  state.assertSafe();
});
