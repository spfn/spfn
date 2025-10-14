# SPFN Deployment Guide

Complete guide for deploying your SPFN application to production.

## Overview

SPFN applications consist of two parts:
- **Frontend**: Next.js (port 3790)
- **Backend**: Hono API server (port 8790)

You can deploy them together or separately depending on your needs.

---

## 🧪 Local Production Testing

Test your production build locally before deploying:

```bash
# 1. Build for production
npm run spfn:build

# 2. Start production server
npm run spfn:start
```

You should see the SPFN server starting:

```
   ╭─────────────────────────────────────╮
   │    _____ ____  ______ _   _        │
   │   / ____|  _ \|  ____| \ | |       │
   │  | (___ | |_) | |__  |  \| |       │
   │   \___ \|  __/|  __| | . ` |       │
   │   ____) | |   | |    | |\  |       │
   │  |_____/|_|   |_|    |_| \_|       │
   │                                     │
   │  Mode: Production                  │
   ╰─────────────────────────────────────╯

   ▲ Local:        http://localhost:8790
   ▲ Network:      http://0.0.0.0:8790
```

Test your API:

```bash
# 3. Test backend
curl http://localhost:8790/health

# 4. Test frontend
curl http://localhost:3790
```

---

## 🐳 Docker Deployment (Recommended)

Perfect for VPS, EC2, DigitalOcean, or any server with Docker.

### Quick Start with Docker

```bash
# Build and run with Docker Compose
docker compose -f docker-compose.production.yml up --build -d

# Your app is now running:
# - Frontend: http://localhost:3790
# - Backend: http://localhost:8790
```

### Prerequisites

- Docker installed on server
- `.env` file with production values

### Setup on VPS

1. **SSH into your server**
   ```bash
   ssh user@your-server-ip
   ```

2. **Install Docker**
   ```bash
   # Ubuntu/Debian
   curl -fsSL https://get.docker.com -o get-docker.sh
   sudo sh get-docker.sh

   # Start Docker
   sudo systemctl start docker
   sudo systemctl enable docker
   ```

3. **Clone your repository**
   ```bash
   git clone https://github.com/your-username/your-project.git
   cd your-project
   ```

4. **Create `.env` file**
   ```bash
   # Copy example and edit
   cp .env.local.example .env

   # Edit with production values
   nano .env
   ```

   Production environment variables:
   ```bash
   DATABASE_URL=postgresql://user:password@postgres:5432/dbname
   REDIS_URL=redis://redis:6379
   POSTGRES_PASSWORD=your-secure-password
   NEXT_PUBLIC_API_URL=https://api.yourdomain.com
   NODE_ENV=production
   ```

5. **Deploy**
   ```bash
   docker compose -f docker-compose.production.yml up -d
   ```

6. **View logs**
   ```bash
   docker compose logs -f
   ```

### Updates

```bash
# Pull latest code
git pull origin main

# Rebuild and restart
docker compose -f docker-compose.production.yml up --build -d
```

### Setup Reverse Proxy (Nginx)

For custom domains with SSL:

```nginx
# /etc/nginx/sites-available/myapp

# Frontend
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:3790;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}

# Backend API
server {
    listen 80;
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://localhost:8790;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

Enable site:
```bash
sudo ln -s /etc/nginx/sites-available/myapp /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### Add SSL with Let's Encrypt

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com -d api.yourdomain.com
```

---

## ☁️ Platform as a Service

### Railway

Railway automatically detects and deploys Docker projects.

1. **Install Railway CLI**
   ```bash
   npm install -g @railway/cli
   ```

2. **Login and initialize**
   ```bash
   railway login
   railway init
   ```

3. **Add services**
   ```bash
   railway add --database postgres
   railway add --database redis
   ```

4. **Set environment variables**
   ```bash
   # Railway auto-sets DATABASE_URL and REDIS_URL
   railway variables set NEXT_PUBLIC_API_URL=https://your-app.railway.app
   ```

5. **Deploy**
   ```bash
   railway up
   ```

Railway will:
- Build your Docker image
- Deploy to production
- Provide a public URL

### Render

1. **Create `render.yaml`** in project root:
   ```yaml
   services:
     - type: web
       name: myapp
       env: docker
       dockerfilePath: ./Dockerfile
       envVars:
         - key: DATABASE_URL
           fromDatabase:
             name: myapp-db
             property: connectionString
         - key: REDIS_URL
           fromDatabase:
             name: myapp-redis
             property: connectionString

   databases:
     - name: myapp-db
       databaseName: myapp
       user: myapp

     - name: myapp-redis
       type: redis
   ```

2. **Connect GitHub** at https://render.com

3. **Deploy automatically** on push

### Fly.io

1. **Install Fly CLI**
   ```bash
   curl -L https://fly.io/install.sh | sh
   ```

2. **Login and launch**
   ```bash
   fly auth login
   fly launch
   ```

3. **Add PostgreSQL**
   ```bash
   fly postgres create
   fly postgres attach <postgres-app-name>
   ```

4. **Deploy**
   ```bash
   fly deploy
   ```

---

## 🔀 Hybrid: Vercel + Separate Backend

Deploy Next.js to Vercel, backend elsewhere.

### Why This Setup?

- ✅ Leverage Vercel's edge network for frontend
- ✅ Full control over backend infrastructure
- ✅ Independent scaling
- ✅ Vercel's free tier for frontend

### Frontend (Vercel)

1. **Push to GitHub**

2. **Import to Vercel**
   - Go to https://vercel.com
   - Import your GitHub repository
   - Vercel auto-detects Next.js

3. **Environment Variables** (Vercel Dashboard)
   ```
   NEXT_PUBLIC_API_URL=https://your-backend-url.com
   ```

4. **Build settings** (auto-detected)
   - Framework: Next.js
   - Build Command: `next build`
   - Output Directory: `.next`

**Vercel ignores `src/server`** automatically! ✅

### Backend (Railway/Render/VPS)

Deploy only the backend to a separate service:

#### Using Docker

```bash
# Build backend only
docker build -t myapp-backend .

# Run backend
docker run -p 8790:8790 \
  -e DATABASE_URL=$DATABASE_URL \
  -e REDIS_URL=$REDIS_URL \
  myapp-backend
```

#### Configure CORS

Update your backend to allow Vercel domain:

```typescript
// src/server/app.ts or server config
import { cors } from 'hono/cors';

app.use('/*', cors({
  origin: [
    'https://yourdomain.com',
    'https://*.vercel.app'
  ],
  credentials: true
}));
```

---

## 🔐 Environment Variables

### Development (.env.local)

```bash
DATABASE_URL=postgresql://spfn:spfn@localhost:5432/spfn_dev
REDIS_URL=redis://localhost:6379
NEXT_PUBLIC_API_URL=http://localhost:8790
```

### Production (.env)

```bash
DATABASE_URL=postgresql://user:password@db-host:5432/prod_db
REDIS_URL=redis://redis-host:6379
POSTGRES_PASSWORD=secure-password
NEXT_PUBLIC_API_URL=https://api.yourdomain.com
NODE_ENV=production
```

### Security Best Practices

- ⚠️ Never commit `.env` files to Git
- ✅ Use secrets managers (AWS Secrets Manager, Railway Variables)
- ✅ Rotate database passwords regularly
- ✅ Use strong passwords (30+ characters)
- ✅ Enable SSL for database connections
- ✅ Use environment-specific keys for different stages

---

## 🤖 GitHub Actions CI/CD

Automate deployment with GitHub Actions:

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm install

      - name: Build
        run: npm run spfn:build

      - name: Deploy to Railway
        run: |
          npm install -g @railway/cli
          railway up
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}
```

**Setup:**
1. Add `RAILWAY_TOKEN` to GitHub Secrets
2. Push to `main` branch
3. Automatic deployment!

---

## 🐛 Troubleshooting

### Port already in use

```bash
# Find process using port
lsof -i :8790
kill -9 <PID>

# Or use different ports
PORT=9000 npm run spfn:start
```

### Database connection fails

```bash
# Check DATABASE_URL format
postgresql://username:password@hostname:5432/database

# Test connection
psql $DATABASE_URL

# Common issues:
# - Wrong hostname (use 'postgres' in Docker, not 'localhost')
# - Firewall blocking port 5432
# - Wrong credentials
```

### Build fails

```bash
# Clean build
rm -rf .next .spfn node_modules dist
npm install
npm run spfn:build
```

### Docker build hangs

```bash
# Check .dockerignore
cat .dockerignore

# Ensure these are excluded:
node_modules
.next
.env*
.git
```

### Routes not loading in production

```bash
# Verify build output
ls -la .spfn/server/routes

# Check routes are compiled to .js files
# SPFN v0.1.0-alpha.12+ supports both .ts (dev) and .js (prod)
```

### Server crashes on start

```bash
# Check logs
docker compose logs api

# Common causes:
# - DATABASE_URL not set
# - Database not accessible
# - Port already in use
# - Missing environment variables
```

---

## 📊 Monitoring & Logs

### View logs

```bash
# Docker
docker compose logs -f

# Railway
railway logs

# Render
# View in dashboard: https://dashboard.render.com
```

### Health check endpoint

Test if your API is running:

```bash
curl https://api.yourdomain.com/health
```

Add health check route if not exists:

```typescript
// src/server/routes/health/index.ts
import { createApp } from '@spfn/core/route';
import { Type } from '@sinclair/typebox';

const app = createApp();

app.bind({
  method: 'GET',
  path: '/',
  response: Type.Object({ status: Type.String() })
}, async (c) => {
  return c.json({ status: 'ok' });
});

export default app;
```

---

## 📚 Additional Resources

- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [Next.js Deployment](https://nextjs.org/docs/deployment)
- [Railway Documentation](https://docs.railway.app/)
- [Render Documentation](https://render.com/docs)
- [Vercel Documentation](https://vercel.com/docs)

---

## 🆘 Need Help?

- **GitHub Issues**: https://github.com/spfn/spfn/issues
- **Documentation**: https://superfunction.xyz

Happy deploying! 🚀