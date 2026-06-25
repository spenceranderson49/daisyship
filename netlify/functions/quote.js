// POST /.netlify/functions/quote
// body: { carriers:["england","ups","fedex"], shipment, customerId, account:{ups,fedex}, markup }
// Returns merged, marked-up quotes across all requested carriers.
const { ok, bad } = require('./_lib');
const { englandQuote } = require('./england');
const { upsRateShop } = require('./ups');
const { fedexQuote } = require('./fedex');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return ok({});
  if (event.httpMethod !== 'POST') return bad(405, 'POST only');
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return bad(400, 'invalid JSON'); }
  const { carriers = ['england'], shipment, customerId, account = {}, markup = 0 } = body;
  if (!shipment) return bad(400, 'shipment required');

  const tasks = [];
  if (carriers.includes('england')) tasks.push(wrap('england', englandQuote(shipment, { customerId })));
  if (carriers.includes('ups')) tasks.push(wrap('ups', upsRateShop(shipment, { account: account.ups })));
  if (carriers.includes('fedex')) tasks.push(wrap('fedex', fedexQuote(shipment, { account: account.fedex })));

  const settled = await Promise.all(tasks);
  const m = Number(markup) || 0;
  const quotes = [];
  const errors = {};
  for (const r of settled) {
    if (r.error) { errors[r.carrier] = r.error; continue; }
    for (const q of r.quotes) {
      const sell = Math.round(q.cost * (1 + m / 100) * 100) / 100;
      quotes.push({ ...q, sell, margin: Math.round((sell - q.cost) * 100) / 100 });
    }
  }
  quotes.sort((a, b) => a.sell - b.sell);
  return ok({ count: quotes.length, quotes, errors });
};

async function wrap(carrier, p) {
  try { return { carrier, quotes: await p }; }
  catch (e) { return { carrier, error: String(e.message || e) }; }
}
