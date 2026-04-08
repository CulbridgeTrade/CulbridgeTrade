# 🛠️ DevEx & Deployment Spec (Culbridge MVP)

## Env Vars (.env.local/prod)
```
APP_ENV=local
JWT_SECRET=secret
DATABASE_URL=postgres://...
REDIS_URL=redis://...
EU_RASFF_API_KEY=key
AWS_S3_BUCKET=culbridge-docs
SENTRY_DSN=dns
LOG_LEVEL=INFO
```

## docker-compose.yml (local)
```
services:
  db: postgres:14
  redis: redis:7
  backend: build ./backend uvicorn
  frontend: build ./frontend pnpm dev
ports: 5432, 6379, 8000, 3000
```

## docker-compose.prod.yml
```
restart: always
env_file: .env.prod
volumes: postgres_data
```

## Logging
JSON stdout:
```
{"event":"ShipmentCreated","shipmentId":123,"status":"OK","details":{...}}
```

## Legal (/terms)
```
Culbridge not liable for EU rejections.
Exporters responsible for docs/regs.
```

## Deliverables
[x] .env template
[x] docker-compose.yml/prod
[x] Logging
[x] /terms page

**Run**: docker compose up.
