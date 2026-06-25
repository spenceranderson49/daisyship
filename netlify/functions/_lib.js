// Shared helpers for all DaisyShip serverless functions.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const json = (statusCode, data, extra = {}) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', ...CORS, ...extra },
  body: JSON.stringify(data),
});
const ok = (d) => json(200, d);
const bad = (status, msg) => json(status, { error: msg });
const env = (k, fallback) => (process.env[k] ?? fallback);

// Apply a percent markup to a list of {cost} quotes -> adds sell + margin.
function withMarkup(quotes, markupPct) {
  const m = Number(markupPct) || 0;
  return quotes.map((q) => {
    const sell = Math.round(q.cost * (1 + m / 100) * 100) / 100;
    return { ...q, sell, margin: Math.round((sell - q.cost) * 100) / 100 };
  });
}
// Normalize an incoming shipment into a single canonical shape.
function normShipment(s = {}) {
  const pieces = (s.pieces && s.pieces.length)
    ? s.pieces
    : [{ weight: s.weight, length: s.L ?? s.length, width: s.W ?? s.width, height: s.H ?? s.height }];
  return {
    fromZip: String(s.fromZip ?? s.from_zip ?? ''),
    toZip: String(s.toZip ?? s.to_zip ?? ''),
    residential: !!s.residential,
    signature: !!s.signature,
    pieces: pieces.map((p) => ({
      weight: Number(p.weight) || 1,
      length: Number(p.length) || 1,
      width: Number(p.width) || 1,
      height: Number(p.height) || 1,
    })),
  };
}
module.exports = { CORS, json, ok, bad, env, withMarkup, normShipment };
