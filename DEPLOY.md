# Deploy DaisyShip to Netlify

Pick ONE of the two reliable paths. Both deploy the frontend **and** the serverless
functions (drag-and-drop alone won't run functions, so it's not used here).

---

## Path A — Netlify CLI (fastest, ~3 commands)

```bash
# 1. unzip, then from inside the daisyship/ folder:
npm install
npx netlify-cli login        # opens browser, log in once
npx netlify-cli deploy --build --prod
```
The CLI creates the site, runs the build, and uploads the functions. It prints your
live URL (e.g. https://daisyship-xxxx.netlify.app).

Or just run the helper:
```bash
./deploy.sh
```

---

## Path B — GitHub import (no terminal build)

1. Put this folder in a new GitHub repo (GitHub Desktop or `git init && git push`).
2. Netlify dashboard → **Add new site → Import an existing project** → pick the repo.
3. Netlify auto-detects: build `npm run build`, publish `dist`, functions `netlify/functions`.
4. Deploy.

---

## Set your keys (required for live rates)

Netlify → **Site configuration → Environment variables** → add these, then
**Deploys → Trigger deploy → Deploy site** once so functions pick them up:

| Variable | Value |
|---|---|
| `ENGLAND_API_BASE` | `https://englandship.rocksolidinternet.com` |
| `ENGLAND_API_KEY` | *(the key England gave you)* |
| `ENGLAND_CUSTOMER_ID` | *(your England customer id)* |

UPS / FedEx / Shopify variables are in `.env.example` — add them only when you want
those carriers or store sync.

---

## Test it's live
Open the site → **Accounts** → England on → **Ship** → *Get live rates*.
Real England rates = success. If you get an error, copy the red message back to me
and I'll pinpoint the fix (most likely a single field name).
