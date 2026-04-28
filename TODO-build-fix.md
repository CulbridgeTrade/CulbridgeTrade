# TODO: Build & Deploy Fix Steps

## Plan Breakdown
1. [ ] Complete tailwindcss-animate install (--legacy-peer-deps running)
2. [x] Edit c:/Culbridge/culbridge-frontend/tsconfig.json: Change paths "@/*": ["./src/*"] to support shadcn src/lib/api.ts
3. [x] Create/verify c:/Culbridge/culbridge-frontend/app/components/ui/button.tsx with feedback code
4. [ ] npm run build (verify ✓ Compiled successfully)
5. [ ] git add .
6. [ ] git commit -m "fix: resolve missing components and alias issues"
7. [ ] git push origin main --force
8. [ ] Vercel: Redeploy project
9. [ ] Test live: / and /dashboard no errors

**Current:** npm run build running (step 4).

