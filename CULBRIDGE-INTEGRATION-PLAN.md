
# Culbridge Integration Plan - Open-Source Stack

## Core Principle
Focus only on preventing shipment failures.

## Architecture
| Layer | Tool | Output |
|-------|------|--------|
Farm Data | FarmOS | JSON farm/batch |
Lab Data | OpenELIS | JSON lab results |
Regulatory | EUR-Lex EU Pesticides | Rules MRLs |
Certificates | TRACES IPPC | Cert status |
Decision | Culbridge engine | Approval risk |
Fix | Optimizer | Fix JSON |
Logistics | Karrio self | Labels tracking |
Monitoring | Poll APIs | Rule updates |

## Phase 1
1. utils/farmos-integration.js
2. utils/openelis-integration.js
3. services/eur-lex-rules.js
4. services/traces-ippc.js

## Phase 2
5. utils/karrio-logistics.js
6. services/geocledian-eudr.js

**Dev:** Open-source only. Deterministic audit-ready.


