# DEPLOYMENT BASELINE RESET - TODO

## 1. [DONE] Replace Dockerfile (deterministic spec)

## 2. [DONE] Update server.js Express listen(host: '0.0.0.0')

## 3. [DONE] Update server/api.js fastify.listen(port: process.env.PORT, host: '0.0.0.0')

## 4. [PENDING] npm install (regen lockfile)

## 5. [PENDING] Local test: npm start, curl http://0.0.0.0:3000/health

## 6. [PENDING] Docker test: docker build -t culbridge . &amp;&amp; docker run -p 3000:3000 culbridge &amp;&amp; curl http://localhost:3000/health

## 7. [PENDING] git commit/push

## 8. [PENDING] Deploy to Render
