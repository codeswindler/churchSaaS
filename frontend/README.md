# Church Management SaaS Frontend

React + Vite frontend for the multi-tenant church management system.

## What It Includes

- Platform admin login and onboarding setup
- Platform dashboard for customer churches and subscription monitoring
- Church workspace with:
  - live subscription countdown in the header
  - church dashboard overview
  - fund account management
  - manual contribution entry
  - staff user management
  - filtered reports and export actions
- Public giving page at `/c/:churchSlug/give`

## Run Locally

1. Install dependencies:

```bash
npm install
```

2. Set the API URL if needed:

```bash
VITE_API_URL=/api
```

3. Start the app:

```bash
npm run dev
```

## Build and Lint

```bash
npm run build
npm run lint
```

## Notes

- The frontend stores the authenticated session in local storage under `church_saas_session`.
- In local development, `/api` is proxied to `http://127.0.0.1:3000`.
- In production, `/api` should be proxied by Nginx to the backend PM2 process.
- Platform users are routed into `/platform/...`.
- Church staff users are routed into `/church/...`.
- Public contributors use the church-specific route `/c/:slug/give`.
