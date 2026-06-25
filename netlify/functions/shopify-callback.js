// GET /.netlify/functions/shopify-callback?code=...&shop=...
// Exchanges the OAuth code for an access token. Persist the token securely (env/secret store) in production.
const { env } = require('./_lib');
exports.handler = async (event) => {
  const { code, shop } = event.queryStringParameters || {};
  if (!code || !shop) return { statusCode: 400, body: 'missing code/shop' };
  const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: env('SHOPIFY_API_KEY'),
      client_secret: env('SHOPIFY_API_SECRET'),
      code,
    }),
  });
  if (!res.ok) return { statusCode: 502, body: `token exchange failed: ${res.status}` };
  const data = await res.json();
  // TODO: store data.access_token against `shop` in a secret store / DB.
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'text/html' },
    body: `<h2>Connected ${shop}</h2><p>Copy this access token into your Netlify env as SHOPIFY_TOKEN:</p><code>${data.access_token}</code>`,
  };
};
