# Architecture

## Agents
1. Research Agent — מחקר שוק ממספר ספקים
2. Content Agent — יצירת תכנים ובדיקת שפה
3. Site Agent — בניית אתרים, admin, DB, auth, env, deploy
4. Media Agent — יצירת תמונות/גרפים/וידאו דרך adapters
5. QA Agent — בדיקות קישורים, דפים, assets, forms, SEO, accessibility

## Orchestrator
האחראי על:
- workflow routing
- task state
- retries
- artifacts
- audit logs

## Core principles
- TypeScript monorepo
- zod validation
- pnpm workspace
- shared types
- provider adapters
- env-based secrets
- Docker
- Playwright QA

## Main workflows
- research-content
- site-build
- media-only
