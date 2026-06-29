/* ════════════════════════════════════════════════════════════════════════
   POST /.netlify/functions/quote   —   live England (FedEx/UPS) rates
   ------------------------------------------------------------------------
   This version NEVER returns a platform error: every path returns HTTP 200
   with a JSON body, so the app can show you exactly what England said.
   When a quote fails it returns { live:false, error, england_status,
   england_response, sent } so we can see and fix the request shape.
   ════════════════════════════════════════════════════════════════════════ */

const J = (obj) => ({
  statusCode: 200,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(obj),
});

const CARRIER_NAME = { FEDEX: "FedEx", FDX: "FedEx", FXSP: "FedEx", UPS: "UPS", USPS: "USPS", DHL: "DHL" };
const carrierName = (c) => { const k = String(c || "").toUpperCase(); return CARRIER_NAME[k] || (k ? k[0] + k.slice(1).toLowerCase() : "FedEx"); };
const num = (...v) => { for (const x of v) { const n = Number(x); if (!isNaN(n) && n > 0) return n; } return undefined; };

exports.handler = async (event) => {
  try {
    if (event.httpMethod === "OPTIONS") return { statusCode: 204, body: "" };
    if (event.httpMethod !== "POST") return J({ live: false, error: "Use POST", rates: [] });

    let body = {};
    try { body = JSON.parse(event.body || "{}"); } catch { return J({ live: false, error: "Bad JSON body", rates: [] }); }

    const acct = body.account || {};
    const base = (acct.base || process.env.ENGLAND_API_BASE || "https://englandship.rocksolidinternet.com").replace(/\/+$/, "");
    const apiKey = acct.apiKey || process.env.ENGLAND_API_KEY || "";
    const customerId = acct.customerId || process.env.ENGLAND_CUSTOMER_ID || "";
    if (!apiKey || !customerId) return J({ live: false, error: "Missing England API key or customer ID.", rates: [] });

    const pieces = (Array.isArray(body.pieces) && body.pieces.length ? body.pieces : [{ weight: body.weight || 1, L: body.L || 12, W: body.W || 9, H: body.H || 4 }])
      .map((p) => ({
        weight: +p.weight || +p.wt || 1,
        length: +p.length || +p.L || 1,
        width: +p.width || +p.W || 1,
        height: +p.height || +p.H || 1,
      }));

    const payload = {
      sender: { country: body.fromCountry || "US", zip: String(body.fromZip || "").trim() },
      receiver: { country: body.toCountry || "US", zip: String(body.toZip || "").trim() },
      residential: !!body.residential,
      pieces,
    };

    const url = base + "/restapi/v1/customers/" + encodeURIComponent(customerId) + "/quote";
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), parseInt(process.env.RATE_FETCH_TIMEOUT_MS || "10000", 10));

    let r, text;
    try {
      r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": apiKey },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      text = await r.text();
    } catch (e) {
      clearTimeout(timer);
      return J({ live: false, error: e.name === "AbortError" ? "England API timed out." : ("Could not reach England: " + (e.message || e)), url: url, rates: [] });
    }
    clearTimeout(timer);

    let data = null;
    try { data = JSON.parse(text); } catch (e) { /* non-JSON body */ }

    if (!r.ok) {
      const detail = (data && (data.message || data.error || data.errorMessage || data.title)) || (text ? text.slice(0, 600) : "");
      return J({
        live: false,
        error: "England returned HTTP " + r.status,
        england_status: r.status,
        england_response: detail,
        sent: { url: url, from: payload.sender, to: payload.receiver, residential: payload.residential, pieces: payload.pieces },
        rates: [],
      });
    }

    const quotes = (data && (data.quotes || data.rates || data.Quotes || data.results)) || [];
    if (!Array.isArray(quotes) || quotes.length === 0) {
      return J({ live: false, error: "England accepted the request but returned no rates.", england_response: (text || "").slice(0, 600), rates: [] });
    }

    const rates = quotes.map((q, i) => {
      const amount = num(q.totalAmount, q.total, q.amount, q.rate, q.price, q.netCharge, q.totalCharge) || 0;
      const desc = q.serviceDescription || q.serviceName || q.service || q.serviceCode || "Service";
      const code = (q.serviceCode || desc).toString().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
      const days = num(q.transitDays, q.deliveryDays, q.estimatedDeliveryDays, q.commitDays, q.businessDaysInTransit);
      return { key: code || ("svc_" + i), carrier: carrierName(q.carrierCode || q.carrier), label: desc, cost: Math.round(amount * 100) / 100, minDays: days, maxDays: days };
    }).filter((x) => x.cost > 0).sort((a, b) => a.cost - b.cost);

    if (!rates.length) return J({ live: false, error: "Rates came back zero/empty.", england_response: (text || "").slice(0, 600), rates: [] });
    return J({ live: true, rates: rates });
  } catch (e) {
    return J({ live: false, error: "Function error: " + (e && e.message ? e.message : String(e)), rates: [] });
  }
};
