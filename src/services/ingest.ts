import { v4 as uuid } from 'uuid';
import crypto from 'crypto';
import {
  PropertyPayloadSchema,
  ProjectPayloadSchema,
  PropertyPayload,
  ProjectPayload,
  EntityType,
  SourceEntity,
  EntitySnapshot,
} from '../models/schemas';
import { store } from '../db/store';
import * as log from '../lib/logger';

// Deep clone to plain JSON-safe object (removes circular refs, class instances, etc.)
function toPlainJson(obj: unknown): any {
  return JSON.parse(JSON.stringify(obj, (_key, value) => {
    if (typeof value === 'bigint') return Number(value);
    return value;
  }));
}

function computeChecksum(payload: Record<string, unknown>): string {
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 16);
}

function normalizeProperty(raw: PropertyPayload): Record<string, unknown> {
  return {
    id: raw.id, type: 'property', status: raw.status,
    title_he: raw.title?.he ?? null, title_en: raw.title?.en ?? null,
    country: raw.country ?? null, city: raw.city ?? null, area: raw.area ?? null,
    price_amount: raw.price?.amount ?? null, price_currency: raw.price?.currency ?? null,
    price_text: raw.price?.price_text ?? null,
    rooms: raw.rooms ?? null, bathrooms: raw.bathrooms ?? null, size_m2: raw.size_m2 ?? null,
    features: raw.features,
    hero_image: raw.media?.hero_image ?? null,
    gallery: raw.media?.gallery ?? [], gallery_count: raw.media?.gallery?.length ?? 0,
    videos: raw.media?.videos ?? [], video_count: raw.media?.videos?.length ?? 0,
    floorplans: raw.media?.floorplans ?? [],
    description_he: raw.descriptions?.short?.he ?? raw.descriptions?.long?.he ?? null,
    description_en: raw.descriptions?.short?.en ?? raw.descriptions?.long?.en ?? null,
    campaign_ready: raw.marketing?.campaign_ready ?? false,
    priority_score: raw.marketing?.priority_score ?? 0,
    target_audiences: raw.marketing?.target_audiences ?? [],
    angles: raw.marketing?.angles ?? [],
    urgent: raw.marketing?.urgent ?? false,
    is_new: raw.marketing?.is_new ?? false,
    price_changed: raw.marketing?.price_changed ?? false,
    listing_url: raw.seo?.url ?? null, updated_at: raw.updated_at,
  };
}

function normalizeProject(raw: ProjectPayload): Record<string, unknown> {
  return {
    id: raw.id, type: 'project', status: raw.status,
    title_he: raw.title?.he ?? null, title_en: raw.title?.en ?? null,
    country: raw.country ?? null, city: raw.city ?? null, area: raw.area ?? null,
    total_units: raw.total_units ?? null, available_units: raw.available_units ?? null,
    features: raw.features,
    hero_image: raw.media?.hero_image ?? null,
    gallery: raw.media?.gallery ?? [], gallery_count: raw.media?.gallery?.length ?? 0,
    videos: raw.media?.videos ?? [], video_count: raw.media?.videos?.length ?? 0,
    description_he: raw.descriptions?.short?.he ?? null,
    description_en: raw.descriptions?.short?.en ?? null,
    campaign_ready: raw.marketing?.campaign_ready ?? false,
    priority_score: raw.marketing?.priority_score ?? 0,
    target_audiences: raw.marketing?.target_audiences ?? [],
    angles: raw.marketing?.angles ?? [],
    listing_url: raw.seo?.url ?? null, updated_at: raw.updated_at,
  };
}

export interface IngestResult {
  entity_id: string;
  source_entity_id: string;
  entity_type: EntityType;
  is_new: boolean;
  changed: boolean;
  change_type?: string;
  snapshot_id?: string;
}

export async function ingestProperty(raw: unknown, clientId?: string): Promise<IngestResult> {
  const parsed = PropertyPayloadSchema.parse(raw);
  return ingestEntity('property', parsed.id, toPlainJson(parsed), toPlainJson(normalizeProperty(parsed)), {
    client_id: clientId, title_he: parsed.title?.he, title_en: parsed.title?.en,
    country: parsed.country, city: parsed.city, area: parsed.area,
    listing_url: parsed.seo?.url, source_status: parsed.status,
    campaign_ready: parsed.marketing?.campaign_ready ?? false,
    source_updated_at: parsed.updated_at,
  });
}

export async function ingestProject(raw: unknown, clientId?: string): Promise<IngestResult> {
  const parsed = ProjectPayloadSchema.parse(raw);
  return ingestEntity('project', parsed.id, toPlainJson(parsed), toPlainJson(normalizeProject(parsed)), {
    client_id: clientId, title_he: parsed.title?.he, title_en: parsed.title?.en,
    country: parsed.country, city: parsed.city, area: parsed.area,
    listing_url: parsed.seo?.url, source_status: parsed.status,
    campaign_ready: parsed.marketing?.campaign_ready ?? false,
    source_updated_at: parsed.updated_at,
  });
}

async function ingestEntity(
  entityType: EntityType, sourceId: string,
  sourcePayload: Record<string, unknown>, normalizedPayload: Record<string, unknown>,
  entityFields: Partial<SourceEntity>,
): Promise<IngestResult> {
  const now = new Date().toISOString();
  const checksum = computeChecksum(normalizedPayload);
  const ctx = { entity_type: entityType, source_entity_id: sourceId, client_id: entityFields.client_id };

  let entity = await store.getEntityBySourceId(entityType, sourceId);
  const isNew = !entity;

  if (!entity) {
    entity = {
      id: uuid(), client_id: entityFields.client_id, entity_type: entityType,
      source_entity_id: sourceId, source_updated_at: entityFields.source_updated_at ?? now,
      source_status: entityFields.source_status ?? 'active',
      country: entityFields.country, city: entityFields.city, area: entityFields.area,
      title_he: entityFields.title_he, title_en: entityFields.title_en,
      listing_url: entityFields.listing_url, campaign_ready: entityFields.campaign_ready ?? false,
      created_at: now, updated_at: now,
    };
    await store.upsertEntity(entity);
    log.info('ingest.entity', `New ${entityType} created`, { ...ctx, entity_id: entity.id });
  }

  const existingSnapshots = await store.getSnapshots(entity.id);
  const latestSnapshot = existingSnapshots[0];
  const changed = !latestSnapshot || latestSnapshot.checksum !== checksum;

  if (!changed) {
    if (entityFields.client_id && entity.client_id !== entityFields.client_id) {
      entity.client_id = entityFields.client_id;
      entity.updated_at = now;
      await store.upsertEntity(entity);
    }
    return { entity_id: entity.id, source_entity_id: sourceId, entity_type: entityType, is_new: false, changed: false };
  }

  const snapshotId = uuid();
  const versionNo = (latestSnapshot?.version_no ?? 0) + 1;

  await store.addSnapshot({
    id: snapshotId, entity_id: entity.id, version_no: versionNo,
    normalized_payload: normalizedPayload, source_payload: sourcePayload,
    checksum, created_at: now,
  });

  entity.current_snapshot_id = snapshotId;
  if (entityFields.client_id) entity.client_id = entityFields.client_id;
  entity.source_updated_at = entityFields.source_updated_at ?? now;
  entity.source_status = entityFields.source_status ?? entity.source_status;
  entity.country = entityFields.country ?? entity.country;
  entity.city = entityFields.city ?? entity.city;
  entity.area = entityFields.area ?? entity.area;
  entity.title_he = entityFields.title_he ?? entity.title_he;
  entity.title_en = entityFields.title_en ?? entity.title_en;
  entity.listing_url = entityFields.listing_url ?? entity.listing_url;
  entity.campaign_ready = entityFields.campaign_ready ?? entity.campaign_ready;
  entity.updated_at = now;
  await store.upsertEntity(entity);

  let changeType = 'created';
  const diffJson: Record<string, unknown> = {};
  if (latestSnapshot) {
    const oldP = latestSnapshot.normalized_payload;
    if (oldP.price_amount !== normalizedPayload.price_amount) {
      changeType = 'price_changed'; diffJson.price_from = oldP.price_amount; diffJson.price_to = normalizedPayload.price_amount;
    } else if (oldP.status !== normalizedPayload.status) {
      changeType = 'status_changed'; diffJson.status_from = oldP.status; diffJson.status_to = normalizedPayload.status;
    } else { changeType = 'updated'; }
  }

  await store.addChangeEvent({
    id: uuid(), entity_id: entity.id, from_snapshot_id: latestSnapshot?.id,
    to_snapshot_id: snapshotId, change_type: changeType, diff_json: diffJson, created_at: now,
  });

  log.info('ingest.snapshot', `Snapshot v${versionNo} (${changeType})`, {
    ...ctx, entity_id: entity.id, snapshot_id: snapshotId, change_type: changeType, version: versionNo,
  });

  return { entity_id: entity.id, source_entity_id: sourceId, entity_type: entityType,
    is_new: isNew, changed: true, change_type: changeType, snapshot_id: snapshotId };
}
