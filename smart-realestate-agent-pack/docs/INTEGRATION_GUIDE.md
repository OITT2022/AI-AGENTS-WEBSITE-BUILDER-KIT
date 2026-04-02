# Integration Guide

## Recommended placement inside your existing repository
- `services/smart-agent`
- or `tools/smart-agent`

## Minimum integration work

### 1) Property API
Edit `src/infra/property_api/PropertyApiClient.ts`
- Replace endpoint paths with your real endpoints.
- Map your payload to `PropertyRecord`.

### 2) Canva
Edit `src/infra/canva/CanvaClient.ts`
- Add your auth header format.
- Replace template fill workflow according to your template strategy.
- If you already have a design engine, use Canva only for specific outputs.

### 3) Image editing provider
Edit `src/infra/nano_banana/NanoBananaClient.ts`
- Connect to the actual provider you choose.
- If you use a Google wrapper, keep this client as the abstraction layer.

### 4) Video
Edit `src/infra/shotstack/ShotstackClient.ts`
- Update region/stage/live URL.
- Attach brand audio/logo if needed.

### 5) Publish back into your system
Edit `src/infra/storage/PublishClient.ts`
- Post results into your admin, campaign queue, or content distribution engine.

## Suggested production flow
1. New property enters DB
2. Existing backend emits webhook/event
3. Smart agent receives `propertyId`
4. Agent builds assets
5. Agent stores output URLs
6. Existing UI lets staff review and publish
