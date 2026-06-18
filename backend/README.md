# Church Management SaaS Backend

NestJS backend for the multi-tenant church management business system.

## What It Supports

- Platform admin authentication and first-time setup
- Church tenant onboarding with seeded first church admin
- Church subscription control with add days, subtract days, suspend, reactivate, and 3-day grace period
- Church staff users with `church_admin`, `priest`, and `cashier` roles
- Church fund accounts with per-account SMS receipt templates
- Manual cash contributions and public M-Pesa contributions
- Advanta SMS confirmations
- Date-filtered summaries and CSV/PDF report export

## Main API Areas

- `POST /api/auth/platform/setup`
- `POST /api/auth/login`
- `GET /api/platform/dashboard/summary`
- `POST /api/platform/churches`
- `POST /api/platform/churches/:churchId/subscription/add-days`
- `POST /api/platform/churches/:churchId/subscription/subtract-days`
- `POST /api/platform/churches/:churchId/subscription/suspend`
- `POST /api/platform/churches/:churchId/subscription/reactivate`
- `GET /api/church/subscription/status`
- `GET/POST/PATCH /api/church/fund-accounts`
- `GET/POST/PATCH /api/church/users`
- `GET /api/church/contributions`
- `POST /api/church/contributions/manual`
- `GET /api/church/reports/summary`
- `GET /api/church/reports/export?format=csv|pdf`
- `GET /api/public/churches/:slug/config`
- `POST /api/public/churches/:slug/contributions/mpesa`
- `POST /api/payments/mpesa/webhook`
- `POST /api/mobile/auth/login`
- `GET /api/mobile/funds/dashboard`
- `GET /api/mobile/funds/summary`
- `GET /api/mobile/funds/transactions`
- `GET /api/mobile/funds/fund-accounts`
- `GET /api/mobile/notifications`
- `PATCH /api/mobile/notifications/:notificationId/read`
- `GET /api/mobile/fund-display-approvals`
- `POST /api/mobile/fund-display-approvals/:displayId/approve`
- `POST /api/mobile/fund-display-approvals/:displayId/reject`
- `POST /api/mobile/devices`
- `DELETE /api/mobile/devices/:deviceId`

## Android Mobile Funds API

The Android app must authenticate through the backend and never connect directly
to the database. `POST /api/mobile/auth/login` accepts the same church
identifier and password as church web login, but returns a scoped JWT with:

- `tokenUse: "mobile_funds"`
- `scope: ["mobile:funds:read", "mobile:fund-displays:review"]`

The review scope is issued only to active users whose stored role is exactly
`priest`. Approval endpoints recheck the live user role, church tenant, and
subscription status. Existing web controllers continue to reject all
mobile-scoped tokens.

Firebase Cloud Messaging is optional. If these values are not set, confirmed
contributions continue normally and the backend logs the notification it would
have sent:

- `FCM_PROJECT_ID`
- `FCM_CLIENT_EMAIL`
- `FCM_PRIVATE_KEY`

Use the Firebase service-account private key with escaped newlines when storing
it in `.env`, for example `-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----`.

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Copy `.env.example` values into `.env` and fill in:

- MySQL connection
- JWT secret
- M-Pesa sandbox or production credentials
- Advanta SMS credentials

3. Run the API:

```bash
npm run start:dev
```

The backend uses the `/api` prefix, so local endpoints are available under `http://localhost:3000/api/...`.

## Checks

```bash
npm run build
npm run test -- --runInBand
npm run lint
```

## Notes

- Public giving is blocked when a church subscription becomes `suspended`.
- Churches remain fully operational during the 3-day `grace` window.
- Historical contribution and subscription adjustment data is preserved when days are added, removed, or accounts are suspended.
