# Backend Fix TODO

## Completed Steps

### Step 0: Pull Latest Code
- [x] `git pull origin main` completed

### Step 1: Install Dependencies
- [x] `npm install` completed — `pg` added to dependencies

### Step 2: Delete Ambiguous Server Logic
- [x] Deleted: `app.js` (old Express app with mixed auth, sqlite3)
- [x] Deleted: `middleware/auth.js` (old verifyToken middleware)
- [x] Deleted: `routes/evaluate.js` (old /evaluate route)
- [x] Deleted: `server/api.js` (Fastify server — removed completely)
- [x] Deleted: `server/evaluate-server.js` (duplicate Express evaluate server)
- [x] Deleted: `services/auth-api.js` (standalone auth API)
- [x] Deleted: `services/shipment-api.js` (standalone shipment API)

### Step 3: Replace Server with Exact Implementation
- [x] `server.js` replaced with the spec's exact Express server:
  - `import` syntax (type: module)
  - `pg` Pool with SSL for production
  - `express.json({ limit: '10mb' })`
  - `cors({ origin: process.env.CORS_ORIGIN || '*', credentials: true })`
  - `multer({ storage: memoryStorage, limits: { fileSize: 10*1024*1024 } })`
  - Strict env validation (crash if `JWT_SECRET` or `DATABASE_URL` missing)
  - `/api/v1/health` → `{ status: 'ok' }`
  - `/api/auth/signup` → bcrypt hash, INSERT into users, return `{ user }`
  - `/api/auth/login` → compare hash, return `{ token, user }`
  - `/api/auth/me` → requireAuth, return `{ user: req.user }`
  - `/api/auth/logout` → requireAuth, return `{ success: true }`
  - `/api/v1/validate` → requireAuth, call `runValidation(req.body)`
  - `/api/v1/emergency-check` → requireAuth + upload.single('file'), call `runValidation({...req.body, files: req.file ? [req.file.buffer] : []})`

### Step 4: Create `src/engine.js` Wrapper
- [x] Created `src/engine.js` as a CommonJS wrapper:
  - Dynamically imports `culbridge-mvp/src/engine.js` (ESM)
  - Exports `runValidation(input)` that awaits the dynamic import and calls the real function
  - This bridges the ESM/CJS gap

### Step 5: Update `package.json`
- [x] Added `
