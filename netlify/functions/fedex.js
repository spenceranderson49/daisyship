/* ════════════════════════════════════════════════════════════════════════
   POST /.netlify/functions/fedex   —   live FedEx APIs (production)
   ------------------------------------------------------------------------
   action:"transit"  → Rate & Transit Times  (POST /rate/v1/rates/quotes)
                       returns per-service transit days + delivery date
   action:"address"  → Address Validation    (POST /address/v1/addresses/resolve)
                       returns RESIDENTIAL / BUSINESS classification
   OAuth: POST /oauth/token (client_credentials). Creds from env:
     FEDEX_API_KEY, FEDEX_SECRET_KEY, FEDEX_ACCOUNT  (body can override).
   Always returns HTTP 200 + JSON.
   ════════════════════════════════════════════════════════════════════════ */

const J = (o) => ({ statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(o) });
const S = (v) => (v == null ? "" : String(v));
const DAYS = { ZERO_DAYS:0, ONE_DAY:1, TWO_DAYS:2, THREE_DAYS:3, FOUR_DAYS:4, FIVE_DAYS:5, SIX_DAYS:6, SEVEN_DAYS:7, EIGHT_DAYS:8, NINE_DAYS:9, TEN_DAYS:10, ELEVEN_DAYS:11, TWELVE_DAYS:12 };

let _tok = null; // { token, exp }  in-memory cache across warm invocations

function creds(body) {
  const a = body.account || {};
  return {
    base: (a.base || process.env.FEDEX_API_BASE || "https://apis.fedex.com").replace(/\/+$/, ""),
    key: S(a.apiKey || process.env.FEDEX_API_KEY).trim(),
    secret: S(a.secret || process.env.FEDEX_SECRET_KEY).trim(),
    account: S(a.account || process.env.FEDEX_ACCOUNT).trim(),
  };
}

async function token(c) {
  if (_tok && _tok.exp > Date.now() + 30000) return _tok.token;
  const r = await fetch(c.base + "/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials&client_id=" + encodeURIComponent(c.key) + "&client_secret=" + encodeURIComponent(c.secret),
  });
  const text = await r.text();
  let d = null; try { d = JSON.parse(text); } catch {}
  if (!r.ok || !d || !d.access_token) throw new Error("FedEx auth HTTP " + r.status + (d && d.errors ? ": " + JSON.stringify(d.errors) : (text ? ": " + text.slice(0, 200) : "")));
  _tok = { token: d.access_token, exp: Date.now() + (Number(d.expires_in || 3500) * 1000) };
  return _tok.token;
}

function fmtDate(s) { if (!s) return null; const d = new Date(s.length <= 10 ? s + "T00:00:00" : s); return isNaN(d) ? null : d.toISOString().slice(0, 10); }

async function transit(c, body, tk) {
  const today = new Date().toISOString().slice(0, 10);
  const payload = {
    accountNumber: { value: c.account },
    requestedShipment: {
      shipper: { address: { postalCode: S(body.fromZip), countryCode: body.fromCountry || "US", residential: false } },
      recipient: { address: { postalCode: S(body.toZip), countryCode: body.toCountry || "US", residential: !!body.residential } },
      pickupType: "DROPOFF_AT_FEDEX_LOCATION",
      rateRequestType: ["ACCOUNT"],
      shipDateStamp: body.shipDate || today,
      requestedPackageLineItems: (Array.isArray(body.pieces) && body.pieces.length ? body.pieces : [{ weight: body.weight || 1 }]).map((p) => ({ weight: { units: "LB", value: Number(p.weight || p.wt || 1) } })),
    },
  };
  const r = await fetch(c.base + "/rate/v1/rates/quotes", {
    method: "POST",
    headers: { "Authorization": "Bearer " + tk, "Content-Type": "application/json", "X-locale": "en_US" },
    body: JSON.stringify(payload),
  });
  const text = await r.text();
  let d = null; try { d = JSON.parse(text); } catch {}
  if (!r.ok) return { ok: false, error: "FedEx rate HTTP " + r.status + (d && d.errors ? ": " + (d.errors[0] && d.errors[0].message || JSON.stringify(d.errors)) : (text ? ": " + text.slice(0, 250) : "")) };
  const details = (d && d.output && d.output.rateReplyDetails) || [];
  try { console.log("FEDEX transit count=" + details.length + " sample=" + JSON.stringify((details[0] && { svc: details[0].serviceType, commit: details[0].commit, op: details[0].operationalDetail }) || {}).slice(0, 700)); } catch (e) {}
  const services = details.map((s) => {
    const op = s.operationalDetail || {};
    const commit = s.commit || {};
    const dd = commit.dateDetail || {};
    const td = commit.transitDays || {};
    // FedEx puts the transit enum at commit.transitTime (sometimes operationalDetail.transitTime)
    const transitEnum = commit.transitTime || op.transitTime || td.description || td.minimumTransitTime || null;
    const days = transitEnum && DAYS[transitEnum] != null ? DAYS[transitEnum] : null;
    // and the delivery date at commit.dateDetail.dayCxsFormat (sometimes .date / operationalDetail.deliveryDate)
    const deliveryDate = fmtDate(dd.dayCxsFormat || dd.date || op.deliveryDate || op.commitDate || commit.commitTimestamp);
    return { serviceType: s.serviceType, serviceName: s.serviceName || s.serviceType, transitDays: days, transitLabel: transitEnum ? String(transitEnum).replace(/_/g, " ").toLowerCase() : null, deliveryDate, deliveryDay: dd.dayOfWeek || op.deliveryDay || null };
  }).filter((x) => x.serviceType);
  return { ok: true, services };
}

async function address(c, body, tk) {
  const a = body.address || {};
  const lines = [a.address1, a.address2].filter(Boolean).map(S);
  const payload = { addressesToValidate: [{ address: { streetLines: lines.length ? lines : [""], city: S(a.city), stateOrProvinceCode: S(a.state), postalCode: S(a.zip), countryCode: a.country || "US" } }] };
  const r = await fetch(c.base + "/address/v1/addresses/resolve", {
    method: "POST",
    headers: { "Authorization": "Bearer " + tk, "Content-Type": "application/json", "X-locale": "en_US" },
    body: JSON.stringify(payload),
  });
  const text = await r.text();
  let d = null; try { d = JSON.parse(text); } catch {}
  if (!r.ok) return { ok: false, error: "FedEx address HTTP " + r.status + (d && d.errors ? ": " + (d.errors[0] && d.errors[0].message || JSON.stringify(d.errors)) : (text ? ": " + text.slice(0, 250) : "")) };
  const res = (d && d.output && d.output.resolvedAddresses && d.output.resolvedAddresses[0]) || null;
  if (!res) return { ok: true, classification: "UNKNOWN", resolved: null };
  try { console.log("FEDEX address classification=" + res.classification + " attrs=" + JSON.stringify(res.attributes || {}).slice(0, 400)); } catch (e) {}
  let cls = (res.classification || (res.attributes && res.attributes.Classification) || "UNKNOWN").toUpperCase();
  const attrs = res.attributes || {};
  return {
    ok: true,
    classification: cls,                 // RESIDENTIAL | BUSINESS | MIXED | UNKNOWN
    residential: cls === "RESIDENTIAL",
    deliverable: attrs.Resolved === "true" || attrs.DPV === "true" || res.customerMessages == null,
    resolved: {
      streetLines: res.streetLinesToken || res.streetLines || null,
      city: res.city, state: res.stateOrProvinceCode, zip: res.postalCode, country: res.countryCode,
    },
    attributes: attrs,
  };
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod === "OPTIONS") return { statusCode: 204, body: "" };
    if (event.httpMethod !== "POST") return J({ ok: false, error: "Use POST" });
    let body = {}; try { body = JSON.parse(event.body || "{}"); } catch { return J({ ok: false, error: "Bad JSON body" }); }

    const c = creds(body);
    if (!c.key || !c.secret) return J({ ok: false, error: "Missing FedEx API key/secret (set FEDEX_API_KEY and FEDEX_SECRET_KEY env vars)." });

    let tk;
    try { tk = await token(c); } catch (e) { return J({ ok: false, error: e.message }); }

    if (body.action === "address") {
      const out = await address(c, body, tk);
      return J(out);
    }
    // default: transit
    if (!c.account) return J({ ok: false, error: "Missing FedEx account number (set FEDEX_ACCOUNT env var)." });
    const out = await transit(c, body, tk);
    return J(out);
  } catch (e) {
    return J({ ok: false, error: "Function error: " + (e && e.message ? e.message : String(e)) });
  }
};
