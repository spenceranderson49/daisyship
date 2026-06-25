// GET /.netlify/functions/shopify-orders  -> open, unfulfilled orders, simplified for the UI.
const { ok, bad } = require('./_lib');
const { shopifyRest } = require('./shopify');
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return ok({});
  try {
    const data = await shopifyRest('/orders.json?status=open&fulfillment_status=unfulfilled&limit=50');
    const orders = (data.orders || []).map((o) => ({
      id: o.id,
      name: o.name,
      createdAt: o.created_at,
      total: o.total_price,
      currency: o.currency,
      customer: [o.customer?.first_name, o.customer?.last_name].filter(Boolean).join(' ') || (o.email || ''),
      shipTo: o.shipping_address ? {
        name: o.shipping_address.name,
        zip: o.shipping_address.zip,
        city: o.shipping_address.city,
        state: o.shipping_address.province_code,
        country: o.shipping_address.country_code,
        residential: true,
      } : null,
      weight: (o.line_items || []).reduce((w, li) => w + (Number(li.grams) || 0) * (li.quantity || 1), 0) / 453.592,
      items: (o.line_items || []).map((li) => ({ title: li.title, qty: li.quantity })),
    }));
    return ok({ count: orders.length, orders });
  } catch (e) { return bad(502, String(e.message || e)); }
};
