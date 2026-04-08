# Culbridge Production Spec - Nigeria → Rotterdam/Hamburg

**Ports:** NL Rotterdam, DE Hamburg | Products: sesame/cocoa/cashew/ginger | **NO OTHER SCOPE**

## 0. Contract Output
```
{
  "rule_status": "PASS | FAIL",
  "risk_score": 0.0-1.0,
  "inspection_probability": 0.0-1.0,
  "risk_class": "LOW|ELEVATED|HIGH|CRITICAL",
  "decision": "SHIP|HOLD|DO_NOT_SHIP",
  "expected_loss_usd": 0,
  "recommended_fix": "Retest Tier1 lab",
  "confidence": 0.0-1.0,
  "explanations": ["sudden_lab_switch", "alert_velocity_7d_high"]
}
```

## 1. Architecture (6 Services)

### Ingestion (PDF/CSV COA)
- Normalize µg/kg % ppm
- Fraud: tampering hash, duplicate lab
- Missing → null flag

### Rule Engine (Deterministic)
```
if salmonella or pesticide>MRL or no_phyto → FAIL
```

### Feature Engine
**Enforcement:**
```
alert_velocity_7d(product="sesame",port="Rotterdam")
corridor_risk = weighted(7d,30d,rejection_rate)
```

**Behavioral:**
```
sudden_lab_switch, lab_shopping_pattern, batch_reuse, port_switch_freq
```

**Data Quality:**
```
missing_fields_ratio, unit_inconsistency
```

### Risk Engine
```
risk = 0.25*alert7d + 0.20*alert30d + 0.20*corridor + behavioral_adjust + data_penalty
clamp(0,1)
```

### Calibration
```
inspection_prob = (rejected + 0.5*delayed) / total PER (port,product)
fallback: risk_score if n<5
```

### Decision
```
if rule FAIL → DO_NOT_SHIP
if prob>0.7 → DO_NOT_SHIP
if prob>0.4 → HOLD
else SHIP
expected_loss = prob * value_usd
```

## 2. Data Model
```
Shipments: id,exporter,lab,product="sesame",port="Rotterdam",value_usd
RASFF: date,product="sesame",port="Rotterdam",hazard="salmonella",action="reject"
```

## 3. Execution Flow
ingest → rule (FAIL exit) → features → risk → calibrate → decision → log

## 4. Live: localhost:3000/evaluate → JSON contract
**MVP LIVE** NG→Rotterdam/Hamburg deterministic.

