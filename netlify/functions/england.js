// England Logistics API = Rock Solid Internet "eCommerce" API (same platform as XPS Ship).
// Auth: Authorization header with the API key. Customer ID in the URL path.
const { env, normShipment } = require('./_lib');

function base() { return env('ENGLAND_API_BASE', 'https://englandship.rocksolidinternet.com').replace(/\/$/, ''); }

async function englandQuote(rawShipment, { customerId } = {}) {
  const key = env('ENGLAND_API_KEY');
  const cust = customerId || env('ENGLAND_CUSTOMER_ID');
  if (!key) throw new Error('ENGLAND_API_KEY is not set in Netlify env');
  if (!cust) throw new Error('No customerId (pass it from the app or set ENGLAND_CUSTOMER_ID)');
  const s = normShipment(rawShipment);
  const res = await fetch(`${base()}/restapi/v1/customers/${encodeURIComponent(cust)}/quote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: key },
    body: JSON.stringify({
      sender: { country: 'US', zip: s.fromZip },
      receiver: { country: 'US', zip: s.toZip },
      residential: s.residential,
      signatureOptionCode: s.signature ? 'DIRECT' : null,
      weightUnit: 'lb', dimUnit: 'in', currency: 'USD',
      pieces: s.pieces.map((p) => ({
        weight: String(p.weight), length: String(p.length), width: String(p.width), height: String(p.height),
      })),
      billing: { party: 'sender' },
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`England ${res.status}: ${text.slice(0, 300)}`);
  const data = JSON.parse(text);
  return (data.quotes || []).map((q) => ({
    carrier: (q.carrierCode || '').toUpperCase(),
    service: q.serviceDescription || q.serviceCode || 'Service',
    serviceCode: q.serviceCode,
    cost: Number(q.totalAmount),
    baseAmount: q.baseAmount != null ? Number(q.baseAmount) : null,
    zone: q.zone || null,
    source: 'england',
  })).filter((q) => !isNaN(q.cost));
}

// Create a real shipment / label through England.
async function englandShip(payload, { customerId } = {}) {
  const key = env('ENGLAND_API_KEY');
  const cust = customerId || env('ENGLAND_CUSTOMER_ID');
  const res = await fetch(`${base()}/restapi/v1/customers/${encodeURIComponent(cust)}/shipments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: key },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`England ship ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

async function englandTrack(bookNumber, { customerId } = {}) {
  const key = env('ENGLAND_API_KEY');
  const cust = customerId || env('ENGLAND_CUSTOMER_ID');
  const res = await fetch(`${base()}/restapi/v1/customers/${encodeURIComponent(cust)}/shipments/${encodeURIComponent(bookNumber)}`, {
    headers: { Authorization: key },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`England track ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}
module.exports = { englandQuote, englandShip, englandTrack };
