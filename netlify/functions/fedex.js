// FedEx Rate API — OAuth client_credentials + /rate/v1/rates/quotes (ACCOUNT = negotiated).
const { env, normShipment } = require('./_lib');
const amt = (v) => (v && typeof v === 'object') ? Number(v.amount) : Number(v);

async function fedexToken() {
  const id = env('FEDEX_CLIENT_ID'), secret = env('FEDEX_CLIENT_SECRET');
  if (!id || !secret) throw new Error('FEDEX_CLIENT_ID / FEDEX_CLIENT_SECRET not set');
  const base = env('FEDEX_API_BASE', 'https://apis.fedex.com');
  const res = await fetch(`${base}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: id, client_secret: secret }),
  });
  if (!res.ok) throw new Error(`FedEx oauth ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()).access_token;
}

async function fedexQuote(rawShipment, { account } = {}) {
  const token = await fedexToken();
  const base = env('FEDEX_API_BASE', 'https://apis.fedex.com');
  const acct = account || env('FEDEX_ACCOUNT');
  const s = normShipment(rawShipment);
  const res = await fetch(`${base}/rate/v1/rates/quotes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'X-locale': 'en_US' },
    body: JSON.stringify({
      accountNumber: { value: acct },
      rateRequestControlParameters: { returnTransitTimes: true },
      requestedShipment: {
        shipper: { address: { postalCode: s.fromZip, countryCode: 'US', residential: false } },
        recipient: { address: { postalCode: s.toZip, countryCode: 'US', residential: s.residential } },
        pickupType: 'DROPOFF_AT_FEDEX_LOCATION',
        rateRequestType: ['ACCOUNT', 'LIST'],
        requestedPackageLineItems: s.pieces.map((p) => ({
          weight: { units: 'LB', value: p.weight },
          dimensions: { length: p.length, width: p.width, height: p.height, units: 'IN' },
        })),
      },
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`FedEx rate ${res.status}: ${text.slice(0, 300)}`);
  const out = (JSON.parse(text).output) || {};
  return (out.rateReplyDetails || []).map((svc) => {
    const rsd = svc.ratedShipmentDetails || [];
    const a = rsd.find((x) => /ACCOUNT|NEGOTIATED|PAYOR_ACCOUNT/i.test(x.rateType || '')) || rsd[0] || {};
    return {
      carrier: 'FEDEX',
      service: (svc.serviceName || svc.serviceType || '').replace(/_/g, ' '),
      serviceCode: svc.serviceType,
      cost: amt(a.totalNetCharge ?? a.totalNetFedExCharge),
      source: 'fedex',
    };
  }).filter((q) => !isNaN(q.cost));
}
module.exports = { fedexToken, fedexQuote };
