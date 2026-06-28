// Thin client for the DaisyShip serverless backend.
const F = '/.netlify/functions';
async function post(path, body) {
  const res = await fetch(`${F}/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `${path} ${res.status}`);
  return data;
}
async function get(path) {
  const res = await fetch(`${F}/${path}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `${path} ${res.status}`);
  return data;
}
export const api = {
  quote: (b) => post('quote', b),
  ship: (b) => post('ship', b),
  shopifyOrders: () => get('shopify-orders'),
  shopifyFulfill: (b) => post('shopify-fulfill', b),
};
