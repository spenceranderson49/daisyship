// ============================================================================
//  DaisyShip · Register the carrier service with Shopify  (run ONCE)
//  ---------------------------------------------------------------------------
//  This tells Shopify to start calling your shopify-rates function at checkout.
//  You only run it one time per store.
//
//  WHERE IT LIVES:  netlify/functions/register-carrier.js
//
//  SET THESE IN NETLIFY ENV VARS first:
//    SHOPIFY_SHOP          e.g.  sparkle-in-pink.myshopify.com
//    SHOPIFY_ADMIN_TOKEN   a custom-app Admin API token with "manage shipping" scope
//    RATES_CALLBACK_URL    https://YOUR-SITE.netlify.app/.netlify/functions/shopify-rates
//
//  TO RUN IT:  just open this URL in your browser, once:
//    https://YOUR-SITE.netlify.app/.netlify/functions/register-carrier
//  You'll get back a JSON message saying it worked (or what to fix).
// ============================================================================

const API_VERSION = "2026-01";

exports.handler = async () => {
  const shop = process.env.SHOPIFY_SHOP;
  const token = process.env.SHOPIFY_ADMIN_TOKEN;
  const callback = process.env.RATES_CALLBACK_URL;

  if (!shop || !token || !callback) {
    return out(400, {
      ok: false,
      message: "Missing env vars. Set SHOPIFY_SHOP, SHOPIFY_ADMIN_TOKEN, and RATES_CALLBACK_URL in Netlify, then reload this URL.",
    });
  }

  const base = `https://${shop}/admin/api/${API_VERSION}/carrier_services.json`;
  const headers = {
    "Content-Type": "application/json",
    "X-Shopify-Access-Token": token,
  };

  try {
    // If a DaisyShip service already exists, update it; otherwise create it.
    const existing = await fetch(base, { headers }).then((r) => r.json()).catch(() => ({}));
    const found = (existing.carrier_services || []).find((c) => c.name === "DaisyShip");

    const bodyObj = {
      carrier_service: {
        name: "DaisyShip",
        callback_url: callback,
        service_discovery: true,
        format: "json",
        active: true,
      },
    };

    let res;
    if (found) {
      res = await fetch(`https://${shop}/admin/api/${API_VERSION}/carrier_services/${found.id}.json`, {
        method: "PUT",
        headers,
        body: JSON.stringify(bodyObj),
      });
    } else {
      res = await fetch(base, { method: "POST", headers, body: JSON.stringify(bodyObj) });
    }

    const data = await res.json();
    if (!res.ok) {
      return out(res.status, { ok: false, message: "Shopify rejected the request.", detail: data });
    }
    return out(200, {
      ok: true,
      message: found ? "DaisyShip carrier service UPDATED — live rates are active at checkout." :
                       "DaisyShip carrier service CREATED — live rates are active at checkout.",
      carrier_service: data.carrier_service,
    });
  } catch (e) {
    return out(500, { ok: false, message: "Error contacting Shopify.", detail: String(e) });
  }
};

function out(statusCode, obj) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(obj, null, 2),
  };
}
