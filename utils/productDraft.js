const text = (value, max) => typeof value === "string" ? value.trim().slice(0, max) : "";

export function normalizeOffProduct(payload) {
  if (payload?.status === 0 || !payload?.product) return null;
  const product = payload.product;
  const tags = product.categories_tags ?? product.categoriesTags;
  return {
    productName: text(product.product_name || product.productName || product.name, 255),
    brands: text(product.brands, 255),
    categoriesTags: Array.isArray(tags) ? tags.map(tag => text(tag, 120)).filter(Boolean).slice(0, 40) : [],
  };
}

export function productScanParams(ean, offData, scanResultId) {
  return {
    prefillEan: text(ean, 32),
    prefillName: offData?.productName || "",
    prefillBrand: offData?.brands || "",
    prefillCategories: JSON.stringify(offData?.categoriesTags || []),
    scanResultId,
  };
}

export function parseOpeningDays(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (!/^\d+$/.test(raw) || Number(raw) > 3650) {
    throw new Error("Dni po otwarciu: wpisz liczbę całkowitą od 0 do 3650 albo pozostaw puste pole.");
  }
  return Number(raw);
}

// AI fills blanks only; zero is an intentional value, not a missing field.
export function mergeProductProposal(current, proposal) {
  const filled = value => value !== null && value !== undefined && String(value).trim() !== "";
  const result = { ...current };
  for (const key of ["name", "ean", "brand", "productType", "defaultUnit", "shelfLifeAfterOpeningDays"]) {
    if (!filled(current[key]) && filled(proposal?.[key])) result[key] = proposal[key];
  }
  return result;
}
