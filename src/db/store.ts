import { sql } from './provider';
import {
  SourceEntity,
  EntitySnapshot,
  ChangeEvent,
  CampaignCandidate,
  CreativeBatch,
  CreativeVariant,
  QAReview,
  ApprovalTask,
  PublishAction,
  PerformanceMetric,
  User,
  Session,
  Client,
  DriveMediaCacheRow,
} from '../models/schemas';

// ── Helper to run queries ──

async function query<T = any>(text: string, params: any[] = []): Promise<T[]> {
  return sql(text, params) as Promise<T[]>;
}

async function queryOne<T = any>(text: string, params: any[] = []): Promise<T | undefined> {
  const rows = await query<T>(text, params);
  return rows[0];
}

// ── Source Entities ──

export async function getEntities(): Promise<SourceEntity[]> {
  return query<SourceEntity>('SELECT * FROM source_entities ORDER BY updated_at DESC');
}

export async function getEntity(id: string): Promise<SourceEntity | undefined> {
  return queryOne<SourceEntity>('SELECT * FROM source_entities WHERE id = $1', [id]);
}

export async function getEntityBySourceId(entityType: string, sourceId: string): Promise<SourceEntity | undefined> {
  return queryOne<SourceEntity>(
    'SELECT * FROM source_entities WHERE entity_type = $1 AND source_entity_id = $2',
    [entityType, sourceId]
  );
}

export async function upsertEntity(entity: SourceEntity): Promise<SourceEntity> {
  const row = await queryOne<SourceEntity>(
    `INSERT INTO source_entities (id, client_id, entity_type, source_entity_id, source_updated_at, source_status, country, city, area, title_he, title_en, listing_url, campaign_ready, current_snapshot_id, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
     ON CONFLICT (entity_type, source_entity_id) DO UPDATE SET
       client_id=EXCLUDED.client_id, source_updated_at=EXCLUDED.source_updated_at, source_status=EXCLUDED.source_status,
       country=EXCLUDED.country, city=EXCLUDED.city, area=EXCLUDED.area,
       title_he=EXCLUDED.title_he, title_en=EXCLUDED.title_en, listing_url=EXCLUDED.listing_url,
       campaign_ready=EXCLUDED.campaign_ready, current_snapshot_id=EXCLUDED.current_snapshot_id, updated_at=EXCLUDED.updated_at
     RETURNING *`,
    [entity.id, entity.client_id ?? null, entity.entity_type, entity.source_entity_id,
     entity.source_updated_at, entity.source_status, entity.country, entity.city, entity.area,
     entity.title_he, entity.title_en, entity.listing_url, entity.campaign_ready,
     entity.current_snapshot_id ?? null, entity.created_at, entity.updated_at]
  );
  return row!;
}

export async function getEntitiesByClient(clientId: string): Promise<SourceEntity[]> {
  return query<SourceEntity>('SELECT * FROM source_entities WHERE client_id = $1 ORDER BY updated_at DESC', [clientId]);
}

/** Delete entities not in the given source IDs set. Cascades to snapshots, changes, media, candidates, batches. */
export async function deleteStaleEntities(clientId: string, currentSourceIds: string[]): Promise<number> {
  if (currentSourceIds.length === 0) return 0;
  const rows = await query<{ id: string }>(
    `DELETE FROM source_entities
     WHERE client_id = $1 AND source_entity_id != ALL($2::text[])
     RETURNING id`,
    [clientId, currentSourceIds]
  );
  return rows.length;
}

/** Delete all candidates for a client. */
export async function deleteCandidatesByClient(clientId: string): Promise<number> {
  const rows = await query('DELETE FROM campaign_candidates WHERE client_id = $1 RETURNING id', [clientId]);
  return rows.length;
}

// ── Snapshots ──

export async function getSnapshots(entityId: string): Promise<EntitySnapshot[]> {
  return query<EntitySnapshot>(
    'SELECT * FROM entity_snapshots WHERE entity_id = $1 ORDER BY version_no DESC', [entityId]
  );
}

export async function getSnapshot(id: string): Promise<EntitySnapshot | undefined> {
  return queryOne<EntitySnapshot>('SELECT * FROM entity_snapshots WHERE id = $1', [id]);
}

export async function addSnapshot(snapshot: EntitySnapshot): Promise<EntitySnapshot> {
  const row = await queryOne<EntitySnapshot>(
    `INSERT INTO entity_snapshots (id, entity_id, sync_run_id, version_no, normalized_payload, source_payload, checksum, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [snapshot.id, snapshot.entity_id, snapshot.sync_run_id ?? null, snapshot.version_no,
     safeJson(snapshot.normalized_payload), safeJson(snapshot.source_payload),
     snapshot.checksum, snapshot.created_at]
  );
  return row!;
}

// ── Change Events ──

export async function getChangeEvents(entityId?: string): Promise<ChangeEvent[]> {
  if (entityId) {
    return query<ChangeEvent>('SELECT * FROM entity_change_events WHERE entity_id = $1 ORDER BY created_at DESC', [entityId]);
  }
  return query<ChangeEvent>('SELECT * FROM entity_change_events ORDER BY created_at DESC LIMIT 200');
}

export async function addChangeEvent(event: ChangeEvent): Promise<void> {
  await query(
    `INSERT INTO entity_change_events (id, entity_id, from_snapshot_id, to_snapshot_id, change_type, diff_json, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [event.id, event.entity_id, event.from_snapshot_id ?? null, event.to_snapshot_id ?? null,
     event.change_type, safeJson(event.diff_json), event.created_at]
  );
}

// ── Campaign Candidates ──

export async function getCandidates(date?: string): Promise<CampaignCandidate[]> {
  if (date) {
    return query<CampaignCandidate>('SELECT * FROM campaign_candidates WHERE candidate_date = $1 ORDER BY score_total DESC', [date]);
  }
  return query<CampaignCandidate>('SELECT * FROM campaign_candidates ORDER BY score_total DESC LIMIT 200');
}

export async function getCandidate(id: string): Promise<CampaignCandidate | undefined> {
  return queryOne<CampaignCandidate>('SELECT * FROM campaign_candidates WHERE id = $1', [id]);
}

export async function upsertCandidate(candidate: CampaignCandidate): Promise<CampaignCandidate> {
  const row = await queryOne<CampaignCandidate>(
    `INSERT INTO campaign_candidates (id, client_id, entity_id, candidate_date, score_total, score_freshness, score_media, score_business, score_urgency, score_history, recommended_angle, recommended_audiences, recommended_platforms, selected, selection_reason, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
     ON CONFLICT (entity_id, candidate_date) DO UPDATE SET
       client_id=EXCLUDED.client_id, score_total=EXCLUDED.score_total, score_freshness=EXCLUDED.score_freshness,
       score_media=EXCLUDED.score_media, score_business=EXCLUDED.score_business, score_urgency=EXCLUDED.score_urgency,
       score_history=EXCLUDED.score_history, recommended_angle=EXCLUDED.recommended_angle,
       recommended_audiences=EXCLUDED.recommended_audiences, recommended_platforms=EXCLUDED.recommended_platforms,
       selected=EXCLUDED.selected, selection_reason=EXCLUDED.selection_reason
     RETURNING *`,
    [candidate.id, candidate.client_id ?? null, candidate.entity_id, candidate.candidate_date,
     candidate.score_total, candidate.score_freshness, candidate.score_media, candidate.score_business,
     candidate.score_urgency, candidate.score_history, candidate.recommended_angle,
     safeJson(candidate.recommended_audiences), safeJson(candidate.recommended_platforms),
     candidate.selected, candidate.selection_reason, candidate.created_at]
  );
  return row ?? candidate;
}

export async function getCandidatesByClient(clientId: string, date?: string): Promise<CampaignCandidate[]> {
  if (date) {
    return query<CampaignCandidate>(
      'SELECT * FROM campaign_candidates WHERE client_id = $1 AND candidate_date = $2 ORDER BY score_total DESC',
      [clientId, date]
    );
  }
  return query<CampaignCandidate>('SELECT * FROM campaign_candidates WHERE client_id = $1 ORDER BY score_total DESC', [clientId]);
}

// ── Creative Batches ──

export async function getBatches(entityId?: string): Promise<CreativeBatch[]> {
  if (entityId) {
    return query<CreativeBatch>('SELECT * FROM creative_batches WHERE entity_id = $1 ORDER BY created_at DESC', [entityId]);
  }
  return query<CreativeBatch>('SELECT * FROM creative_batches ORDER BY created_at DESC');
}

export async function addBatch(batch: CreativeBatch): Promise<void> {
  await query(
    `INSERT INTO creative_batches (id, client_id, entity_id, candidate_id, language_code, angle, audience, batch_status, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [batch.id, batch.client_id ?? null, batch.entity_id, batch.candidate_id ?? null,
     batch.language_code, batch.angle, batch.audience, batch.batch_status, batch.created_at]
  );
}

export async function getBatchesByClient(clientId: string): Promise<CreativeBatch[]> {
  return query<CreativeBatch>('SELECT * FROM creative_batches WHERE client_id = $1 ORDER BY created_at DESC', [clientId]);
}

// ── Creative Variants ──

export async function getVariants(batchId?: string): Promise<CreativeVariant[]> {
  if (batchId) {
    return query<CreativeVariant>('SELECT * FROM creative_variants WHERE batch_id = $1 ORDER BY variant_no', [batchId]);
  }
  return query<CreativeVariant>('SELECT * FROM creative_variants ORDER BY created_at DESC');
}

export async function getVariant(id: string): Promise<CreativeVariant | undefined> {
  return queryOne<CreativeVariant>('SELECT * FROM creative_variants WHERE id = $1', [id]);
}

export async function updateVariant(id: string, updates: Partial<CreativeVariant>): Promise<void> {
  const sets: string[] = [];
  const vals: any[] = [];
  let i = 1;
  for (const [key, val] of Object.entries(updates)) {
    sets.push(`${key} = $${i++}`);
    vals.push(typeof val === 'object' && val !== null ? safeJson(val) : val);
  }
  vals.push(id);
  await query(`UPDATE creative_variants SET ${sets.join(', ')} WHERE id = $${i}`, vals);
}

export async function addVariant(variant: CreativeVariant): Promise<void> {
  await query(
    `INSERT INTO creative_variants (id, batch_id, platform, variant_no, copy_json, media_plan_json, generation_metadata, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [variant.id, variant.batch_id, variant.platform, variant.variant_no,
     safeJson(variant.copy_json), safeJson(variant.media_plan_json),
     safeJson(variant.generation_metadata), variant.created_at]
  );
}

export async function deleteVariant(id: string): Promise<boolean> {
  await query('DELETE FROM approval_tasks WHERE creative_variant_id = $1', [id]);
  await query('DELETE FROM qa_reviews WHERE creative_variant_id = $1', [id]);
  const rows = await query('DELETE FROM creative_variants WHERE id = $1 RETURNING id', [id]);
  return rows.length > 0;
}

export async function deleteVariants(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  await query('DELETE FROM approval_tasks WHERE creative_variant_id = ANY($1::uuid[])', [ids]);
  await query('DELETE FROM qa_reviews WHERE creative_variant_id = ANY($1::uuid[])', [ids]);
  const rows = await query('DELETE FROM creative_variants WHERE id = ANY($1::uuid[]) RETURNING id', [ids]);
  return rows.length;
}

export async function deleteBatch(id: string): Promise<boolean> {
  const variants = await getVariants(id);
  const vids = variants.map(v => v.id);
  if (vids.length > 0) await deleteVariants(vids);
  const rows = await query('DELETE FROM creative_batches WHERE id = $1 RETURNING id', [id]);
  return rows.length > 0;
}

/** Delete all unapproved creatives for a client. Returns count of deleted variants. */
export async function deleteUnapprovedCreatives(clientId: string): Promise<number> {
  // Find variant IDs that have an approved approval_task — these are protected
  const approvedRows = await query<{ creative_variant_id: string }>(
    `SELECT DISTINCT at.creative_variant_id FROM approval_tasks at
     JOIN creative_variants cv ON cv.id = at.creative_variant_id
     JOIN creative_batches cb ON cb.id = cv.batch_id
     WHERE cb.client_id = $1 AND at.status IN ('approved', 'approved_with_edits')`,
    [clientId]
  );
  const approvedIds = new Set(approvedRows.map(r => r.creative_variant_id));

  // Get all variants for this client
  const allVariants = await query<{ id: string; batch_id: string }>(
    `SELECT cv.id, cv.batch_id FROM creative_variants cv
     JOIN creative_batches cb ON cb.id = cv.batch_id
     WHERE cb.client_id = $1`,
    [clientId]
  );

  // Filter out approved ones
  const toDelete = allVariants.filter(v => !approvedIds.has(v.id));
  if (toDelete.length === 0) return 0;

  const deleteIds = toDelete.map(v => v.id);
  // Delete related records first (qa_reviews, approval_tasks), then variants
  await query('DELETE FROM qa_reviews WHERE creative_variant_id = ANY($1::uuid[])', [deleteIds]);
  await query('DELETE FROM approval_tasks WHERE creative_variant_id = ANY($1::uuid[])', [deleteIds]);
  await query('DELETE FROM creative_variants WHERE id = ANY($1::uuid[])', [deleteIds]);

  // Clean up empty batches (batches with no remaining variants)
  await query(
    `DELETE FROM creative_batches WHERE client_id = $1
     AND id NOT IN (SELECT DISTINCT batch_id FROM creative_variants)`,
    [clientId]
  );

  return deleteIds.length;
}

// ── QA Reviews ──

export async function getReviews(variantId?: string): Promise<QAReview[]> {
  if (variantId) {
    return query<QAReview>('SELECT * FROM qa_reviews WHERE creative_variant_id = $1', [variantId]);
  }
  return query<QAReview>('SELECT * FROM qa_reviews ORDER BY reviewed_at DESC');
}

export async function addReview(review: QAReview): Promise<void> {
  await query(
    `INSERT INTO qa_reviews (id, creative_variant_id, status, review_json, reviewed_at)
     VALUES ($1,$2,$3,$4,$5)`,
    [review.id, review.creative_variant_id, review.status,
     safeJson(review.review_json), review.reviewed_at]
  );
}

// ── Approval Tasks ──

export async function getApprovalTasks(status?: string): Promise<ApprovalTask[]> {
  if (status) {
    return query<ApprovalTask>('SELECT * FROM approval_tasks WHERE status = $1 ORDER BY created_at DESC', [status]);
  }
  return query<ApprovalTask>('SELECT * FROM approval_tasks ORDER BY created_at DESC');
}

export async function getApprovalTask(id: string): Promise<ApprovalTask | undefined> {
  return queryOne<ApprovalTask>('SELECT * FROM approval_tasks WHERE id = $1', [id]);
}

export async function getApprovalTaskForVariant(variantId: string): Promise<ApprovalTask | undefined> {
  return queryOne<ApprovalTask>('SELECT * FROM approval_tasks WHERE creative_variant_id = $1', [variantId]);
}

export async function upsertApprovalTask(task: ApprovalTask): Promise<void> {
  await query(
    `INSERT INTO approval_tasks (id, creative_variant_id, assigned_to, status, decision_notes, decided_at, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (id) DO UPDATE SET
       status=EXCLUDED.status, decision_notes=EXCLUDED.decision_notes, decided_at=EXCLUDED.decided_at`,
    [task.id, task.creative_variant_id, task.assigned_to ?? null, task.status,
     task.decision_notes ?? null, task.decided_at ?? null, task.created_at]
  );
}

// ── Publish Actions ──

export async function getPublishActions(status?: string): Promise<PublishAction[]> {
  if (status) {
    return query<PublishAction>('SELECT * FROM publish_actions WHERE status = $1', [status]);
  }
  return query<PublishAction>('SELECT * FROM publish_actions ORDER BY created_at DESC');
}

export async function addPublishAction(action: PublishAction): Promise<void> {
  await query(
    `INSERT INTO publish_actions (id, creative_variant_id, platform, publish_mode, status, external_object_id, request_json, response_json, published_at, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [action.id, action.creative_variant_id, action.platform, action.publish_mode, action.status,
     action.external_object_id ?? null, safeJson(action.request_json), safeJson(action.response_json),
     action.published_at ?? null, action.created_at]
  );
}

export async function updatePublishAction(id: string, updates: Partial<PublishAction>): Promise<void> {
  const sets: string[] = [];
  const vals: any[] = [];
  let i = 1;
  for (const [key, val] of Object.entries(updates)) {
    sets.push(`${key} = $${i++}`);
    vals.push(typeof val === 'object' ? safeJson(val) : val);
  }
  vals.push(id);
  await query(`UPDATE publish_actions SET ${sets.join(', ')} WHERE id = $${i}`, vals);
}

// ── Performance Metrics ──

export async function getMetrics(publishActionId?: string): Promise<PerformanceMetric[]> {
  if (publishActionId) {
    return query<PerformanceMetric>('SELECT * FROM performance_metrics WHERE publish_action_id = $1', [publishActionId]);
  }
  return query<PerformanceMetric>('SELECT * FROM performance_metrics ORDER BY metric_date DESC');
}

export async function addMetric(metric: PerformanceMetric): Promise<void> {
  await query(
    `INSERT INTO performance_metrics (id, publish_action_id, metric_date, impressions, clicks, spend, ctr, leads, video_3s_views, video_completions, raw_metrics_json, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [metric.id, metric.publish_action_id, metric.metric_date, metric.impressions, metric.clicks,
     metric.spend, metric.ctr, metric.leads, metric.video_3s_views, metric.video_completions,
     safeJson(metric.raw_metrics_json), metric.created_at]
  );
}

// ── Users ──

export async function getUsers(): Promise<User[]> {
  return query<User>('SELECT * FROM users ORDER BY created_at');
}

export async function getUser(id: string): Promise<User | undefined> {
  return queryOne<User>('SELECT * FROM users WHERE id = $1', [id]);
}

export async function getUserByEmail(email: string): Promise<User | undefined> {
  return queryOne<User>('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [email]);
}

export async function upsertUser(user: User): Promise<User> {
  const row = await queryOne<User>(
    `INSERT INTO users (id, email, name, password_hash, role, active, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (id) DO UPDATE SET
       email=EXCLUDED.email, name=EXCLUDED.name, password_hash=EXCLUDED.password_hash,
       role=EXCLUDED.role, active=EXCLUDED.active, updated_at=EXCLUDED.updated_at
     RETURNING *`,
    [user.id, user.email, user.name, user.password_hash, user.role, user.active, user.created_at, user.updated_at]
  );
  return row!;
}

export async function deleteUser(id: string): Promise<boolean> {
  const rows = await query('DELETE FROM users WHERE id = $1 RETURNING id', [id]);
  return rows.length > 0;
}

// ── Sessions ──

export async function getSessionByToken(token: string): Promise<Session | undefined> {
  return queryOne<Session>('SELECT * FROM sessions WHERE token = $1', [token]);
}

export async function addSession(session: Session): Promise<void> {
  await query(
    'INSERT INTO sessions (id, user_id, token, expires_at, created_at) VALUES ($1,$2,$3,$4,$5)',
    [session.id, session.user_id, session.token, session.expires_at, session.created_at]
  );
}

export async function deleteSession(token: string): Promise<void> {
  await query('DELETE FROM sessions WHERE token = $1', [token]);
}

export async function deleteExpiredSessions(): Promise<void> {
  await query('DELETE FROM sessions WHERE expires_at < NOW()');
}

// ── Clients ──

export async function getClients(): Promise<Client[]> {
  return query<Client>('SELECT * FROM clients ORDER BY company');
}

export async function getClient(id: string): Promise<Client | undefined> {
  return queryOne<Client>('SELECT * FROM clients WHERE id = $1', [id]);
}

export async function upsertClient(client: Client): Promise<Client> {
  const row = await queryOne<Client>(
    `INSERT INTO clients (id, name, company, contact_person, email, phone, google_drive_folder_id, google_drive_folder_url, google_refresh_token, google_email, drive_last_sync_at, drive_file_count, api_config, meta_config, tiktok_config, notes, active, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
     ON CONFLICT (id) DO UPDATE SET
       name=EXCLUDED.name, company=EXCLUDED.company, contact_person=EXCLUDED.contact_person,
       email=EXCLUDED.email, phone=EXCLUDED.phone, google_drive_folder_id=EXCLUDED.google_drive_folder_id,
       google_drive_folder_url=EXCLUDED.google_drive_folder_url, google_refresh_token=COALESCE(EXCLUDED.google_refresh_token, clients.google_refresh_token),
       google_email=COALESCE(EXCLUDED.google_email, clients.google_email), drive_last_sync_at=EXCLUDED.drive_last_sync_at,
       drive_file_count=EXCLUDED.drive_file_count, api_config=EXCLUDED.api_config,
       meta_config=EXCLUDED.meta_config, tiktok_config=EXCLUDED.tiktok_config,
       notes=EXCLUDED.notes, active=EXCLUDED.active, updated_at=EXCLUDED.updated_at
     RETURNING *`,
    [client.id, client.name, client.company, client.contact_person, client.email, client.phone ?? null,
     client.google_drive_folder_id ?? null, client.google_drive_folder_url ?? null,
     client.google_refresh_token ?? null, client.google_email ?? null,
     client.drive_last_sync_at ?? null, client.drive_file_count ?? 0,
     safeJson(client.api_config ?? {}), safeJson(client.meta_config ?? {}), safeJson(client.tiktok_config ?? {}),
     client.notes ?? null, client.active, client.created_at, client.updated_at]
  );
  return row!;
}

export async function deleteClient(id: string): Promise<boolean> {
  const rows = await query('DELETE FROM clients WHERE id = $1 RETURNING id', [id]);
  return rows.length > 0;
}

// ── App Config (key-value) ──

export async function getConfig(key: string): Promise<any> {
  const row = await queryOne<{ value: any }>('SELECT value FROM app_config WHERE key = $1', [key]);
  return row?.value ?? null;
}

export async function setConfig(key: string, value: any): Promise<void> {
  await query(
    `INSERT INTO app_config (key, value, updated_at) VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [key, safeJson(value)]
  );
}

// ── Video Ad Presets ──

export async function getVideoPresets(activeOnly = false): Promise<any[]> {
  const where = activeOnly ? 'WHERE is_active = true' : '';
  return query(`SELECT * FROM video_ad_presets ${where} ORDER BY is_default DESC, name ASC`);
}

export async function getVideoPreset(id: string): Promise<any | undefined> {
  return queryOne('SELECT * FROM video_ad_presets WHERE id = $1', [id]);
}

export async function getVideoPresetBySlug(slug: string): Promise<any | undefined> {
  return queryOne('SELECT * FROM video_ad_presets WHERE slug = $1', [slug]);
}

export async function getDefaultVideoPreset(): Promise<any | undefined> {
  return queryOne('SELECT * FROM video_ad_presets WHERE is_default = true AND is_active = true');
}

export async function upsertVideoPreset(preset: any): Promise<any> {
  const row = await queryOne(
    `INSERT INTO video_ad_presets (id, name, slug, description, is_active, is_default, general_settings, text_settings, animation_settings, audio_settings, overlay_settings, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     ON CONFLICT (id) DO UPDATE SET
       name=EXCLUDED.name, slug=EXCLUDED.slug, description=EXCLUDED.description,
       is_active=EXCLUDED.is_active, is_default=EXCLUDED.is_default,
       general_settings=EXCLUDED.general_settings, text_settings=EXCLUDED.text_settings,
       animation_settings=EXCLUDED.animation_settings, audio_settings=EXCLUDED.audio_settings,
       overlay_settings=EXCLUDED.overlay_settings, updated_at=EXCLUDED.updated_at
     RETURNING *`,
    [preset.id, preset.name, preset.slug, preset.description ?? null,
     preset.is_active ?? true, preset.is_default ?? false,
     safeJson(preset.general_settings), safeJson(preset.text_settings),
     safeJson(preset.animation_settings), safeJson(preset.audio_settings),
     safeJson(preset.overlay_settings),
     preset.created_at ?? new Date().toISOString(), new Date().toISOString()]
  );
  return row!;
}

export async function deleteVideoPreset(id: string): Promise<boolean> {
  const rows = await query('DELETE FROM video_ad_presets WHERE id = $1 RETURNING id', [id]);
  return rows.length > 0;
}

export async function clearDefaultVideoPreset(): Promise<void> {
  await query('UPDATE video_ad_presets SET is_default = false WHERE is_default = true');
}

// ── Sound Assets ──

export async function getSoundAssets(category?: string): Promise<any[]> {
  if (category) return query('SELECT * FROM sound_assets WHERE category = $1 ORDER BY is_default DESC, name ASC', [category]);
  return query('SELECT * FROM sound_assets ORDER BY is_default DESC, name ASC');
}

export async function getSoundAsset(id: string): Promise<any | undefined> {
  return queryOne('SELECT * FROM sound_assets WHERE id = $1', [id]);
}

export async function getSoundAssetByChecksum(checksum: string): Promise<any | undefined> {
  return queryOne('SELECT * FROM sound_assets WHERE checksum = $1', [checksum]);
}

export async function getDefaultSoundAsset(): Promise<any | undefined> {
  return queryOne('SELECT * FROM sound_assets WHERE is_default = true LIMIT 1');
}

export async function addSoundAsset(asset: any): Promise<any> {
  return queryOne(
    `INSERT INTO sound_assets (id, name, filename, storage_key, storage_url, mime_type, file_size, duration_seconds, checksum, category, tags, is_default, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     RETURNING *`,
    [asset.id, asset.name, asset.filename, asset.storage_key, asset.storage_url,
     asset.mime_type, asset.file_size, asset.duration_seconds ?? null,
     asset.checksum, asset.category ?? 'music', asset.tags ?? [],
     asset.is_default ?? false, asset.created_at ?? new Date().toISOString()]
  );
}

export async function deleteSoundAsset(id: string): Promise<boolean> {
  const rows = await query('DELETE FROM sound_assets WHERE id = $1 RETURNING id', [id]);
  return rows.length > 0;
}

export async function setDefaultSoundAsset(id: string): Promise<void> {
  await query('UPDATE sound_assets SET is_default = false WHERE is_default = true');
  await query('UPDATE sound_assets SET is_default = true WHERE id = $1', [id]);
}

// ── Safe JSON stringify (handles already-parsed JSONB) ──

function safeJson(val: any): string {
  if (val === null || val === undefined) return '{}';
  if (typeof val === 'string') {
    try { JSON.parse(val); return val; } catch { return '{}'; }
  }
  const seen = new WeakSet();
  try {
    return JSON.stringify(val, (_key, value) => {
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) return undefined;
        seen.add(value);
      }
      if (typeof value === 'bigint') return Number(value);
      return value;
    });
  } catch { return '{}'; }
}

// ── Init DB ──

export async function initDatabase(): Promise<void> {
  // Run inline migrations — SQL files are not available on Vercel serverless
  const migrations = [
    `ALTER TABLE clients ADD COLUMN IF NOT EXISTS meta_config JSONB NOT NULL DEFAULT '{}'::jsonb`,
    `ALTER TABLE clients ADD COLUMN IF NOT EXISTS tiktok_config JSONB NOT NULL DEFAULT '{}'::jsonb`,
    `ALTER TABLE clients ADD COLUMN IF NOT EXISTS google_refresh_token TEXT`,
    `ALTER TABLE clients ADD COLUMN IF NOT EXISTS google_email TEXT`,
    `CREATE TABLE IF NOT EXISTS client_drive_media (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      file_id TEXT NOT NULL, file_name TEXT NOT NULL, mime_type TEXT NOT NULL, media_type TEXT NOT NULL,
      url TEXT NOT NULL, thumbnail_url TEXT, size INTEGER,
      drive_created_at TIMESTAMPTZ, drive_modified_at TIMESTAMPTZ,
      synced_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(client_id, file_id))`,
    `CREATE INDEX IF NOT EXISTS idx_client_drive_media_client ON client_drive_media(client_id)`,
    `CREATE INDEX IF NOT EXISTS idx_client_drive_media_type ON client_drive_media(client_id, media_type)`,
    // Performance indexes for scoring, creative, and publishing queries
    `CREATE INDEX IF NOT EXISTS idx_entity_snapshots_entity ON entity_snapshots(entity_id)`,
    `CREATE INDEX IF NOT EXISTS idx_creative_batches_entity ON creative_batches(entity_id)`,
    `CREATE INDEX IF NOT EXISTS idx_creative_batches_client ON creative_batches(client_id)`,
    `CREATE INDEX IF NOT EXISTS idx_creative_variants_batch ON creative_variants(batch_id)`,
    `CREATE INDEX IF NOT EXISTS idx_publish_actions_variant ON publish_actions(creative_variant_id)`,
    `CREATE INDEX IF NOT EXISTS idx_publish_actions_status ON publish_actions(status)`,
    `CREATE INDEX IF NOT EXISTS idx_performance_metrics_action ON performance_metrics(publish_action_id)`,
    `CREATE INDEX IF NOT EXISTS idx_approval_tasks_variant ON approval_tasks(creative_variant_id)`,
    `CREATE INDEX IF NOT EXISTS idx_approval_tasks_status ON approval_tasks(status)`,
    `CREATE INDEX IF NOT EXISTS idx_qa_reviews_variant ON qa_reviews(creative_variant_id)`,
  ];

  for (const stmt of migrations) {
    try { await sql(stmt); } catch (e: any) {
      if (!e.message?.includes('already exists') && !e.message?.includes('duplicate')) {
        console.error('[migration]', e.message?.slice(0, 120));
      }
    }
  }

  // Also try loading SQL files for full schema (works in local dev, not on Vercel)
  try {
    const fs = await import('fs');
    const path = await import('path');
    for (const file of ['db/schema.sql', 'db/migration.sql']) {
      const filepath = path.join(process.cwd(), file);
      if (!fs.existsSync(filepath)) continue;
      const content = fs.readFileSync(filepath, 'utf-8');
      const statements: string[] = [];
      let current = '', inBlock = false;
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.startsWith('--') && !inBlock) continue;
        if (trimmed.includes('DO $$')) inBlock = true;
        if (inBlock && trimmed.includes('END $$')) { current += line + '\n'; inBlock = false; statements.push(current.trim()); current = ''; continue; }
        if (inBlock) { current += line + '\n'; continue; }
        current += line + '\n';
        if (trimmed.endsWith(';')) { const s = current.trim().replace(/;$/, ''); if (s) statements.push(s); current = ''; }
      }
      if (current.trim()) statements.push(current.trim().replace(/;$/, ''));
      for (const s of statements) {
        if (!s) continue;
        try { await sql(s); } catch (e: any) {
          if (!e.message?.includes('already exists') && !e.message?.includes('duplicate')) console.error(e.message?.slice(0, 100));
        }
      }
    }
  } catch {}
}

// ── Legacy compatibility: store object ──
// ── Drive Media Cache ──

export async function upsertDriveMedia(clientId: string, files: DriveMediaCacheRow[]): Promise<void> {
  if (files.length === 0) {
    await query('DELETE FROM client_drive_media WHERE client_id = $1', [clientId]);
    return;
  }
  // Upsert all files
  for (const f of files) {
    await query(
      `INSERT INTO client_drive_media (id, client_id, file_id, file_name, mime_type, media_type, url, thumbnail_url, size, drive_created_at, drive_modified_at, synced_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (client_id, file_id) DO UPDATE SET
         file_name=EXCLUDED.file_name, mime_type=EXCLUDED.mime_type, media_type=EXCLUDED.media_type,
         url=EXCLUDED.url, thumbnail_url=EXCLUDED.thumbnail_url, size=EXCLUDED.size,
         drive_created_at=EXCLUDED.drive_created_at, drive_modified_at=EXCLUDED.drive_modified_at, synced_at=EXCLUDED.synced_at`,
      [f.id, clientId, f.file_id, f.file_name, f.mime_type, f.media_type, f.url, f.thumbnail_url ?? null, f.size ?? null, f.drive_created_at ?? null, f.drive_modified_at ?? null, f.synced_at]
    );
  }
  // Remove files no longer in Drive
  const fileIds = files.map(f => f.file_id);
  await query(
    `DELETE FROM client_drive_media WHERE client_id = $1 AND file_id != ALL($2::text[])`,
    [clientId, fileIds]
  );
}

export async function getDriveMediaByClient(clientId: string): Promise<DriveMediaCacheRow[]> {
  return query<DriveMediaCacheRow>('SELECT * FROM client_drive_media WHERE client_id = $1 ORDER BY drive_modified_at DESC NULLS LAST', [clientId]);
}

export async function getDriveMediaCount(clientId: string): Promise<number> {
  const row = await queryOne<{ count: string }>('SELECT COUNT(*) as count FROM client_drive_media WHERE client_id = $1', [clientId]);
  return parseInt(row?.count ?? '0', 10);
}

export async function getDriveVideoCount(clientId: string): Promise<number> {
  const row = await queryOne<{ count: string }>("SELECT COUNT(*) as count FROM client_drive_media WHERE client_id = $1 AND media_type = 'video'", [clientId]);
  return parseInt(row?.count ?? '0', 10);
}

// ── Scoring adapters: real data for history + audience + suppression ──

/** Recent publish count for an entity (last N days). Used for overuse suppression. */
export async function getRecentPublishCount(entityId: string, days: number = 7): Promise<number> {
  const row = await queryOne<{ count: string }>(
    `SELECT COUNT(*) as count FROM publish_actions pa
     JOIN creative_variants cv ON cv.id = pa.creative_variant_id
     JOIN creative_batches cb ON cb.id = cv.batch_id
     WHERE cb.entity_id = $1 AND pa.status = 'published'
       AND pa.published_at > NOW() - INTERVAL '1 day' * $2`,
    [entityId, days]
  );
  return parseInt(row?.count ?? '0', 10);
}

/** Average CTR for an entity from published campaigns. Returns null if no data. */
export async function getEntityPerformance(entityId: string): Promise<{ avg_ctr: number; total_impressions: number; total_clicks: number; campaign_count: number } | null> {
  const row = await queryOne<{ avg_ctr: string; total_impressions: string; total_clicks: string; campaign_count: string }>(
    `SELECT
       COALESCE(AVG(pm.ctr), 0) as avg_ctr,
       COALESCE(SUM(pm.impressions), 0) as total_impressions,
       COALESCE(SUM(pm.clicks), 0) as total_clicks,
       COUNT(DISTINCT pa.id) as campaign_count
     FROM publish_actions pa
     JOIN creative_variants cv ON cv.id = pa.creative_variant_id
     JOIN creative_batches cb ON cb.id = cv.batch_id
     LEFT JOIN performance_metrics pm ON pm.publish_action_id = pa.id
     WHERE cb.entity_id = $1 AND pa.status = 'published'`,
    [entityId]
  );
  if (!row || parseInt(row.campaign_count) === 0) return null;
  return {
    avg_ctr: parseFloat(row.avg_ctr),
    total_impressions: parseInt(row.total_impressions),
    total_clicks: parseInt(row.total_clicks),
    campaign_count: parseInt(row.campaign_count),
  };
}

/** Average CTR for a given audience segment across all campaigns. Returns null if no data. */
export async function getAudiencePerformance(audience: string): Promise<{ avg_ctr: number; campaign_count: number } | null> {
  const row = await queryOne<{ avg_ctr: string; campaign_count: string }>(
    `SELECT
       COALESCE(AVG(pm.ctr), 0) as avg_ctr,
       COUNT(DISTINCT pa.id) as campaign_count
     FROM publish_actions pa
     JOIN creative_variants cv ON cv.id = pa.creative_variant_id
     JOIN creative_batches cb ON cb.id = cv.batch_id
     LEFT JOIN performance_metrics pm ON pm.publish_action_id = pa.id
     WHERE cb.audience = $1 AND pa.status = 'published'`,
    [audience]
  );
  if (!row || parseInt(row.campaign_count) === 0) return null;
  return {
    avg_ctr: parseFloat(row.avg_ctr),
    campaign_count: parseInt(row.campaign_count),
  };
}

/** Dashboard summary using SQL aggregates instead of fetching all rows. */
export async function getDashboardSummary(): Promise<Record<string, number>> {
  const rows = await query<Record<string, string>>(`
    SELECT
      (SELECT COUNT(*) FROM source_entities)::int as total_entities,
      (SELECT COUNT(*) FROM source_entities WHERE campaign_ready = true)::int as campaign_ready,
      (SELECT COUNT(*) FROM campaign_candidates)::int as total_candidates,
      (SELECT COUNT(*) FROM campaign_candidates WHERE selected = true)::int as selected_candidates,
      (SELECT COUNT(*) FROM creative_batches)::int as total_batches,
      (SELECT COUNT(*) FROM creative_variants)::int as total_variants,
      (SELECT COUNT(*) FROM approval_tasks WHERE status = 'pending')::int as approvals_pending,
      (SELECT COUNT(*) FROM approval_tasks WHERE status = 'approved')::int as approvals_approved,
      (SELECT COUNT(*) FROM approval_tasks WHERE status = 'rejected')::int as approvals_rejected,
      (SELECT COUNT(*) FROM qa_reviews WHERE status = 'pass')::int as qa_pass,
      (SELECT COUNT(*) FROM qa_reviews WHERE status = 'warn')::int as qa_warn,
      (SELECT COUNT(*) FROM qa_reviews WHERE status = 'fail')::int as qa_fail,
      (SELECT COUNT(*) FROM publish_actions WHERE status = 'published')::int as total_published,
      (SELECT COUNT(*) FROM publish_actions WHERE status = 'failed')::int as publish_failed,
      (SELECT COUNT(*) FROM publish_actions WHERE status = 'published' AND platform = 'facebook')::int as published_facebook,
      (SELECT COUNT(*) FROM publish_actions WHERE status = 'published' AND platform = 'instagram')::int as published_instagram,
      (SELECT COUNT(*) FROM publish_actions WHERE status = 'published' AND platform = 'tiktok')::int as published_tiktok,
      (SELECT COUNT(*) FROM performance_metrics)::int as total_metrics_records,
      COALESCE((SELECT SUM(impressions) FROM performance_metrics), 0)::int as total_impressions,
      COALESCE((SELECT SUM(clicks) FROM performance_metrics), 0)::int as total_clicks,
      COALESCE((SELECT SUM(spend) FROM performance_metrics), 0)::numeric as total_spend,
      COALESCE((SELECT SUM(leads) FROM performance_metrics), 0)::int as total_leads
  `);
  const row = rows[0];
  if (!row) return {};
  const result: Record<string, number> = {};
  for (const [key, val] of Object.entries(row)) {
    result[key] = Number(val) || 0;
  }
  return result;
}

/** Check if a variant+platform combo was already published. Used for idempotency. */
export async function getExistingPublish(variantId: string, platform: string): Promise<PublishAction | undefined> {
  return queryOne<PublishAction>(
    `SELECT * FROM publish_actions WHERE creative_variant_id = $1 AND platform = $2 AND status = 'published' LIMIT 1`,
    [variantId, platform]
  );
}

/** Create a source_sync_runs row at the start of a sync. */
export async function createSyncRun(id: string, checkpointFrom?: string): Promise<void> {
  await query(
    `INSERT INTO source_sync_runs (id, started_at, checkpoint_from, status)
     VALUES ($1, NOW(), $2, 'running')`,
    [id, checkpointFrom ?? null]
  );
}

/** Finish a source_sync_runs row. */
export async function finishSyncRun(id: string, status: string, stats: Record<string, unknown>, error?: string): Promise<void> {
  await query(
    `UPDATE source_sync_runs SET finished_at = NOW(), checkpoint_to = NOW(), status = $2, stats_json = $3, error_text = $4 WHERE id = $1`,
    [id, status, JSON.stringify(stats), error ?? null]
  );
}

/** Get the last successful sync checkpoint. */
export async function getLastSyncCheckpoint(): Promise<string | null> {
  const row = await queryOne<{ checkpoint_to: string }>(
    `SELECT checkpoint_to FROM source_sync_runs WHERE status = 'completed' ORDER BY finished_at DESC LIMIT 1`
  );
  return row?.checkpoint_to ?? null;
}

// Some files import { store } - provide a compatible wrapper
export const store = {
  getEntities, getEntity, getEntityBySourceId, upsertEntity, getEntitiesByClient, deleteStaleEntities, deleteCandidatesByClient,
  getSnapshots, getSnapshot, addSnapshot,
  getChangeEvents, addChangeEvent,
  getCandidates, getCandidate, upsertCandidate, getCandidatesByClient,
  getBatches, addBatch, getBatchesByClient, deleteBatch, deleteUnapprovedCreatives,
  getVariants, getVariant, addVariant, updateVariant, deleteVariant, deleteVariants,
  getReviews, addReview,
  getApprovalTasks, getApprovalTask, getApprovalTaskForVariant, upsertApprovalTask,
  getPublishActions, addPublishAction, updatePublishAction,
  getMetrics, addMetric,
  getUsers, getUser, getUserByEmail, upsertUser, deleteUser,
  getSessionByToken, addSession, deleteSession, deleteExpiredSessions,
  getClients, getClient, upsertClient, deleteClient,
  upsertDriveMedia, getDriveMediaByClient, getDriveMediaCount, getDriveVideoCount,
  getRecentPublishCount, getEntityPerformance, getAudiencePerformance, getExistingPublish, getDashboardSummary,
  createSyncRun, finishSyncRun, getLastSyncCheckpoint,
  getConfig, setConfig,
  getVideoPresets, getVideoPreset, getVideoPresetBySlug, getDefaultVideoPreset, upsertVideoPreset, deleteVideoPreset, clearDefaultVideoPreset,
  getSoundAssets, getSoundAsset, getSoundAssetByChecksum, getDefaultSoundAsset, addSoundAsset, deleteSoundAsset, setDefaultSoundAsset,
  initDatabase,
};
