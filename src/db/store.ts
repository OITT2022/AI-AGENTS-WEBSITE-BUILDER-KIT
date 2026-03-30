import { sql, sqlTagged } from './neon';
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
    `INSERT INTO clients (id, name, company, contact_person, email, phone, google_drive_folder_id, google_drive_folder_url, drive_last_sync_at, drive_file_count, api_config, meta_config, tiktok_config, notes, active, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
     ON CONFLICT (id) DO UPDATE SET
       name=EXCLUDED.name, company=EXCLUDED.company, contact_person=EXCLUDED.contact_person,
       email=EXCLUDED.email, phone=EXCLUDED.phone, google_drive_folder_id=EXCLUDED.google_drive_folder_id,
       google_drive_folder_url=EXCLUDED.google_drive_folder_url, drive_last_sync_at=EXCLUDED.drive_last_sync_at,
       drive_file_count=EXCLUDED.drive_file_count, api_config=EXCLUDED.api_config,
       meta_config=EXCLUDED.meta_config, tiktok_config=EXCLUDED.tiktok_config,
       notes=EXCLUDED.notes, active=EXCLUDED.active, updated_at=EXCLUDED.updated_at
     RETURNING *`,
    [client.id, client.name, client.company, client.contact_person, client.email, client.phone ?? null,
     client.google_drive_folder_id ?? null, client.google_drive_folder_url ?? null,
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
  try {
    // Check if tables exist by querying users table
    await sql('SELECT 1 FROM users LIMIT 1');
  } catch {
    // Tables don't exist - run migrations from SQL files
    const fs = await import('fs');
    const path = await import('path');
    const schemaPath = path.join(process.cwd(), 'db', 'schema.sql');
    const migrationPath = path.join(process.cwd(), 'db', 'migration.sql');

    for (const filepath of [schemaPath, migrationPath]) {
      try {
        const content = fs.readFileSync(filepath, 'utf-8');
        const statements: string[] = [];
        let current = '';
        let inBlock = false;
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
        for (const stmt of statements) {
          if (!stmt) continue;
          try { await sql(stmt); } catch (e: any) {
            if (!e.message?.includes('already exists') && !e.message?.includes('duplicate')) console.error(e.message?.slice(0, 100));
          }
        }
      } catch {}
    }
  }
}

// ── Legacy compatibility: store object ──
// Some files import { store } - provide a compatible wrapper
export const store = {
  getEntities, getEntity, getEntityBySourceId, upsertEntity, getEntitiesByClient,
  getSnapshots, getSnapshot, addSnapshot,
  getChangeEvents, addChangeEvent,
  getCandidates, getCandidate, upsertCandidate, getCandidatesByClient,
  getBatches, addBatch, getBatchesByClient,
  getVariants, getVariant, addVariant, updateVariant,
  getReviews, addReview,
  getApprovalTasks, getApprovalTask, getApprovalTaskForVariant, upsertApprovalTask,
  getPublishActions, addPublishAction, updatePublishAction,
  getMetrics, addMetric,
  getUsers, getUser, getUserByEmail, upsertUser, deleteUser,
  getSessionByToken, addSession, deleteSession, deleteExpiredSessions,
  getClients, getClient, upsertClient, deleteClient,
  getConfig, setConfig,
  initDatabase,
};
