# Backend Auth Implementation - Steps from Approved Plan

## 1. Dependencies
- [x] Update package.json: add "bcrypt": "^5.1.1", "jsonwebtoken": "^9.0.2" (sqlite3 existing), npm install running

- [ ] Run `npm install`

## 2. Database
- [x] Update db/auth-schema.sql: Simplified Users(passwordHash TEXT), seeded admin 'culbridge01@gmail.com' (pw 'admin123' - verify with bcrypt.compareSync('admin123', hash))

- [ ] Setup Postgres DB, run schema

## 3. Backend API (app.js)
- [x] Add /auth/signup, /auth/login, /auth/me, /admin protected - Implemented in app.js


## 4. Frontend Integration
- [ ] Update culbridge-frontend/app/api/auth/login/route.ts, register/route.ts - proxy to backend localhost:3000/auth/*
- [ ] Ensure cookie 'auth-token=JWT'

## 5. Config
- [ ] config/production.env.example: JWT_SECRET=your_secret, DATABASE_URL=postgres://...

## 6. Test
- [ ] npm start backend
- [ ] curl POST /auth/signup {email:'test@test',pw:'test'}
- [ ] curl POST /auth/login admin email -> role ADMIN
- [ ] curl GET /auth/me with Bearer token -> {email,role}
- [ ] Frontend login sets cookie, /admin accessible

## Progress Log
Updated: DB schema, deps, API routes.

Legacy: services/auth-api.js deprecated (too complex for spec).

