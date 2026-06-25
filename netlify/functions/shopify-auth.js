// GET /.netlify/functions/shopify-auth?shop=your-store.myshopify.com
// Optional OAuth start (only needed if distributing as an installable app; a custom app token skips this).
const { env } = require('./_lib');
exports.handler = async (event) => {
  const shop = (event.queryStringParameters || {}).shop;
  if (!shop) return { statusCode: 400, body: 'shop param required' };
  const apiKey = env('SHOPIFY_API_KEY');
  const scopes = env('SHOPIFY_SCOPES', 'read_orders,write_fulfillments,write_shipping,read_shipping');
  const redirectUri = `${env('APP_URL')}/.netlify/functions/shopify-callback`;
  const state = Math.random().toString(36).slice(2);
  const url = `https://${shop}/admin/oauth/authorize?client_id=${apiKey}&scope=${encodeURIComponent(scopes)}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;
  return { statusCode: 302, headers: { Location: url }, body: '' };
};
