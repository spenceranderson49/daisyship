// POST /.netlify/functions/shopify-register-carrier  (run once) -> registers the live-rate callback.
// Requires write_shipping scope + Advanced/Plus plan (or carrier-calculated shipping add-on).
const { ok, bad, env } = require('./_lib');
const { shopifyRest } = require('./shopify');
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return ok({});
  const appUrl = env('APP_URL'); // e.g. https://daisyship.netlify.app
  if (!appUrl) return bad(400, 'APP_URL not set');
  try {
    const result = await shopifyRest('/carrier_services.json', {
      method: 'POST',
      body: {
        carrier_service: {
          name: 'DaisyShip',
          callback_url: `${appUrl}/.netlify/functions/shopify-rates`,
          service_discovery: true,
        },
      },
    });
    return ok({ carrier_service: result.carrier_service });
  } catch (e) { return bad(502, String(e.message || e)); }
};
