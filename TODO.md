# Production Rule Engine MVP Integration (EU Compliance v1 CORE)

## Steps (Breakdown of Approved Plan)

- [x] Step 1: Create `engine/rules-v1-core.json` with provided FULL PRODUCTION RULE SET JSON
- [x] Step 2: Edit `server/evaluate-server.js` 
  - Update rulesFile path from `sample-rules.json` → `rules-v1-core.json`
  - Set PORT = process.env.PORT || 10000
  - Update console.log to reflect production engine
- [x] Step 3: Edit `culbridge-mvp/package.json` 
  - Add script: "engine-api": "cd ../server &amp;&amp; node evaluate-server.js"
- [ ] Step 4: Test locally
  - `cd server &amp;&amp; node evaluate-server.js`
  - `curl -X POST http://localhost:10000/evaluate -H "Content-Type: application/json" -d '{\"shipment\":{\"product_id\":"groundnuts\",\"origin\":"NG\",\"destination\":"EU\",\"attributes\":{\"aflatoxin_b1\":15}}}'` → REJECT expected
  - Health: `curl http://localhost:10000/health`
- [ ] Step 5: Frontend integration note
  - Set `NEXT_PUBLIC_API_URL=http://localhost:10000` in culbridge-frontend/.env.local
- [ ] Step 6: Deploy-ready (Render: PORT env)

Progress tracked here after each tool success.
