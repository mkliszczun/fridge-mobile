const { test, expect } = require('@playwright/test');
const field = (page, label) => page.getByLabel(label, { exact: true }).filter({ visible: true });
const button = (page, name) => page.getByRole('button', { name, exact: true });
const draft = { name: 'Mleko', ean: null, brand: 'Pilos', productType: 'DAIRY', defaultUnit: 'MILLILITER', shelfLifeAfterOpeningDays: 3, defaultExpirationDays: 7 };

async function setup(page, { status = 200, generate } = {}) {
  const calls = [], errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('https://fridge-app-api.fly.dev/**', async route => {
    const req = route.request(), path = new URL(req.url()).pathname;
    calls.push({ path, method: req.method(), body: req.postDataJSON() });
    const reply = (data, code = 200) => route.fulfill({ status: code, contentType: 'application/json', body: JSON.stringify(data) });
    if (path === '/auth/login' || path === '/auth/refresh') {
      const claims = { uid: 'user-1', sub: 'test@example.com', exp: Math.floor(Date.now() / 1000) + 900, jti: 'product-test', roles: ['USER'] };
      return reply({ token: 'header.' + Buffer.from(JSON.stringify(claims)).toString('base64url') + '.test', refreshToken: 'test-refresh' });
    }
    if (path === '/api/me') return reply({ id: 'user-1', email: 'test@example.com', plan: 'FREE' });
    if (path === '/api/me/ai-usage') return reply({ limitUsd: .1, remainingUsd: .1, resetsAt: new Date(Date.now() + 3600000).toISOString() });
    if (path === '/api/product-types') return reply(['DAIRY', 'MEAT', 'OTHER']);
    if (path === '/api/units') return reply(['GRAM', 'MILLILITER', 'PIECE']);
    if (path === '/api/products/5901234123457') return reply({}, 404);
    if (path === '/api/off/5901234123457') return reply({ status: 1, code: '5901234123457', product: {
      product_name: 'Mleko z OFF', brands: 'OFF marka', categories_tags: ['en:dairies'],
    } });
    if (path === '/api/ai/products/generate') {
      if (generate) return generate(route);
      return reply(status === 200 ? draft : { message: 'unavailable' }, status);
    }
    if (path === '/api/products' && req.method() === 'POST') return reply({ id: 'new-product', ...req.postDataJSON() }, 201);
    return reply([]);
  });
  await page.goto('/');
  await field(page, 'E-mail lub login').fill('test@example.com');
  await field(page, 'Hasło').fill('password1');
  await button(page, 'Zaloguj się').click();
  await expect(page.getByText('Kuchnia', { exact: true })).toBeVisible();
  await button(page, 'Ustawienia').click();
  await button(page, 'Katalog produktów').click();
  await button(page, 'Dodaj produkt').click();
  await expect(button(page, 'Uzupełnij z AI')).toBeEnabled();
  return { calls, errors };
}

test('name -> AI draft -> user edits -> explicit save only', async ({ page }, info) => {
  const { calls, errors } = await setup(page);
  await field(page, 'Nazwa produktu').fill('Mleko');
  await button(page, 'Uzupełnij z AI').click();
  await expect(field(page, 'Dni ważności po otwarciu')).toHaveValue('3');
  await expect(field(page, 'Marka')).toHaveValue('Pilos');
  await expect(button(page, 'Typ produktu')).toContainText('DAIRY');
  await expect(button(page, 'Domyślna jednostka')).toContainText('MILLILITER');
  await expect(page.getByText(/Wartość AI jest szacunkiem/)).toBeVisible();
  expect(calls.filter(c => c.path === '/api/products' && c.method === 'POST')).toHaveLength(0);
  await field(page, 'Marka').fill('Moja marka');
  await field(page, 'Dni ważności po otwarciu').fill('2');
  await page.screenshot({ path: info.outputPath('ai-product-review.png'), fullPage: true });
  await button(page, 'Zapisz produkt').click();
  await expect.poll(() => calls.filter(c => c.path === '/api/products' && c.method === 'POST').length).toBe(1);
  expect(calls.find(c => c.path === '/api/products' && c.method === 'POST').body).toEqual({
    name: 'Mleko', ean: null, brand: 'Moja marka', productType: 'DAIRY', defaultUnit: 'MILLILITER', shelfLifeAfterOpeningDays: 2,
  });
  expect(errors).toEqual([]);
});

test('OFF scan context is sent to AI; manual values including zero survive', async ({ page }) => {
  await page.addInitScript(() => {
    const query = navigator.permissions.query.bind(navigator.permissions);
    navigator.permissions.query = descriptor => descriptor.name === 'camera' ? Promise.resolve({ state: 'granted' }) : query(descriptor);
    navigator.mediaDevices.getUserMedia = async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 640; canvas.height = 480;
      const context = canvas.getContext('2d');
      const stream = canvas.captureStream(10);
      const timer = setInterval(() => context.fillRect(0, 0, 640, 480), 100);
      stream.getTracks()[0].addEventListener('ended', () => clearInterval(timer));
      return stream;
    };
    window.BarcodeDetector = class {
      async detect() { return [{ format: 'ean_13', rawValue: '5901234123457', boundingBox: { x: 0, y: 0, width: 100, height: 50 }, cornerPoints: [] }]; }
    };
  });
  const { calls, errors } = await setup(page);
  await button(page, 'Skanuj kod produktu').click();
  await expect(field(page, 'Nazwa produktu')).toHaveValue('Mleko z OFF');
  await expect(field(page, 'Marka')).toHaveValue('OFF marka');
  expect(calls.filter(c => c.path === '/api/ai/products/generate')).toHaveLength(0);
  await field(page, 'Nazwa produktu').fill('Moja nazwa');
  await field(page, 'Dni ważności po otwarciu').fill('0');
  await button(page, 'Typ produktu').click();
  await page.getByText('MEAT', { exact: true }).click();
  await button(page, 'Uzupełnij z AI').click();
  await expect(page.getByText(/Uzupełniono brakujące pola/)).toBeVisible();
  await expect(field(page, 'Nazwa produktu')).toHaveValue('Moja nazwa');
  await expect(field(page, 'Dni ważności po otwarciu')).toHaveValue('0');
  await expect(button(page, 'Typ produktu')).toContainText('MEAT');
  const request = calls.find(c => c.path === '/api/ai/products/generate').body;
  expect(request.offData).toEqual({ productName: 'Mleko z OFF', brands: 'OFF marka', categoriesTags: ['en:dairies'] });
  expect(request.brand).toBe('OFF marka');
  expect(request.shelfLifeAfterOpeningDays).toBe(0);
  expect(calls.filter(c => c.path === '/api/off/5901234123457')).toHaveLength(1);
  expect(errors).toEqual([]);
});

for (const status of [429, 503]) test(`AI ${status} keeps manual creation available`, async ({ page }) => {
  const { calls, errors } = await setup(page, { status });
  await field(page, 'Nazwa produktu').fill('Mleko');
  await button(page, 'Uzupełnij z AI').click();
  await expect(page.getByRole('alert')).toContainText(status === 429 ? 'Wykorzystano limit AI' : 'AI jest chwilowo niedostępne');
  await expect(field(page, 'Nazwa produktu')).toBeEditable();
  await button(page, 'Typ produktu').click();
  await page.getByText('DAIRY', { exact: true }).click();
  await button(page, 'Domyślna jednostka').click();
  await page.getByText('MILLILITER', { exact: true }).click();
  await button(page, 'Zapisz produkt').click();
  await expect.poll(() => calls.filter(c => c.path === '/api/products' && c.method === 'POST').length).toBe(1);
  expect(errors).toEqual([]);
});

test('cancelled AI response cannot overwrite form or save anything', async ({ page }) => {
  let release;
  const responseGate = new Promise(resolve => { release = resolve; });
  const { calls, errors } = await setup(page, { generate: async route => {
    await responseGate;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(draft) }).catch(() => {});
  } });
  await field(page, 'Nazwa produktu').fill('Mleko');
  await button(page, 'Uzupełnij z AI').click();
  await expect.poll(() => calls.filter(c => c.path === '/api/ai/products/generate').length).toBe(1);
  await expect(button(page, 'Zapisz produkt')).toBeDisabled();
  await button(page, 'Anuluj AI').click();
  await field(page, 'Marka').fill('Ręczna marka');
  release();
  await expect(field(page, 'Marka')).toHaveValue('Ręczna marka');
  await expect(field(page, 'Dni ważności po otwarciu')).toHaveValue('');
  expect(calls.filter(c => c.path === '/api/products' && c.method === 'POST')).toHaveLength(0);
  expect(errors).toEqual([]);
});

test('catalog scanner button opens scanner and cancellation preserves the form', async ({ page }) => {
  await page.addInitScript(() => {
    const query = navigator.permissions.query.bind(navigator.permissions);
    navigator.permissions.query = descriptor => descriptor.name === 'camera' ? Promise.resolve({ state: 'denied' }) : query(descriptor);
  });
  const { calls, errors } = await setup(page);
  await field(page, 'Nazwa produktu').fill('Moje mleko');
  await button(page, 'Skanuj kod produktu').click();
  await expect(page).toHaveURL(/scanner\?mode=catalog/);
  await expect(page.getByText('Potrzebny dostęp do aparatu')).toBeVisible();
  await button(page, 'Wróć').click();
  await expect(field(page, 'Nazwa produktu')).toHaveValue('Moje mleko');
  expect(calls.filter(c => c.path === '/api/ai/products/generate')).toHaveLength(0);
  expect(errors).toEqual([]);
});
