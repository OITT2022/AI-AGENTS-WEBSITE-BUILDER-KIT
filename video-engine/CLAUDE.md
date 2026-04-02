# Claude Code Working Notes

## Project goal
This repository is a local-only video rendering engine for slideshow-based social ads.
It must not depend on any third-party API or cloud video generation service.

## Rules
- Keep the render pipeline local.
- Do not add external API integrations.
- Preserve Hebrew and RTL support.
- Prefer deterministic rendering over AI generation.
- Keep jobs JSON backward compatible when possible.

## Core flow
1. Load JSON job.
2. Validate and normalize assets.
3. Plan timeline.
4. Render slideshow composition.
5. Export MP4.

## Important files
- `src/engine/loadJob.ts`
- `src/engine/planner.ts`
- `src/templates/SlideshowAd.tsx`
- `scripts/render.ts`

## Safe extension points
- Add templates under `src/templates/`
- Add transition helpers under `src/components/`
- Add theme/profile logic under `src/utils/`
- Add batch rendering script under `scripts/`

## Avoid
- Breaking JSON schema silently
- Adding hidden external dependencies
- Removing RTL logic
