# Culbridge Rule Engine - Critical Fixes

## Task: Fix all Render deployment errors one by one (Node v18 ESM compatibility + engine warnings)

### 1. ✅ FIXED: uuid ESM error in traceability.js
- Updated to `const uuid = require('uuid'); const { v4: uuidv4 } = uuid;`
- Commit pushed to main
- Now compatible with uuid@^8.3.2 CommonJS

### 2. ⏳ PENDING: Fix Node engine version mismatch warnings
- `@hyperledger/fabric-gateway@1.10.1` requires Node >=20.9.0
- `sqlite3@6.0.1` requires Node >=20.17.0
- Current runtime: Node v18.20.8
- **Next**: Downgrade to v1.5.x (Node 18 compatible)

### 3. ⏳ PENDING: Fix 4 npm vulnerabilities
- 1 moderate, 2 high, 1 critical
- Run `npm audit fix` or update vulnerable packages

### 4. ⏳ PENDING: Address deprecation warnings
- turf@3.x → @turf/turf (multiple packages)
- stellar-sdk@13.3.0 → @stellar/stellar-sdk
- level-* packages → modern alternatives
- These are warnings only, app will run

### 5. ⏳ PENDING: Verify deployment after fixes
- Push each fix individually
- Monitor Render logs after each push
- Confirm no more ERR_REQUIRE_ESM

**Instructions**: Execute fixes in order 2→3→4→5. Commit each as `fix(deps): resolve [specific issue]`. Test locally with `node server.js` before pushing.
