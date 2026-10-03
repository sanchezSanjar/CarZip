# Deploying CarZip to a VPS

One Ubuntu server runs everything: the website (Next.js), the API (NestJS) and the batch server, kept alive by PM2,
with nginx in front for the domain and free HTTPS. Replace `example.com` with your domain everywhere.

```
example.com, www.example.com  ->  nginx  ->  website   (port 3000)
api.example.com               ->  nginx  ->  API       (port 3007: GraphQL, uploads, live chat)
                                             batch server (no port, nightly jobs)
MongoDB Atlas (production database, a copy of the development one)
```

## 1. Before you start

- An Ubuntu 22.04/24.04 VPS (1–2 GB RAM is enough) and SSH access to it.
- Your domain, with three **A records** pointing to the server's IP: `@`, `www` and `api`.
- `master` of both repos merged from `develop` (the pull requests).
- The hero video `public/video/hero.mp4` is **not** in git (it's copyrighted). On the server the welcome page shows the
  poster image instead. Add a freely licensed clip later if you want a video.

## 2. Prepare the production database (on your computer)

In the backend's `.env`, add (same Atlas cluster, a new database name at the end):

```env
MONGO_PROD=mongodb+srv://<user>:<password>@<cluster>/carzip_prod
UPLOADS_PUBLIC_URL=https://api.example.com
```

Then copy the development data (demo dealers, buyers, cars, articles, chat) with the photo addresses fixed:

```bash
node deploy/copy-db-to-prod.mjs           # dry run: shows what it would copy
node deploy/copy-db-to-prod.mjs --write   # really copies; your development database is not changed
```

## 3. Set up the server (once)

```bash
# Node.js 24, nginx, certbot, PM2
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt-get install -y nodejs nginx certbot python3-certbot-nginx git
sudo npm install -g pm2

# the code
sudo mkdir -p /var/www/carzip && sudo chown $USER /var/www/carzip && cd /var/www/carzip
git clone -b master https://github.com/sanchezSanjar/CarZip.git
git clone -b master https://github.com/sanchezSanjar/CarZip-next.git
```

**Photos:** copy your local `CarZip/uploads` folder to `/var/www/carzip/CarZip/uploads` on the server
(e.g. `scp -r uploads user@server:/var/www/carzip/CarZip/`).

**Backend settings:** create `/var/www/carzip/CarZip/.env`:

```env
PORT_API=3007
PORT_BATCH=3008
MONGO_PROD=mongodb+srv://<user>:<password>@<cluster>/carzip_prod
SECRET_TOKEN=<a new long random string: openssl rand -hex 48>
CORS_ORIGINS=https://example.com,https://www.example.com
UPLOADS_PUBLIC_URL=https://api.example.com
TRUST_PROXY=1
SOLAPI_API_KEY=...
SOLAPI_API_SECRET=...
SOLAPI_SENDER_NUMBER=...
```

**Website settings:** create `/var/www/carzip/CarZip-next/.env.production`:

```env
NEXT_PUBLIC_API_URL=https://api.example.com
NEXT_PUBLIC_WS_URL=wss://api.example.com
```

## 4. Build and start

```bash
cd /var/www/carzip/CarZip && npm ci && npm test && npm run build
cd /var/www/carzip/CarZip-next && npm ci && npm run build
cd /var/www/carzip/CarZip && pm2 start deploy/ecosystem.config.cjs
pm2 save && pm2 startup     # follow the printed command, so everything starts again after a reboot
```

## 5. Domain and HTTPS

```bash
sudo cp /var/www/carzip/CarZip/deploy/nginx-carzip.conf /etc/nginx/sites-available/carzip
sudo nano /etc/nginx/sites-available/carzip        # replace example.com with your domain
sudo ln -s /etc/nginx/sites-available/carzip /etc/nginx/sites-enabled/carzip
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d example.com -d www.example.com -d api.example.com
```

Open `https://example.com`. Check: cars and photos load, log in works, the live chat says "online".

## 6. Updating later

```bash
cd /var/www/carzip/CarZip && git pull && npm ci && npm test && npm run build && pm2 restart carzip-api carzip-batch
cd /var/www/carzip/CarZip-next && git pull && npm ci && npm run build && pm2 restart carzip-web
```

Logs: `pm2 logs carzip-api` (or `carzip-web`, `carzip-batch`). Status: `pm2 status`.
