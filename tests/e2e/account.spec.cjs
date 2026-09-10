const { test, expect } = require('@playwright/test');
const jwt = (roles) => `header.${Buffer.from(JSON.stringify({ uid: 'user-1', sub: 'test@example.com', exp: Math.floor(Date.now() / 1000) + 900, jti: 'test-session', roles })).toString('base64url')}.test`;

async function mockApi(page, { roles = ['USER'], premium = false, remaining = .75 } = {}) {
  const calls = [], errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('https://fridge-app-api.fly.dev/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    calls.push({ path, method: request.method(), body: request.postDataJSON() });
    const reply = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
    if (path === '/auth/login' || path === '/auth/register') return reply({ token: jwt(roles), refreshToken: 'test-refresh', expiresIn: 900 }, path.endsWith('register') ? 201 : 200);
    if (path === '/auth/password/forgot') return route.fulfill({ status: 202 });
    if (path === '/auth/logout') return route.fulfill({ status: 204 });
    if (path === '/api/me' && request.method() === 'DELETE') return request.postDataJSON().password === 'correct-password' ? route.fulfill({ status: 204 }) : reply({}, 401);
    if (path === '/api/me') return reply({ id: 'user-1', email: 'test@example.com', plan: premium ? 'PREMIUM' : 'FREE', premiumUntil: premium ? new Date(Date.now() + 86400000).toISOString() : null, adsEnabled: !premium });
    if (path === '/api/me/ai-usage') return reply({ limitUsd: 1, remainingUsd: remaining, estimatedCostUsd: 1 - remaining, resetsAt: new Date(Date.now() + 3600000).toISOString() });
    if (path === '/api/products') return reply([{ id: 'product-1', name: 'Mleko', productType: 'DAIRY', defaultUnit: 'LITER', shelfLifeAfterOpeningDays: 3 }]);
    return reply([]);
  });
  return { calls, errors };
}
async function login(page) {
  await page.goto('/');
  await page.getByLabel('E-mail', { exact: true }).fill('test@example.com');
  await page.getByLabel('Hasło', { exact: true }).fill('password1');
  await page.getByRole('button', { name: 'Zaloguj się', exact: true }).click();
  await expect(page.getByText('Kuchnia', { exact: true })).toBeVisible();
}
async function settings(page, row) {
  await page.getByRole('button', { name: 'Ustawienia', exact: true }).click();
  await page.getByRole('button', { name: row, exact: true }).click();
}

test('login and registration keep the kitchen style; registration signs in', async ({ page }, info) => {
  const { calls, errors } = await mockApi(page);
  await page.goto('/');
  await expect(page.getByText('Dobrze Cię widzieć')).toBeVisible();
  await page.screenshot({ path: info.outputPath('login.png'), fullPage: true });
  await page.getByRole('link', { name: 'Załóż konto', exact: true }).click();
  await page.getByLabel('E-mail', { exact: true }).fill('test@example.com');
  await page.getByLabel('Hasło', { exact: true }).fill('password1');
  await page.getByLabel('Powtórz hasło', { exact: true }).fill('different');
  await page.getByRole('button', { name: 'Załóż konto', exact: true }).click();
  await expect(page.getByText('Hasła muszą być takie same.')).toBeVisible();
  expect(calls.some(c => c.path === '/auth/register')).toBe(false);
  await page.getByLabel('Powtórz hasło', { exact: true }).fill('password1');
  await page.screenshot({ path: info.outputPath('register.png'), fullPage: true });
  await page.getByRole('button', { name: 'Załóż konto', exact: true }).click();
  await expect(page.getByText('Kuchnia', { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath('home.png'), fullPage: true });
  expect(calls.filter(c => c.path === '/auth/register')).toHaveLength(1);
  expect(errors).toEqual([]);
});

test('forgot password shows the same confirmation without revealing account existence', async ({ page }, info) => {
  const { calls, errors } = await mockApi(page);
  await page.goto('/');
  await page.getByRole('link', { name: 'Nie pamiętasz hasła?' }).click();
  await page.getByLabel('E-mail', { exact: true }).fill('test@example.com');
  await page.getByRole('button', { name: 'Wyślij link', exact: true }).click();
  await expect(page.getByText(/Jeśli konto z tym adresem istnieje/)).toBeVisible();
  await page.screenshot({ path: info.outputPath('forgot.png'), fullPage: true });
  expect(calls.find(c => c.path === '/auth/password/forgot').body).toEqual({ email: 'test@example.com' });
  expect(errors).toEqual([]);
});

test('ordinary user can add catalog products but has no admin edit/delete controls', async ({ page }, info) => {
  const { errors } = await mockApi(page);
  await login(page);
  await page.getByRole('button', { name: 'Ustawienia', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Panel administratora', exact: true })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('settings.png'), fullPage: true });
  await page.getByRole('button', { name: 'Katalog produktów', exact: true }).click();
  await expect(page.getByText('Mleko', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Dodaj produkt', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edytuj Mleko' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Usuń Mleko' })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('catalog.png'), fullPage: true });
  expect(errors).toEqual([]);
});

test('premium, exhausted AI allowance and password-confirmed account deletion', async ({ page }, info) => {
  const { calls, errors } = await mockApi(page, { premium: true, remaining: 0 });
  await login(page); await settings(page, 'Twoje konto');
  await expect(page.getByText('Premium', { exact: true })).toBeVisible();
  await expect(page.getByText('Dzienny limit AI został wykorzystany', { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath('account.png'), fullPage: true });
  await page.getByRole('button', { name: 'Usuń konto…', exact: true }).click();
  await page.getByLabel('Potwierdź aktualnym hasłem', { exact: true }).fill('wrong');
  await page.getByRole('button', { name: 'Potwierdzam — usuń moje konto', exact: true }).click();
  await expect(page.getByText(/Konto nie zostało usunięte/)).toBeVisible();
  expect(calls.filter(c => c.path === '/auth/refresh')).toHaveLength(0);
  await page.getByLabel('Potwierdź aktualnym hasłem', { exact: true }).fill('correct-password');
  await page.getByRole('button', { name: 'Potwierdzam — usuń moje konto', exact: true }).click();
  await expect(page.getByText('Dobrze Cię widzieć')).toBeVisible();
  expect(calls.filter(c => c.method === 'DELETE')).toHaveLength(2);
  expect(errors).toEqual([]);
});

test('administrator retains catalog edit/delete controls', async ({ page }) => {
  const { errors } = await mockApi(page, { roles: ['ADMIN', 'USER'] });
  await login(page);
  await page.getByRole('button', { name: 'Ustawienia', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Panel administratora', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Katalog produktów', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Edytuj Mleko' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Usuń Mleko' })).toBeVisible();
  expect(errors).toEqual([]);
});
