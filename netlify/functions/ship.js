// POST /.netlify/functions/ship  -> creates a label via England.
const { ok, bad } = require('./_lib');
const { englandShip } = require('./england');
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return ok({});
  if (event.httpMethod !== 'POST') return bad(405, 'POST only');
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return bad(400, 'invalid JSON'); }
  const { payload, customerId } = body;
  if (!payload) return bad(400, 'payload required (England shipment object)');
  try { return ok({ shipment: await englandShip(payload, { customerId }) }); }
  catch (e) { return bad(502, String(e.message || e)); }
};
