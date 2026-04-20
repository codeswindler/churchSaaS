# Deployment Guide

This app is prepared to run at `church.choicenetworks.co.ke` with:

- frontend served by Nginx from static files
- backend managed by PM2
- backend isolated on internal port `3200`
- deployment path: `/var/www/churchsaas`

This keeps the app separate from other VPS projects and avoids changing shared public ports beyond adding one Nginx site for this domain.

## 1. Clone Into The Target Directory

```bash
sudo mkdir -p /var/www/churchsaas
sudo chown -R $USER:$USER /var/www/churchsaas
git clone git@github.com:codeswindler/churchSaaS.git /var/www/churchsaas
cd /var/www/churchsaas
```

## 2. Install Dependencies

```bash
cd /var/www/churchsaas/backend
npm ci

cd /var/www/churchsaas/frontend
npm ci
```

## 3. Configure Environment

Backend:

```bash
cp /var/www/churchsaas/backend/.env.example /var/www/churchsaas/backend/.env
```

Update at least:

- `DB_HOST`
- `DB_PORT`
- `DB_USER`
- `DB_PASSWORD`
- `DB_NAME`
- `JWT_SECRET`
- `PORT=3200`
- `APP_NAME=choice-networks-church-saas`
- `FRONTEND_URLS=https://church.choicenetworks.co.ke`
- `MPESA_CALLBACK_URL=https://church.choicenetworks.co.ke/api/payments/mpesa/webhook`

Frontend:

```bash
cp /var/www/churchsaas/frontend/.env.production.example /var/www/churchsaas/frontend/.env.production
```

## 4. Build The Application

```bash
cd /var/www/churchsaas/backend
npm run build

cd /var/www/churchsaas/frontend
npm run build
```

## 5. Start The Backend With PM2

```bash
cd /var/www/churchsaas/backend
pm2 start ecosystem.config.js --env production
pm2 save
pm2 status
```

Expected PM2 app name:

- `churchsaas-api`

## 6. Install The Nginx Site

Copy the provided config:

```bash
sudo cp /var/www/churchsaas/deploy/nginx/church.choicenetworks.co.ke.conf /etc/nginx/sites-available/church.choicenetworks.co.ke
sudo ln -s /etc/nginx/sites-available/church.choicenetworks.co.ke /etc/nginx/sites-enabled/church.choicenetworks.co.ke
```

Test and reload:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## 7. Add SSL

Use your normal Certbot flow after DNS points to the VPS:

```bash
sudo certbot --nginx -d church.choicenetworks.co.ke
```

## Notes

- The frontend calls the backend through `/api`, so Nginx must proxy `/api/` to the backend.
- The backend listens on internal port `3200` in production so it stays separated from other app ports.
- The Nginx config only touches `church.choicenetworks.co.ke`, so it should not interfere with your other projects if their configs remain unchanged.
