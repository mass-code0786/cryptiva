# Cryptiva Backend API

Node.js + Express + MongoDB backend for authentication, wallet, referral, and transaction features.

## Setup

1. Create `.env` in `backend/`:

```env
PORT=5000
MONGO_URI=mongodb://127.0.0.1:27017/cryptiva
JWT_SECRET=replace-with-strong-secret
CLIENT_URL=http://localhost:5173
ADMIN_EMAILS=
```

Production example:
```env
CLIENT_URL=https://cryptiva.world,https://www.cryptiva.world
```

2. Install dependencies:

```bash
npm install
```

3. Run server:

```bash
npm run dev
```

## API Endpoints

Base URL: `/api`

### Auth

- `POST /auth/register`
  - body: `{ "name": "John", "email": "john@mail.com", "password": "secret123", "pin": "1234", "referralCode": "CRY-XXXX" }`
- `POST /auth/login`
  - body: `{ "email": "john@mail.com", "password": "secret123" }`

### Wallet (JWT Required)

- `GET /wallet`
  - returns `depositWallet`, `withdrawalWallet`, `tradingBalance`, and totals
- `POST /wallet/deposit`
  - body: `{ "amount": 100 }`
- `POST /wallet/withdraw`
  - body: `{ "amount": 20, "pin": "1234" }`
- `POST /wallet/trade`
  - body: `{ "amount": 50 }` (moves from `depositWallet` to `tradingBalance`)
- `POST /wallet/transfer`
  - body: `{ "amount": 10 }` (moves from `withdrawalWallet` to `depositWallet`)

### Referrals (JWT Required)

- `GET /referrals`
  - direct referral list
- `GET /referrals/summary`
  - referral code + team business summary
- `GET /referrals/tree?depth=3`
  - nested referral tree from `referredBy` relation
- `GET /referrals/income`
  - direct income, level income, total income
- `GET /referrals/income-history?page=1&limit=20&incomeType=direct`
  - referral income history stored in MongoDB

### Transactions (JWT Required)

- `GET /transactions?page=1&limit=20&type=deposit`
  - paginated transaction history

### Deposits (JWT Required)

- `POST /deposit/create`
  - body: `{ "amount": 100, "currency": "USDT", "network": "BEP20", "txHash": "0x..." }`
- `POST /deposit`
  - alias of `/deposit/create`
- `GET /deposit/history?page=1&limit=20`
  - returns MongoDB deposit history
- `GET /deposit/status/:id`
  - returns deposit and transaction status

### Withdrawals (JWT Required)

- `POST /withdrawals`
  - body: `{ "amount": 20, "pin": "1234", "currency": "USDT", "network": "BEP20" }`
  - checks withdrawal wallet balance and creates pending withdrawal
- `POST /withdraw`
  - alias of `/withdrawals`
- `GET /withdrawals/history?page=1&limit=20`
  - returns withdrawal history from MongoDB
- `GET /withdrawals/status/:id`
  - returns withdrawal and transaction status

### Admin Withdrawal Approval (Admin JWT Required)

- `GET /admin/users?search=&page=1&limit=20`
  - view users
- `GET /admin/deposits?status=pending&page=1&limit=20`
  - view deposits
- `PATCH /admin/deposits/:depositId/approve`
  - approve deposit and credit wallet
- `PATCH /admin/deposits/:depositId/reject`
  - reject deposit
- `GET /admin/withdrawals`
  - list all withdrawal requests
- `PATCH /admin/withdrawals/:withdrawalId/approve`
  - mark pending withdrawal as completed
- `PATCH /admin/withdrawals/:withdrawalId/reject`
  - body: `{ "reason": "Invalid request" }`
  - mark as rejected and refund amount to user withdrawal wallet
- `GET /admin/transactions?type=deposit&status=pending&userId=<mongoUserId>&page=1&limit=20`
  - view transactions
- `GET /admin/team-business?userId=<mongoUserId>`
  - view team business by user
- `GET /admin/team-business?page=1&limit=20`
  - paginated team business overview for users

### Salary Rank System

- Rank table: `L1` to `L8`
- Rank checks use:
  - `mainLegBusiness`
  - `otherLegBusiness`
- Weekly salary is distributed based on current eligible rank.

Endpoints:
- `GET /salary-progress` (JWT required)
  - returns current rank, next rank, main leg business, other legs business, and progress percentage
- `GET /salary-progress/history` (JWT required)
  - returns weekly salary payout history for logged-in user
- `POST /salary-progress/distribute-weekly` (Admin JWT required)
  - triggers weekly salary distribution for all users
  - optional body: `{ "runDate": "2026-03-16T00:00:00.000Z" }`

### Trading Engine

- Investment source: `depositWallet`
- ROI interval: every minute (background engine)
- ROI credit destination: `withdrawalWallet`
- ROI stop condition: investment limit reached

Endpoints:
- `POST /trade/place` (JWT required)
  - body: `{ "amount": 100 }`
- `POST /trade` (JWT required)
  - alias of `/trade/place`
- `GET /trade/status` (JWT required)
  - returns trade list and engine config

Optional env:
- `ROI_RATE_PER_MINUTE=0.001`
- `TRADE_LIMIT_MULTIPLIER=2`

## Folder Structure

```text
src/
  controllers/
  middleware/
  models/
  routes/
  server.js
```
