// Shopify Carrier Service callback: live rates at checkout.
// Shopify POSTs { rate: { origin, destination, items, currency } } and expects { rates: [...] }.
// We quote England (default) + apply markup, and return Shopify-formatted rate objects (price in cents).
const { ok, bad, env } = require('./_lib');
const { englandQuote } = require('./england');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return ok({});
  if (event.httpMethod !== 'POST') return ok({ rates: [] });
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return ok({ rates: [] }); }
  const r = body.rate || {};
  const markup = Number(env('SHOPIFY_RATE_MARKUP', '0')) || 0;
  const totalGrams = (r.items || []).reduce((g, it) => g + (Number(it.grams) || 0) * (it.quantity || 1), 0);
  const shipment = {
    fromZip: r.origin?.postal_code || env('DEFAULT_ORIGIN_ZIP', ''),
    toZip: r.destination?.postal_code || '',
    residential: true,
    pieces: [{ weight: Math.max(totalGrams / 453.592, 0.1), length: 6, width: 6, height: 4 }],
  };
  try {
    const quotes = await englandQuote(shipment, {});
    const rates = quotes.map((q) => {
      const sell = q.cost * (1 + markup / 100);
      return {
        service_name: q.service,
        service_code: q.serviceCode || q.service,
        total_price: String(Math.round(sell * 100)), // cents
        currency: r.currency || 'USD',
        description: `${q.carrier} via England`,
      };
    });
    return ok({ rates });
  } catch (e) {
    // Returning empty rates is the safe failure mode at checkout.
    return ok({ rates: [], _error: String(e.message || e) });
  }
};
