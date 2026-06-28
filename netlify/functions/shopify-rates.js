// ============================================================================
//  DaisyShip · Shopify live checkout rates  (Netlify Function)
//  ---------------------------------------------------------------------------
//  Shopify calls this URL at checkout. It runs your box logic, prices the
//  shipment with your markup, and returns the options the buyer sees.
//
//  WHERE IT LIVES:  netlify/functions/shopify-rates.js
//  ITS PUBLIC URL:  https://YOUR-SITE.netlify.app/.netlify/functions/shopify-rates
//
//  EDIT THE CONFIG BLOCK BELOW — that's the only part you normally touch.
//  Secrets (England API key, etc.) go in Netlify env vars, never in this file.
// ============================================================================

const CONFIG = {
  originZip: "84003",          // where you ship from
  markupPercent: 18,           // YOUR spread on every label (hidden from buyer)
  handlingFee: 0.00,           // flat $ added per order (0 = none)
  freeShippingOver: 75,        // cart subtotal $ that unlocks free standard shipping (0 = off)
  currency: "USD",

  // Services shown at checkout. `name` is what the BUYER sees.
  // base + perLb are the cost model used when live England rates aren't available.
  services: [
    { code: "DS_ECONOMY",  name: "Economy (5–7 business days)",  carrier: "FedEx", minDays: 5, maxDays: 7, base: 7.10, perLb: 0.45 },
    { code: "DS_STANDARD", name: "Standard (3–5 business days)", carrier: "FedEx", minDays: 3, maxDays: 5, base: 8.90, perLb: 0.60 },
    { code: "DS_EXPRESS",  name: "Express (2 business days)",    carrier: "FedEx", minDays: 2, maxDays: 2, base: 17.50, perLb: 1.35 },
    { code: "DS_OVERNIGHT",name: "Overnight",                    carrier: "FedEx", minDays: 1, maxDays: 1, base: 32.00, perLb: 2.60 },
  ],

  // Box catalog — DaisyShip auto-picks the smallest box that fits (inches + lb).
  boxes: [
    { name: "Poly mailer", L: 10, W: 7,  H: 1,  maxWt: 1,  empty: 0.10 },
    { name: "Small box",   L: 8,  W: 6,  H: 4,  maxWt: 10, empty: 0.30 },
    { name: "Medium box",  L: 12, W: 9,  H: 6,  maxWt: 20, empty: 0.50 },
    { name: "Large box",   L: 16, W: 12, H: 8,  maxWt: 35, empty: 0.80 },
    { name: "XL box",      L: 20, W: 16, H: 12, maxWt: 50, empty: 1.20 },
  ],

  // Used to estimate item size when Shopify doesn't send dimensions (it usually doesn't).
  // Set this to a typical item for your store.
  defaultItem: { L: 7, W: 5, H: 2, wt: 0.5 },

  dimDivisor: 139,             // standard DIM-weight divisor
  packingSlack: 1.30,          // 30% empty space allowance for cartonization
};

// ---------------------------------------------------------------------------
//  Box logic (cartonization)
// ---------------------------------------------------------------------------
const vol = (b) => b.L * b.W * b.H;

function pickBox(totalVolume, totalWeight, boxes, slack) {
  const need = totalVolume * slack;
  const sorted = [...boxes].sort((a, b) => vol(a) - vol(b));
  const fit = sorted.find((b) => vol(b) >= need && b.maxWt >= totalWeight);
  if (fit) return { box: fit, count: 1 };
  const big = sorted[sorted.length - 1];
  const count = Math.max(1, Math.ceil(Math.max(need / vol(big), totalWeight / big.maxWt)));
  return { box: big, count };
}

// Billable weight = greater of (real weight) and (dimensional weight), rounded up.
function billableWeight(box, count, realWeight) {
  const dim = Math.ceil((vol(box) * count) / CONFIG.dimDivisor);
  const actual = Math.ceil(realWeight + box.empty * count);
  return Math.max(dim, actual, 1);
}

// ---------------------------------------------------------------------------
//  Zone estimate (rough distance proxy from 3-digit ZIP prefixes)
// ---------------------------------------------------------------------------
function zoneEst(originZip, destZip) {
  const a = parseInt(String(originZip).slice(0, 3) || "840", 10);
  const b = parseInt(String(destZip).slice(0, 3) || "840", 10);
  return Math.min(8, Math.max(2, 2 + Math.round(Math.abs(a - b) / 90)));
}

// ---------------------------------------------------------------------------
//  OPTIONAL: live England Logistics rates.
//  If ENGLAND_API_KEY + ENGLAND_CUSTOMER_ID are set in Netlify, we try them and
//  fall back to the cost model above on any error. Returns a number (cheapest
//  England cost) or null.
// ---------------------------------------------------------------------------
async function englandCheapest(destZip, residential, billWt) {
  const base = process.env.ENGLAND_API_BASE || "https://englandship.rocksolidinternet.com";
  const key = process.env.ENGLAND_API_KEY;
  const customer = process.env.ENGLAND_CUSTOMER_ID;
  if (!key || !customer) return null;
  try {
    const res = await fetch(`${base}/restapi/v1/customers/${customer}/quote`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": key },
      body: JSON.stringify({
        sender: { country: "US", zip: CONFIG.originZip },
        receiver: { country: "US", zip: destZip },
        residential: !!residential,
        pieces: [{ weight: billWt, length: 12, width: 9, height: 4 }],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const quotes = data.quotes || data.rates || [];
    const amounts = quotes.map((q) => Number(q.totalAmount ?? q.amount ?? q.cost)).filter((n) => n > 0);
    return amounts.length ? Math.min(...amounts) : null;
  } catch (e) {
    return null; // never break checkout — fall back to the model
  }
}

// ---------------------------------------------------------------------------
//  Pricing
// ---------------------------------------------------------------------------
function priceService(svc, zone, billWt, englandCost) {
  // If England gave us a live cost, anchor to it; otherwise use the model.
  let cost;
  if (englandCost != null) {
    // scale the live cost across speed tiers relative to Standard
    const factor = { DS_ECONOMY: 0.85, DS_STANDARD: 1.0, DS_EXPRESS: 1.9, DS_OVERNIGHT: 3.2 }[svc.code] || 1;
    cost = englandCost * factor;
  } else {
    cost = (svc.base + svc.perLb * billWt) * (1 + (zone - 2) * 0.06);
  }
  const sell = cost * (1 + CONFIG.markupPercent / 100) + Number(CONFIG.handlingFee || 0);
  return Math.round(sell * 100); // cents
}

// ---------------------------------------------------------------------------
//  Handler
// ---------------------------------------------------------------------------
exports.handler = async (event) => {
  // Shopify only POSTs. Anything else gets an empty (but valid) response.
  if (event.httpMethod !== "POST") {
    return json(200, { rates: [] });
  }

  let payload = {};
  try { payload = JSON.parse(event.body || "{}"); } catch (e) { /* ignore */ }

  const rate = payload.rate || {};
  const dest = rate.destination || {};
  const items = Array.isArray(rate.items) ? rate.items : [];
  const destZip = dest.postal_code || dest.zip || "";
  const residential = dest.residential !== false;

  // --- weights, volume, subtotal from the Shopify cart ---
  const GRAMS_PER_LB = 453.592;
  let realWeight = 0, estVolume = 0, subtotal = 0;
  for (const it of items) {
    const qty = it.quantity || 1;
    const g = (it.grams || 0) * qty;
    realWeight += g / GRAMS_PER_LB;
    const d = CONFIG.defaultItem;
    estVolume += d.L * d.W * d.H * qty;            // estimate (Shopify rarely sends dims)
    subtotal += ((it.price || 0) / 100) * qty;      // item.price is in cents
  }
  if (realWeight <= 0) realWeight = CONFIG.defaultItem.wt;
  if (estVolume <= 0) estVolume = vol(CONFIG.defaultItem);

  // --- box logic ---
  const { box, count } = pickBox(estVolume, realWeight, CONFIG.boxes, CONFIG.packingSlack);
  const billWt = billableWeight(box, count, realWeight);
  const zone = zoneEst(CONFIG.originZip, destZip);

  // --- optional live rate ---
  const englandCost = await englandCheapest(destZip, residential, billWt);

  // --- build the buyer-facing options ---
  let rates = CONFIG.services.map((svc) => ({
    service_name: svc.name,
    service_code: svc.code,
    total_price: String(priceService(svc, zone, billWt, englandCost)),
    description: `${box.name}${count > 1 ? ` ×${count}` : ""}`,
    currency: CONFIG.currency,
    min_delivery_date: addBusinessDays(svc.minDays),
    max_delivery_date: addBusinessDays(svc.maxDays),
  }));

  // --- free shipping: cheapest option becomes free over the threshold ---
  if (CONFIG.freeShippingOver > 0 && subtotal >= CONFIG.freeShippingOver && rates.length) {
    rates.sort((a, b) => Number(a.total_price) - Number(b.total_price));
    rates[0] = { ...rates[0], total_price: "0", service_name: rates[0].service_name + " — FREE" };
  }

  return json(200, { rates });
};

// ---------------------------------------------------------------------------
//  helpers
// ---------------------------------------------------------------------------
function json(statusCode, obj) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(obj),
  };
}

function addBusinessDays(days) {
  const d = new Date();
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) added++;
  }
  return d.toISOString();
}
