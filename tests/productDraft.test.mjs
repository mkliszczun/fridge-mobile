import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeOffProduct, productScanParams, parseOpeningDays, mergeProductProposal } from '../utils/productDraft.js';

test('OFF snake-case and camel-case responses provide the same bounded context', () => {
  const expected = { productName: 'Mleko', brands: 'Pilos', categoriesTags: ['en:dairies'] };
  assert.deepEqual(normalizeOffProduct({ status: 1, product: { product_name: ' Mleko ', brands: 'Pilos', categories_tags: ['en:dairies'] } }), expected);
  assert.deepEqual(normalizeOffProduct({ status: 1, product: { productName: 'Mleko', brands: 'Pilos', categoriesTags: ['en:dairies'] } }), expected);
});
test('OFF missing product is a manual-entry fallback; oversized or unexpected fields are discarded', () => {
  assert.equal(normalizeOffProduct(null), null);
  assert.equal(normalizeOffProduct({ status: 0, product: {} }), null);
  const result = normalizeOffProduct({ product: { product_name: 'x'.repeat(300), brands: 42,
    categories_tags: [null, {}, ...Array(50).fill('y'.repeat(200))], secret: 'not for AI' } });
  assert.equal(result.productName.length, 255);
  assert.equal(result.brands, '');
  assert.equal(result.categoriesTags.length, 40);
  assert.equal(result.categoriesTags[0].length, 120);
  assert.equal(result.secret, undefined);
});
test('scanner returns EAN and OFF data to add-product without generating or saving', () => {
  assert.deepEqual(productScanParams('5901234123457', null, 'scan-1'), {
    prefillEan: '5901234123457', prefillName: '', prefillBrand: '', prefillCategories: '[]', scanResultId: 'scan-1',
  });
  assert.equal(productScanParams('123', { productName: 'Mleko', brands: 'Pilos', categoriesTags: ['en:dairies'] }, 'scan-2').prefillCategories, '["en:dairies"]');
});
test('AI fills missing fields but never overwrites user values, including zero', () => {
  const current = { name: 'Moje mleko', ean: '123', brand: 'Moja marka', productType: 'OTHER', defaultUnit: null, shelfLifeAfterOpeningDays: 0 };
  assert.deepEqual(mergeProductProposal(current, { name: 'Inne', ean: '456', brand: 'AI', productType: 'DAIRY', defaultUnit: 'MILLILITER', shelfLifeAfterOpeningDays: 3 }),
    { ...current, defaultUnit: 'MILLILITER' });
  assert.equal(mergeProductProposal({ shelfLifeAfterOpeningDays: '' }, { shelfLifeAfterOpeningDays: 0 }).shelfLifeAfterOpeningDays, 0);
});
test('opening days are optional and bounded nonnegative integers, not floats or exponents', () => {
  assert.equal(parseOpeningDays(''), null);
  assert.equal(parseOpeningDays('0'), 0);
  assert.equal(parseOpeningDays('3650'), 3650);
  for (const invalid of ['-1', '1.5', '1,5', '3days', '3651', '1e2', NaN]) assert.throws(() => parseOpeningDays(invalid));
});
