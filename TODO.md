# Cocoa-Netherlands Deterministic Enforcement MVP

## Plan Steps (Approved)

- [x] 1. Create engine/rules-v1.2-cocoa-nl.json (HARD_GATE for CCI, NAQS phyto, NEPC origin, NL validations, actions/fail states)
- [x] 2. Create COCOA-NL-MVP-SCOPE.md (MVP checklist)
- [x] 3. Create engine/cocoa-nl-enforcement-model.json (true model with rules/actions/fail_states)
- [x] 4. Edit extractor/cocoaMapping.json (add cci_number, trms_id, ness_paid, naqs_inspection_date)
- [x] 5. Edit db/cocoaLabSchema.sql (add columns/views for Nigeria export)
- [x] 6. Edit extractor/cocoaExtractor.js (regex for new fields)
- [ ] 5. Edit db/cocoaLabSchema.sql (add columns/views for Nigeria export)
- [ ] 6. Edit extractor/cocoaExtractor.js (regex for new fields)
- [x] 7. Update ruleEngine.js ruleFiles array to load v1.2
- [ ] 8. Add sample NL cocoa data to schema
- [ ] 9. Test: node engine/test-comprehensive.js or similar
- [ ] 10. Update README.md

**Progress: Cocoa NL/DE + Ginger NL/DE rules complete. Deterministic pass/fail with actions/fail_states. Test with `node engine/ruleEngine.js.evaluate('test-shipment')`.**
