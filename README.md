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

## Live Deposit Gateway Fix Summary

- Root cause: deposits were created before validating NOWPayments payment id, allowing empty `gatewayPaymentId` values and triggering duplicate-key conflicts.
- Fix: backend now creates gateway order first, validates payment id, then inserts deposit.
- Missing payment id now returns: `Gateway did not return a valid payment ID` (HTTP 502), with no deposit insert.
- Supported NOWPayments id fields: `payment_id`, `id`, `paymentId`, `data.payment_id`, `data.id`.
- Unique indexes are partial so missing/empty placeholders are not indexed as duplicates.

### Cleanup existing bad records
```bash
cd backend
node scripts/cleanupNowpaymentsEmptyGatewayPaymentId.js
```

### Verify in production
1. Create live deposit and confirm `gatewayPaymentId` is non-empty in API response.
2. Confirm deposit row is saved with that id.
3. Complete payment and verify single credit + updated status in history.

### Troubleshooting
- Missing payment id: check gateway/API response and backend logs; request is rejected safely.
- Duplicate key errors: run cleanup script and verify partial unique indexes are active.
- Deposit not appearing in dashboard: check create-live response, deposit status endpoint, and webhook delivery/signature logs.
