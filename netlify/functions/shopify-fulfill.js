// POST /.netlify/functions/shopify-fulfill  body: { orderId, trackingNumber, trackingUrl, carrier }
// Two-step current flow: look up the order's fulfillment orders, then create a fulfillment with tracking.
const { ok, bad } = require('./_lib');
const { shopifyRest } = require('./shopify');
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return ok({});
  if (event.httpMethod !== 'POST') return bad(405, 'POST only');
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return bad(400, 'invalid JSON'); }
  const { orderId, trackingNumber, trackingUrl, carrier = 'Other' } = body;
  if (!orderId) return bad(400, 'orderId required');
  try {
    const fo = await shopifyRest(`/orders/${orderId}/fulfillment_orders.json`);
    const open = (fo.fulfillment_orders || []).filter((f) => f.status === 'open' || f.status === 'in_progress');
    if (!open.length) return bad(409, 'No open fulfillment orders for this order');
    const result = await shopifyRest('/fulfillments.json', {
      method: 'POST',
      body: {
        fulfillment: {
          line_items_by_fulfillment_order: open.map((f) => ({ fulfillment_order_id: f.id })),
          tracking_info: { number: trackingNumber, url: trackingUrl, company: carrier },
          notify_customer: true,
        },
      },
    });
    return ok({ fulfillment: result.fulfillment });
  } catch (e) { return bad(502, String(e.message || e)); }
};
