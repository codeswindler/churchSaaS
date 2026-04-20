# Choice Networks Church SaaS

Multi-tenant church management business system for onboarding churches as customers, managing subscription days, and giving each church its own finance workspace.

## Workspace Layout

- `backend/`: NestJS API with MySQL, M-Pesa, Advanta SMS, church subscriptions, reports, and exports
- `frontend/`: React + Vite admin/public app

## Business Roles

- `platform_admin`: your internal business team
- `church_admin`: manages each church tenant
- `priest`: read-only church overview and exports
- `cashier`: manual contribution entry and ledger access

## Key Features

- Church customers and tenant onboarding
- Subscription day management with add/subtract/suspend/reactivate
- 3-day grace period before suspension
- Live day/hour/minute/second countdown for churches
- Church fund accounts like Tithe, Offering, and Harambee
- Manual cash contributions
- Public M-Pesa giving flow
- Personalized receipt SMS templates per fund account
- Date filtering and CSV/PDF report export

## Quick Start

1. Start MySQL and create a database for the backend.
2. Configure `backend/.env`.
3. Run the backend:

```bash
cd backend
npm install
npm run start:dev
```

4. Run the frontend:

```bash
cd frontend
npm install
npm run dev
```

## Default Entry Points

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:3000/api`
- First-time platform admin setup: `POST /api/auth/platform/setup`

## Production Notes

- Domain: `church.choicenetworks.co.ke`
- Recommended VPS path: `/var/www/churchsaas`
- Recommended process manager: `pm2`
- Recommended frontend serving: static build through `nginx`
- Deployment guide: [DEPLOY.md](./DEPLOY.md)
