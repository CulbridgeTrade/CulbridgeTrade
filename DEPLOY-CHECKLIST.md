# 🚀 Culbridge Production Deployment Checklist
*(Addresses all 9 failure vectors from task)*

## Pre-Deploy Local Tests
```
npm install
npm run start:prod    # → SERVER READY, /health OK (no crash)
curl http://localhost:10000/health     # → 200 OK
curl http://localhost:10000/           # → Culbridge API running
```

## Docker Local Tests (#1-8)
```
docker build -t culbridge .
docker run -p 10000:10000 -e PORT=10000 --rm culbridge
# In another terminal:
curl localhost:10000/health    # → 200 (HEALTHCHECK passes)
curl localhost:10000/          # → 200
# Ctrl+C → clean exit
```

## Render Deploy
1. Connect GitHub repo to Render.com (Web Service, Docker)
2. **Runtime**: `Docker`
3. **Env**: `PORT=10000`, `NODE_ENV=production` (auto)
4. **Plan**: Free (512MB, sleeps OK #9)
5. Deploy → Logs: "SERVER READY", no crashes
6. Test: `https://your-app.onrender.com/health` → 200

## Failure Vectors Mitigated
- ✅ #1: Long-running Express server, async non-blocking DB init
- ✅ #2: All paths absolute (`path.join(__dirname, ...)`)
- ✅ #3: Linux/Docker casing safe (verified files)
- ✅ #4: Try/catch async startup, uncaught handlers
- ✅ #5: `--max-old-space=512` for free tier
- ✅ #6: `PORT || 10000`, `'0.0.0.0'`
- ✅ #7: Single listen
- ✅ #8: `/` + `/health` routes
- ✅ #9: Render sleep handled (cold starts <50s)

## Post-Deploy Monitoring
```
npm run healthcheck  # Local
# Render: Logs + /health endpoint
```

**Status**: Ready for production. All subtle failures blocked.
