# 🌳 EUDR‑Rules Engine – Dev Spec (Culbridge MVP)

## 1. Objective
Deterministic EUDR check: Block if covered commodity without farm GPS/legal proof.

## 2. Models (db/schema.sql)
```
EUDRCoveredProduct (product='cocoa', hsCode='1801')
FarmTraceability (shipmentId, gpsLat/Lng, legalProof='s3://doc.pdf', deforestationFree)
EUDRCheckResult (shipmentId, isCovered, hasTrace, compliant)
```
Seed:
```sql
INSERT EUDRCoveredProduct (product, hsCode) VALUES ('cocoa','1801'),('cashew','0802'),('sesame','1207'),('rubber','4001');
```

## 3. Logic (engine/eudr-engine.js)
```js
function computeEUDR(shipment) {
  const covered = db.findEUDRCovered(shipment.commodity);
  const trace = db.findFarmTrace(shipment.id);
  const compliant = !covered || (covered && trace);
  db.saveEUDRCheck(shipment.id, covered, !!trace, compliant);
  if (!compliant) shipment.status = 'BLOCKED';
}
```

## 4. Integration
Call `computeEUDR` on shipment/farm save. Add to finalStatus if !compliant → Blocked.

## 5. UI (Dashboard)
Column `EUDR`: Pass/Blocked.
Button "Add Farm Data" → form (GPS map picker, upload proof) → save → recompute.

## 6. Export PDF (Audit)
```
EUDR Summary #123
Product: Cocoa (covered)
Farm: Kano Coop (lat,lng)
Proof: lease.pdf ✓
Status: Compliant
```

## 7. Checklist
[x] Tables/seeds
[x] computeEUDR fn
[x] UI column/button
[x] PDF export

**Timeline**: 1 day.
