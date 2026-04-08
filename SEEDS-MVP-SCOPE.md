# EU Seeds (Sesame/Melon) MVP Scope - NL/DE

**Objective:** Deterministic Safe-to-Ship NL/DE Nigeria sesame/melon. No AI.

## Components
- **HB:** aflat>EU/Salmonella/moisture>thresh/batch_mismatch/trace_null/botanical!=Sesamum_Cucumis/no_coa_phyto
- **Extraction:** lab_pdf/coa/phytosanitary/manifest → JSON aflat/pesticides/salmonella/moisture/botanical/trace/batch/certs
- **Lab Schema:** labs/results tier/ISO/rasff/conf
- **Rules:** HB/CP/MP/TB 1881/2006 Plant/RASFF
- **Scoring:** 100→-50HB -25CP -10MP +10TB → clamp BLOCK/HIGH_RISK/SAFE
- **Logs:** immutable snapshot/result/reason/time
- **Trust:** tier/batch/history → conf 0-1
- **Behavioral:** port/lab switch/delay/batch reuse
- **Output:** decision DO_NOT_SHIP/$loss/fix/conf

## Flow
1. Extract PDF/CSV
2. Rules HB→BLOCK
3. Trust/RASFF
4. Score/conf
5. `{"decision":"DO_NOT_SHIP","loss":"$10k","fix":"Tier1 retest $100","conf":0.82}`
6. Log

**Production Ready**

