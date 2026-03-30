# Daily Automation Flow

## Daily schedule recommendation

### 06:00
- source sync starts
- fetch changed projects/properties/media since last checkpoint

### 06:10
- normalization and snapshot update
- change detection emits candidate events

### 06:20
- scoring engine ranks items
- top items selected for daily campaign batch

### 06:30
- creative text generation begins
- media processing begins in parallel

### 06:50
- QA and compliance checks run

### 07:00
- approval queue is assembled
- marketer receives email/slack notification

### 08:00–10:00
- human review window
- marketer edits/approves/rejects

### 10:05
- approved items are packaged for platforms

### 10:15
- publish to Meta and TikTok as drafts or live, depending on rules

### 18:00
- intraday sync catches urgent price/status changes
- pause or withdraw ads if a property became inactive

### Next morning
- collect platform metrics for previous outputs
- update performance tables and scoring priors

---

## Detailed steps

1. Read last successful sync checkpoint.
2. Call `/changes?since=<checkpoint>`.
3. Pull full records for changed entities.
4. Normalize records into canonical structure.
5. Save source payload + normalized payload.
6. Compare against previous snapshot.
7. Create change events.
8. Mark campaign eligibility.
9. Score eligible entities.
10. Choose daily candidate batch by quotas.
11. Generate angle and audience recommendations.
12. Generate text variants.
13. Generate media variants.
14. Run fact checks against latest source.
15. Run language and policy checks.
16. Build approval cards in admin UI.
17. On approval, publish or draft per platform.
18. Store platform identifiers.
19. Pull metrics later.
20. Feed metrics into next-day learning.

---

## Emergency automation

When a listing becomes unavailable:
- consume source change event
- locate active creatives and platform assets
- mark campaign as paused-required
- notify operator
- auto-pause if auto-safety enabled

When price changes materially:
- invalidate old price creatives
- queue regeneration
- do not republish stale creatives
