#!/usr/bin/env bash
# DaisyShip one-shot deploy. Run from the project folder.
set -e
echo "→ Installing frontend deps (functions need none)…"
npm install
echo "→ Deploying to Netlify (builds the app + bundles functions)…"
npx netlify-cli deploy --build --prod
echo "✓ Done. Now set your env vars in the Netlify dashboard (see DEPLOY.md) and redeploy once."
