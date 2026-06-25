# DaisyShip

A multi-carrier shipping platform: rate-shop **England Logistics**, **UPS**, and **FedEx**,
mark the rates up per client, buy labels, and run **Shopify** order fulfillment + live
checkout rates. Secrets stay server-side in Netlify Functions; the React app never sees a key.

## Architecture
- **Frontend** — Vite + React (`src/`), Tailwind via CDN. Calls only our own functions.
- **Backend** — Netlify Functions (`netlify/functions/`):
  - `quote` — rate-shops the enabled carriers, applies markup, returns merged quotes.
  - `ship` / `track` — create + track labels through England.
  - `england.js` / `ups.js` / `fedex.js` — carrier clients.
  - `shopify-orders` / `shopify-fulfill` — pull orders, push tracking.
  - `shopify-rates` — live-rate callback for checkout (Carrier Service API).
  - `shopify-register-carrier` — one-time registration of that callback.
  - `shopify-auth` / `shopify-callback` — optional OAuth (skip if using a custom app token).

## Deploy in ~10 minutes

1. **Install + run locally**
   ```bash
   npm install
   npm run dev          # frontend at http://localhost:5173
   ```
   For functions locally: `npm i -g netlify-cli` then `netlify dev`.

2. **Create the site**
   ```bash
   netlify init         # or push to GitHub and "Import" in the Netlify dashboard
   ```

3. **Set environment variables** (Netlify → Site → Settings → Environment variables).
   Copy from `.env.example`. At minimum for England:
   `ENGLAND_API_KEY`, `ENGLAND_CUSTOMER_ID`. Add UPS/FedEx/Shopify as needed.

4. **Deploy**
   ```bash
   netlify deploy --build --prod
   ```

5. **Verify** — open the site, go to **Accounts**, toggle England on, then **Ship** →
   *Get live rates*. Real England rates should come back. (If you see a 401, re-check the key;
   if "customerId not set", add `ENGLAND_CUSTOMER_ID` or type it in the Accounts tab.)

## Shopify setup
- **Custom app (easiest):** Shopify admin → Settings → Apps → Develop apps → create an app,
  enable scopes `read_orders, write_fulfillments, write_shipping`, install, copy the
  **Admin API access token** into `SHOPIFY_TOKEN` and your domain into `SHOPIFY_SHOP`.
- **Live checkout rates:** set `APP_URL`, then POST once to
  `/.netlify/functions/shopify-register-carrier`. Requires the Carrier Service feature
  (Advanced/Plus plan or the carrier-calculated-shipping add-on).

## UPS / FedEx
- **UPS:** create an app on developer.ups.com, get Client ID/Secret, set `UPS_ACCOUNT`
  to your shipper number so negotiated rates return.
- **FedEx:** create a project on developer.fedex.com; the key/secret must be tied to a
  project that has your account number associated. `rateRequestType: ACCOUNT` returns
  negotiated rates.

## Notes / known limits
- `ship.js` posts to England's `/shipments` endpoint with a best-effort body; confirm the
  exact create-shipment schema against England's docs and adjust if a field is rejected.
- The Shopify tab fulfills with a tracking number you provide; wiring "buy label → auto-fulfill"
  end-to-end is a small addition once label creation is confirmed against your account.
