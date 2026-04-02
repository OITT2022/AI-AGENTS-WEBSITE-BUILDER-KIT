# Smart Real Estate Agent Project Context

## Purpose
This project adds an agentic marketing layer to an existing real estate platform.
The agent fetches property data, generates ad copy, edits images, creates a promo video, fills a Canva template, and returns publishable creative assets.

## Tech Stack
- TypeScript
- Node.js
- Express
- Zod for validation
- Axios for API calls
- Claude Code compatible structure

## Architecture Rules
- Keep domain types pure and framework-agnostic.
- All external systems must be wrapped under `src/infra/*`.
- The orchestrator in `src/application/AdGenerationOrchestrator.ts` is the only place allowed to coordinate multi-step execution.
- Avoid embedding API-specific payloads inside domain types.
- Every external provider must expose a small interface and a dedicated mapper.

## Coding Rules
- Prefer small files.
- Add runtime validation for inbound and outbound API payloads.
- Never hardcode tokens or secrets.
- Use structured logs.
- Fail loudly when a required creative asset is missing.

## Common Commands
```bash
npm run dev
npm run check
npm run create-ad -- --propertyId=12345 --channel=instagram
```

## Integration Goal
This project is meant to be copied into an existing codebase and adapted quickly.
Preserve backward compatibility with the host system.
