# COCOA-NL-MVP-SCOPE

## Input
```
product: cocoa beans
destination: Netherlands
origin: Nigeria
```

## Output (deterministic)
**REQUIRED DOCS + STEPS:**
1. CCI (TRMS→inspection→NESS→CCI)
2. Phytosanitary (NAQS: pest-free, moisture<7%)
3. Origin (NEPC proof)

**VALIDATION:**
- Aflatoxin B1 <=2 μg/kg
- No quarantine pests
- Batch/lab match
- EUDR geo

**FAIL STATES:**
- Pest → REJECT
- Missing CCI → BLOCK

**Status:** Can this shipment pass NL entry today? PASS/BLOCK + reason.

## Implementation Status
- Rules v1.2 loaded
- Extractor updated
- Schema ready
- Engine compatible
