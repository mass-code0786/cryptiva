# Cryptiva

Full-stack project scaffold for:
- React + TypeScript + Tailwind + Vite
- Node.js + Express
- MongoDB Atlas (Mongoose)
- JWT authentication
- Render + GitHub deployment

## Start

Backend:
```bash
cd backend
npm install
cp .env.example .env
npm run dev
```

Frontend:
```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

## Render Deployment

Use the Blueprint file:
- [`render.yaml`](./render.yaml)

Create 2 services on Render from this repo:
1. `cryptiva-api` (Node web service)
2. `cryptiva-frontend` (Static site)

Deployment steps:
1. Push this repository to GitHub (`main` branch).
2. In Render, choose `New` -> `Blueprint`.
3. Select this repo and deploy using `render.yaml`.
4. Set required env vars in Render dashboard.
5. Redeploy both services after env vars are saved.

Backend environment variables:
- `MONGO_URI`
- `JWT_SECRET`
- `NOWPAYMENTS_API_KEY`
- `NOWPAYMENTS_IPN_SECRET` (required for webhook verification)
- `NOWPAYMENTS_IPN_URL` (example: `https://api.cryptiva.world/api/webhooks/nowpayments`)
- `CRYPTO_GATEWAY_DEFAULT` (default: `nowpayments`)
- `DEPOSIT_MIN_AMOUNT` (default: `5`)
- `DEPOSIT_AMOUNT_TOLERANCE_PERCENT` (default: `2`)
- `DEPOSIT_PENDING_EXPIRY_HOURS` (default: `2`)
- `DEPOSIT_EXPIRY_INTERVAL_MS` (default: `300000`)
- `DEPOSIT_SUCCESS_NOTIFICATION_ENABLED` (default: `true`)
- `DEPOSIT_SUCCESS_EMAIL_ENABLED` (default: `false`)
- `DEPOSIT_EMAIL_WEBHOOK_URL` (optional)
- `SYSTEM_NOTIFICATION_SENDER_ID` (optional)

Frontend environment variables:
- `VITE_API_URL` (example: `https://api.cryptiva.world/api`)

## Domain Setup (`cryptiva.world`)

Recommended:
- Frontend custom domain: `cryptiva.world` (and optionally `www.cryptiva.world`)
- Backend custom domain: `api.cryptiva.world`

DNS records (at your domain provider):
- `A` record for `cryptiva.world` -> Render frontend target
- `CNAME` record for `www` -> `cryptiva.world`
- `CNAME` record for `api` -> Render backend target

Then set:
- `CLIENT_URL=https://cryptiva.world,https://www.cryptiva.world`
- `NOWPAYMENTS_IPN_URL=https://api.cryptiva.world/api/webhooks/nowpayments`
- `VITE_API_URL=https://api.cryptiva.world/api`

## GitHub Workflow

Workflow file:
- [`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml)

What it does:
- Builds backend and frontend on PR/push to `main`
- On push to `main`, optionally triggers Render deploy hooks via GitHub Secrets:
  - `RENDER_BACKEND_DEPLOY_HOOK`
  - `RENDER_FRONTEND_DEPLOY_HOOK`
