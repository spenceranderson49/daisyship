/* ════════════════════════════════════════════════════════════════════════
   POST /.netlify/functions/quote   —   live England (FedEx/UPS) rates
   ------------------------------------------------------------------------
   Rock Solid / eCommerce Webship API:
     • Auth:  Authorization: RSIS <apiKey>
     • POST /restapi/v1/customers/:customerId/quote   (carrierCode required)
   Requests FedEx + UPS, merges, and folds England's real error message into
   the response so it's visible no matter the app version. Always HTTP 200.
   ════════════════════════════════════════════════════════════════════════ */

const J = (obj) => ({ statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(obj) });
const CARRIER_NAME = { FEDEX: "FedEx", UPS: "UPS", USPS: "USPS", DHL: "DHL" };
const carrierName = (c) => { const k = String(c || "").toUpperCase(); return CARRIER_NAME[k] || (k ? k[0] + k.slice(1).toLowerCase() : "FedEx"); };
const num = (...v) => { for (const x of v) { const n = Number(x); if (!isNaN(n) && n > 0) return n; } return undefined; };
const S = (n) => String(n);

function mapQuotes(data) {
  const quotes = (data && (data.quotes || data.rates)) || [];
  if (!Array.isArray(quotes)) return [];
  return quotes.map((q, i) => {
    const amount = num(q.totalAmount, q.total, q.amount, q.baseAmount) || 0;
    const desc = q.serviceDescription || q.serviceName || q.serviceCode || "Service";
    const code = (q.serviceCode || desc).toString().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    const days = num(q.transitDays, q.deliveryDays, q.businessDaysInTransit);
    return { key: code || ("svc_" + i), carrier: carrierName(q.carrierCode || q.carrier), label: desc, cost: Math.round(amount * 100) / 100, minDays: days, maxDays: days, zone: q.zone };
  }).filter((x) => x.cost > 0);
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod === "OPTIONS") return { statusCode: 204, body: "" };
    if (event.httpMethod !== "POST") return J({ live: false, error: "Use POST", rates: [] });

    let body = {};
    try { body = JSON.parse(event.body || "{}"); } catch { return J({ live: false, error: "Bad JSON body", rates: [] }); }

    const acct = body.account || {};
    const base = (acct.base || process.env.ENGLAND_API_BASE || "https://englandship.rocksolidinternet.com").replace(/\/+$/, "");
    const apiKey = (acct.apiKey || process.env.ENGLAND_API_KEY || "").trim();
    const customerId = (acct.customerId || process.env.ENGLAND_CUSTOMER_ID || "").trim();
    if (!apiKey || !customerId) return J({ live: false, error: "Missing England API key or customer ID.", rates: [] });

    const pieces = (Array.isArray(body.pieces) && body.pieces.length ? body.pieces : [{ weight: body.weight || 1, L: body.L || 12, W: body.W || 9, H: body.H || 4 }])
      .map((p) => ({ weight: S(+p.weight || 1), length: S(+p.length || +p.L || 1), width: S(+p.width || +p.W || 1), height: S(+p.height || +p.H || 1) }));

    const receiver = { country: body.toCountry || "US", zip: String(body.toZip || "").trim() };
    if (body.toCity) receiver.city = body.toCity;
    if (body.toState) receiver.state = body.toState;

    const mkBody = (cc) => ({
      carrierCode: cc,
      serviceCode: "",
      packageTypeCode: "",
      sender: { country: body.fromCountry || "US", zip: String(body.fromZip || "").trim() },
      receiver,
      residential: !!body.residential,
      contentDescription: "Merchandise",
      weightUnit: "lb",
      dimUnit: "in",
      currency: "USD",
      customsCurrency: "USD",
      pieces,
      billing: { party: "sender" },
    });

    const url = base + "/restapi/v1/customers/" + encodeURIComponent(customerId) + "/quote";
    const headers = { "Content-Type": "application/json", "Authorization": "RSIS " + apiKey };

    async function call(reqBody) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 9000);
      try {
        const r = await fetch(url, { method: "POST", headers, body: JSON.stringify(reqBody), signal: ctrl.signal });
        const text = await r.text();
        let data = null; try { data = JSON.parse(text); } catch {}
        return { ok: r.ok, status: r.status, data, text };
      } catch (e) {
        return { ok: false, status: 0, text: e.name === "AbortError" ? "timeout" : (e.message || "network error") };
      } finally { clearTimeout(timer); }
    }

    const carriers = (acct.carriers || process.env.ENGLAND_CARRIERS || "fedex,ups").split(",").map((s) => s.trim()).filter(Boolean);
    let all = [];
    const tried = [];
    let firstErr = null;
    for (const cc of carriers) {
      const res = await call(mkBody(cc));
      const detail = (res.data && (res.data.error || res.data.message || res.data.errorMessage)) || (res.text || "").slice(0, 300);
      tried.push(cc + " → HTTP " + res.status + (res.ok ? "" : (detail ? (": " + detail) : "")));
      if (res.ok) all = all.concat(mapQuotes(res.data));
      else if (!firstErr) firstErr = { status: res.status, detail };
    }

    // de-dupe (carrier+service), cheapest wins, sort
    const seen = {};
    for (const r of all) { const k = r.carrier + "|" + r.key; if (!seen[k] || r.cost < seen[k].cost) seen[k] = r; }
    const rates = Object.values(seen).sort((a, b) => a.cost - b.cost);

    if (rates.length) return J({ live: true, rates });
    if (firstErr) {
      const msg = "England HTTP " + firstErr.status + (firstErr.detail ? (": " + firstErr.detail) : "");
      return J({ live: false, error: msg, england_status: firstErr.status, england_response: firstErr.detail, tried, rates: [] });
    }
    return J({ live: false, error: "England returned no rates for this shipment.", tried, rates: [] });
  } catch (e) {
    return J({ live: false, error: "Function error: " + (e && e.message ? e.message : String(e)), rates: [] });
  }
};
