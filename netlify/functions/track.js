// GET /.netlify/functions/track?bookNumber=123&customerId=ABC
const { ok, bad } = require('./_lib');
const { englandTrack } = require('./england');
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return ok({});
  const { bookNumber, customerId } = event.queryStringParameters || {};
  if (!bookNumber) return bad(400, 'bookNumber required');
  try { return ok({ tracking: await englandTrack(bookNumber, { customerId }) }); }
  catch (e) { return bad(502, String(e.message || e)); }
};
