// UPS Rating API — OAuth client_credentials + /rating/{ver}/Shop with negotiated rates.
const { env, normShipment } = require('./_lib');

const UPS_SERVICES = {
  '01': 'UPS Next Day Air', '02': 'UPS 2nd Day Air', '03': 'UPS Ground',
  '12': 'UPS 3 Day Select', '13': 'UPS Next Day Air Saver', '14': 'UPS Next Day Air Early',
  '59': 'UPS 2nd Day Air A.M.', '07': 'UPS Worldwide Express', '08': 'UPS Worldwide Expedited',
  '11': 'UPS Standard', '54': 'UPS Worldwide Express Plus', '65': 'UPS Worldwide Saver',
};

async function upsToken() {
  const id = env('UPS_CLIENT_ID'), secret = env('UPS_CLIENT_SECRET');
  if (!id || !secret) throw new Error('UPS_CLIENT_ID / UPS_CLIENT_SECRET not set');
  const oauthBase = env('UPS_OAUTH_BASE', 'https://onlinetools.ups.com');
  const res = await fetch(`${oauthBase}/security/v1/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64'),
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error(`UPS oauth ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()).access_token;
}

async function upsRateShop(rawShipment, { account } = {}) {
  const token = await upsToken();
  const apiBase = env('UPS_API_BASE', 'https://onlinetools.ups.com');
  const ver = env('UPS_RATE_VERSION', 'v1');
  const shipper = account || env('UPS_ACCOUNT');
  const s = normShipment(rawShipment);
  const body = {
    RateRequest: {
      Request: { RequestOption: 'Shop' },
      Shipment: {
        Shipper: { ShipperNumber: shipper, Address: { PostalCode: s.fromZip, CountryCode: 'US' } },
        ShipFrom: { Address: { PostalCode: s.fromZip, CountryCode: 'US' } },
        ShipTo: {
          Address: {
            PostalCode: s.toZip, CountryCode: 'US',
            ...(s.residential ? { ResidentialAddressIndicator: 'Y' } : {}),
          },
        },
        Package: s.pieces.map((p) => ({
          PackagingType: { Code: '02' },
          Dimensions: { UnitOfMeasurement: { Code: 'IN' }, Length: String(p.length), Width: String(p.width), Height: String(p.height) },
          PackageWeight: { UnitOfMeasurement: { Code: 'LBS' }, Weight: String(p.weight) },
        })),
        ShipmentRatingOptions: { NegotiatedRatesIndicator: 'Y' },
      },
    },
  };
  const res = await fetch(`${apiBase}/api/rating/${ver}/Shop`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json', Authorization: `Bearer ${token}`,
      transId: String(Date.now()), transactionSrc: 'daisyship',
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`UPS rate ${res.status}: ${text.slice(0, 300)}`);
  const data = JSON.parse(text);
  let rs = data?.RateResponse?.RatedShipment || [];
  if (!Array.isArray(rs)) rs = [rs];
  return rs.map((r) => {
    const neg = r?.NegotiatedRateCharges?.TotalCharge?.MonetaryValue;
    const pub = r?.TotalCharges?.MonetaryValue;
    const code = r?.Service?.Code;
    return {
      carrier: 'UPS',
      service: UPS_SERVICES[code] || `UPS ${code || ''}`.trim(),
      serviceCode: code,
      cost: Number(neg ?? pub),
      negotiated: neg != null,
      source: 'ups',
    };
  }).filter((q) => !isNaN(q.cost));
}
module.exports = { upsToken, upsRateShop };
