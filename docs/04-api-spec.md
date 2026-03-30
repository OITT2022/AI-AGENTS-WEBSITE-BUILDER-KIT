# Source Export API Specification

This API should be added to the **existing real-estate website**.
It is a marketing-oriented export API, not the public website API.

## Authentication
Recommended:
- `Authorization: Bearer <token>`
- IP allowlist optional
- rate limiting

## Endpoints

### GET /api/marketing/properties
Returns active properties.

Query params:
- `status=active`
- `updated_since=ISO_DATE`
- `country=`
- `city=`
- `project_id=`
- `limit=`
- `cursor=`

### GET /api/marketing/projects
Returns active projects.

### GET /api/marketing/changes
Returns changed entity references since checkpoint.

Query params:
- `since=ISO_DATE`

Example response:
```json
{
  "checkpoint": "2026-03-30T03:00:00Z",
  "changes": [
    {
      "entity_type": "property",
      "entity_id": "prop_1023",
      "change_type": "price_changed",
      "updated_at": "2026-03-30T02:15:00Z"
    }
  ]
}
```

### GET /api/marketing/properties/:id
Returns full property details.

### GET /api/marketing/projects/:id
Returns full project details.

### GET /api/marketing/media/:entityType/:entityId
Returns media set for a property or project.

### POST /api/marketing/webhooks
Optional outbound integration from source system to orchestrator.

---

## Canonical property payload

```json
{
  "id": "prop_1023",
  "type": "property",
  "status": "active",
  "listing_status": "available",
  "title": {
    "he": "פנטהאוז מודרני בלרנקה",
    "en": "Modern Penthouse in Larnaca"
  },
  "descriptions": {
    "short": {
      "he": "פנטהאוז מודרני עם מרפסת גדולה",
      "en": "Modern penthouse with a large balcony"
    },
    "long": {
      "he": "...",
      "en": "..."
    }
  },
  "country": "Cyprus",
  "city": "Larnaca",
  "area": "Aradippou",
  "address_public": null,
  "geo": {
    "lat": 34.922,
    "lng": 33.623,
    "precision": "area"
  },
  "price": {
    "amount": 265000,
    "currency": "EUR",
    "price_text": "€265,000"
  },
  "rooms": 4,
  "bathrooms": 3,
  "size_m2": 132,
  "covered_veranda_m2": 28,
  "roof_garden_m2": 45,
  "project_id": "proj_eden_house",
  "features": ["roof garden", "parking", "storage", "pool access"],
  "delivery": {
    "status": "under_construction",
    "expected_date": "2027-09-01"
  },
  "media": {
    "hero_image": "https://.../hero.jpg",
    "gallery": ["https://.../1.jpg", "https://.../2.jpg"],
    "videos": ["https://.../tour.mp4"],
    "floorplans": ["https://.../plan.pdf"]
  },
  "marketing": {
    "campaign_ready": true,
    "priority_score": 88,
    "target_audiences": ["investors", "families"],
    "angles": ["location", "lifestyle", "value"],
    "urgent": false,
    "is_new": true,
    "price_changed": false,
    "video_preferred": true,
    "languages": ["he", "en"]
  },
  "seo": {
    "url": "https://your-site.com/property/prop_1023"
  },
  "updated_at": "2026-03-30T02:15:00Z",
  "published_at": "2026-03-29T10:00:00Z"
}
```

---

## Additional admin fields to add to source site

Recommended CMS/admin flags:
- campaign_ready
- promotion_priority
- target_audiences
- preferred_angles
- video_preferred
- suppress_auto_publish
- legal_review_required
- market_region_tags
- media_quality_override
- hero_media_id
- featured_until

---

## Minimal source requirements for reliable automation

A listing should not be campaign-eligible unless it has:
- active status
- title in at least one language
- valid price and currency
- city / area
- at least one approved image
- canonical listing URL
- last updated timestamp
