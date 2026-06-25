// Shopify Admin API helpers (token-based; works for custom apps + OAuth-installed apps).
const { env } = require('./_lib');
const API_VERSION = env('SHOPIFY_API_VERSION', '2026-01');

function shopDomain(shopOverride) {
  const shop = shopOverride || env('SHOPIFY_SHOP'); // e.g. your-store.myshopify.com
  if (!shop) throw new Error('SHOPIFY_SHOP not set');
  return shop.replace(/^https?:\/\//, '').replace(/\/$/, '');
}
function token(tokenOverride) {
  const t = tokenOverride || env('SHOPIFY_TOKEN');
  if (!t) throw new Error('SHOPIFY_TOKEN not set (Admin API access token)');
  return t;
}
async function shopifyRest(path, { method = 'GET', body, shop, accessToken } = {}) {
  const url = `https://${shopDomain(shop)}/admin/api/${API_VERSION}${path}`;
  const res = await fetch(url, {
    method,
    headers: { 'X-Shopify-Access-Token': token(accessToken), 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Shopify ${method} ${path} ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
}
module.exports = { shopifyRest, shopDomain, API_VERSION };
