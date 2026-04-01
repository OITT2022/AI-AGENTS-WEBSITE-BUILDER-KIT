import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { store, initDatabase } from './db/store';
import { ingestProperty, ingestProject } from './services/ingest';
import { scoreAndSelectCandidates } from './services/scoring';
import { generateCreativesForCandidate } from './services/creative';
import { runQAAndCreateApprovals } from './services/qa';
import { runDailyPipeline, ingestAndRunPipeline } from './services/pipeline';
import { loadConfig, saveConfig, syncFromFindUs, testConnection } from './services/findus-client';
import {
  hasCredentials, saveCredentials, getServiceAccountEmail,
  testDriveConnection, syncDriveMedia, listFolderFiles, extractFolderId,
} from './services/google-drive';
import {
  ensureDefaultAdmin, login, logout, getSessionUser,
  createUser, updateUser, deleteUser, listUsers,
  requireAuth, requireRole, AuthRequest,
} from './services/auth';

const app = express();

function paramId(req: express.Request): string {
  const id = req.params.id;
  return Array.isArray(id) ? id[0] : id;
}
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '50mb' }));
// Serve static dashboard files - handle both local dev and Vercel
const publicDir = path.join(process.cwd(), 'public');
app.use('/dashboard', express.static(publicDir));

// Google domain verification
app.get('/google8379582d5bf9d84d.html', (_req, res) => {
  res.type('html').send('google-site-verification: google8379582d5bf9d84d.html');
});

const uploadDir = path.join(process.env.VERCEL ? '/tmp' : process.cwd(), 'data', 'uploads');
try { if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true }); } catch {}
const upload = multer({ dest: uploadDir, limits: { fileSize: 50 * 1024 * 1024 } });

// ── Auth routes (public) ──

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  const result = await login(email, password);
  if (!result) return res.status(401).json({ error: 'Invalid email or password' });
  res.setHeader('Set-Cookie', `auth_token=${result.token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${24 * 3600}`);
  res.json({ success: true, user: result.user, token: result.token });
});

app.post('/api/auth/logout', async (req, res) => {
  const cookie = (req.headers.cookie ?? '').split(';').map(c => c.trim()).find(c => c.startsWith('auth_token='));
  const token = cookie?.split('=')[1] ?? req.headers.authorization?.replace('Bearer ', '');
  if (token) await logout(token);
  res.setHeader('Set-Cookie', 'auth_token=; Path=/; HttpOnly; Max-Age=0');
  res.json({ success: true });
});

app.get('/api/auth/me', async (req, res) => {
  const cookie = (req.headers.cookie ?? '').split(';').map(c => c.trim()).find(c => c.startsWith('auth_token='));
  const token = cookie?.split('=')[1] ?? req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  const user = await getSessionUser(token);
  if (!user) return res.status(401).json({ error: 'Invalid session' });
  res.json({ user });
});

// ── User management (admin only) ──

app.get('/api/users', requireAuth, requireRole('admin'), async (_req, res) => { res.json(await listUsers()); });

app.post('/api/users', requireAuth, requireRole('admin'), async (req: AuthRequest, res) => {
  try {
    const { email, name, password, role } = req.body;
    if (!email || !name || !password) return res.status(400).json({ error: 'Email, name, and password required' });
    res.json({ success: true, user: await createUser(email, name, password, role ?? 'viewer') });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

app.put('/api/users/:id', requireAuth, requireRole('admin'), async (req: AuthRequest, res) => {
  try { res.json({ success: true, user: await updateUser(paramId(req), req.body) }); }
  catch (err: any) { res.status(400).json({ error: err.message }); }
});

app.delete('/api/users/:id', requireAuth, requireRole('admin'), async (req: AuthRequest, res) => {
  if (paramId(req) === req.user?.id) return res.status(400).json({ error: 'Cannot delete your own account' });
  if (!(await deleteUser(paramId(req)))) return res.status(404).json({ error: 'User not found' });
  res.json({ success: true });
});

// ── Protect all API routes below ──
app.use('/api', requireAuth);

// ── Clients ──

app.get('/api/clients', async (_req, res) => { res.json(await store.getClients()); });

app.get('/api/clients/:id', async (req, res) => {
  const c = await store.getClient(paramId(req));
  if (!c) return res.status(404).json({ error: 'Client not found' });
  res.json(c);
});

app.post('/api/clients', requireRole('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const { name, company, contact_person, email, phone, google_drive_folder_id, google_drive_folder_url, api_config, notes } = req.body;
    if (!name || !company || !email) return res.status(400).json({ error: 'Name, company, and email required' });
    const now = new Date().toISOString();
    const client = await store.upsertClient({
      id: require('uuid').v4(), name, company, contact_person: contact_person ?? name, email, phone,
      google_drive_folder_id, google_drive_folder_url, api_config, notes, active: true, created_at: now, updated_at: now,
    });
    res.json({ success: true, client });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

app.put('/api/clients/:id', requireRole('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const client = await store.getClient(paramId(req));
    if (!client) return res.status(404).json({ error: 'Client not found' });
    const updated = { ...client, ...req.body, id: client.id, created_at: client.created_at, updated_at: new Date().toISOString() };
    await store.upsertClient(updated);
    res.json({ success: true, client: updated });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

app.delete('/api/clients/:id', requireRole('admin'), async (req: AuthRequest, res) => {
  const clientId = paramId(req);
  try {
    const { sql } = await import('./db/neon');
    // Delete all related data in correct order (respecting foreign keys)
    await sql('DELETE FROM approval_tasks WHERE creative_variant_id IN (SELECT cv.id FROM creative_variants cv JOIN creative_batches cb ON cv.batch_id = cb.id WHERE cb.client_id = $1)', [clientId]);
    await sql('DELETE FROM qa_reviews WHERE creative_variant_id IN (SELECT cv.id FROM creative_variants cv JOIN creative_batches cb ON cv.batch_id = cb.id WHERE cb.client_id = $1)', [clientId]);
    await sql('DELETE FROM creative_variants WHERE batch_id IN (SELECT id FROM creative_batches WHERE client_id = $1)', [clientId]);
    await sql('DELETE FROM creative_batches WHERE client_id = $1', [clientId]);
    await sql('DELETE FROM campaign_candidates WHERE client_id = $1', [clientId]);
    await sql('DELETE FROM entity_change_events WHERE entity_id IN (SELECT id FROM source_entities WHERE client_id = $1)', [clientId]);
    await sql('DELETE FROM entity_snapshots WHERE entity_id IN (SELECT id FROM source_entities WHERE client_id = $1)', [clientId]);
    await sql('DELETE FROM source_entities WHERE client_id = $1', [clientId]);
    await sql('DELETE FROM clients WHERE id = $1', [clientId]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Per-client campaign data ──

app.get('/api/clients/:id/dashboard', async (req, res) => {
  const clientId = paramId(req);
  const client = await store.getClient(clientId);
  if (!client) return res.status(404).json({ error: 'Client not found' });

  // Use direct SQL counts instead of fetching all records
  const { sql } = await import('./db/neon');
  const [entities] = await sql('SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE campaign_ready = true) as ready FROM source_entities WHERE client_id = $1', [clientId]);
  const [candidates] = await sql('SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE selected = true) as selected FROM campaign_candidates WHERE client_id = $1', [clientId]);
  const [batches] = await sql('SELECT COUNT(*) as total FROM creative_batches WHERE client_id = $1', [clientId]);
  const [variants] = await sql('SELECT COUNT(*) as total FROM creative_variants cv JOIN creative_batches cb ON cv.batch_id = cb.id WHERE cb.client_id = $1', [clientId]);
  const [approvals] = await sql('SELECT COUNT(*) FILTER (WHERE at.status = \'pending\') as pending, COUNT(*) FILTER (WHERE at.status = \'approved\') as approved, COUNT(*) FILTER (WHERE at.status = \'rejected\') as rejected FROM approval_tasks at JOIN creative_variants cv ON at.creative_variant_id = cv.id JOIN creative_batches cb ON cv.batch_id = cb.id WHERE cb.client_id = $1', [clientId]);
  const [reviews] = await sql('SELECT COUNT(*) FILTER (WHERE qr.status = \'pass\') as pass, COUNT(*) FILTER (WHERE qr.status = \'warn\') as warn, COUNT(*) FILTER (WHERE qr.status = \'fail\') as fail FROM qa_reviews qr JOIN creative_variants cv ON qr.creative_variant_id = cv.id JOIN creative_batches cb ON cv.batch_id = cb.id WHERE cb.client_id = $1', [clientId]);

  res.json({
    client,
    total_entities: Number(entities.total), campaign_ready: Number(entities.ready),
    total_candidates: Number(candidates.total), selected_candidates: Number(candidates.selected),
    total_batches: Number(batches.total), total_variants: Number(variants.total),
    approvals_pending: Number(approvals.pending), approvals_approved: Number(approvals.approved), approvals_rejected: Number(approvals.rejected),
    qa_pass: Number(reviews.pass), qa_warn: Number(reviews.warn), qa_fail: Number(reviews.fail),
  });
});

app.get('/api/clients/:id/entities', async (req, res) => {
  const entities = await store.getEntitiesByClient(paramId(req));
  const enriched = await Promise.all(entities.map(async e => {
    const snapshot = e.current_snapshot_id ? await store.getSnapshot(e.current_snapshot_id) : undefined;
    return { ...e, snapshot: snapshot?.normalized_payload };
  }));
  res.json(enriched);
});

app.get('/api/clients/:id/candidates', async (req, res) => {
  const candidates = await store.getCandidatesByClient(paramId(req), req.query.date as string);
  const enriched = await Promise.all(candidates.map(async c => {
    const entity = await store.getEntity(c.entity_id);
    const snapshot = entity?.current_snapshot_id ? await store.getSnapshot(entity.current_snapshot_id) : undefined;
    return { ...c, entity, snapshot: snapshot?.normalized_payload };
  }));
  res.json(enriched);
});

app.get('/api/clients/:id/creatives', async (req, res) => {
  const batches = await store.getBatchesByClient(paramId(req));
  const enriched = await Promise.all(batches.map(async b => {
    const variants = await store.getVariants(b.id);
    const entity = await store.getEntity(b.entity_id);
    const vwr = await Promise.all(variants.map(async v => {
      const reviews = await store.getReviews(v.id);
      const approval = await store.getApprovalTaskForVariant(v.id);
      return { ...v, reviews, approval };
    }));
    return { ...b, entity, variants: vwr };
  }));
  res.json(enriched);
});

app.get('/api/clients/:id/approvals', async (req, res) => {
  const batches = await store.getBatchesByClient(paramId(req));
  const variantIds = new Set<string>();
  for (const b of batches) { for (const v of await store.getVariants(b.id)) variantIds.add(v.id); }
  let tasks = (await store.getApprovalTasks(req.query.status as string)).filter(t => variantIds.has(t.creative_variant_id));
  const enriched = await Promise.all(tasks.map(async t => {
    const variant = await store.getVariant(t.creative_variant_id);
    let entity, snapshot;
    if (variant) {
      const batch = batches.find(b => b.id === variant.batch_id);
      if (batch) { entity = await store.getEntity(batch.entity_id); snapshot = entity?.current_snapshot_id ? (await store.getSnapshot(entity.current_snapshot_id))?.normalized_payload : undefined; }
    }
    return { ...t, variant, entity, snapshot };
  }));
  res.json(enriched);
});

app.post('/api/clients/:id/sync', async (req, res) => {
  try {
    const client = await store.getClient(paramId(req));
    if (!client) return res.status(404).json({ error: 'Client not found' });
    if (!client.api_config?.api_token) return res.status(400).json({ error: 'No API config' });
    // Ensure api_config is a plain object (Neon returns parsed JSONB)
    const apiConfig = {
      base_url: String(client.api_config.base_url || ''),
      api_token: String(client.api_config.api_token || ''),
      filters: {
        city: client.api_config.filters?.city ? String(client.api_config.filters.city) : undefined,
        propertyType: client.api_config.filters?.propertyType ? String(client.api_config.filters.propertyType) : undefined,
      },
    };
    const result = await syncFromFindUs(req.body.run_pipeline !== false, client.id, apiConfig);
    res.json({ success: true, result });
  } catch (err: any) {
    console.error('Sync error:', err.stack?.split('\n').slice(0, 5).join('\n'));
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/clients/:id/pipeline', async (req, res) => {
  try {
    const client = await store.getClient(paramId(req));
    if (!client) return res.status(404).json({ error: 'Client not found' });
    res.json({ success: true, result: await runDailyPipeline(req.body.date, client.id) });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// ── Google Config (client-side OAuth + Picker) ──

app.get('/api/config/google', (_req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID || '';
  const apiKey = process.env.GOOGLE_API_KEY || '';
  if (!clientId || !apiKey) return res.status(500).json({ error: 'Google OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_API_KEY env vars.' });
  res.json({ client_id: clientId, api_key: apiKey });
});

// ── Google Drive ──

app.get('/api/drive/status', (_req, res) => {
  res.json({ configured: hasCredentials(), service_account_email: getServiceAccountEmail() });
});

app.post('/api/drive/credentials', requireRole('admin'), upload.single('credentials'), (req: AuthRequest, res) => {
  try {
    let creds: Record<string, unknown>;
    if (req.file) { creds = JSON.parse(fs.readFileSync(req.file.path, 'utf-8')); fs.unlinkSync(req.file.path); }
    else if (req.body.credentials) { creds = typeof req.body.credentials === 'string' ? JSON.parse(req.body.credentials) : req.body.credentials; }
    else return res.status(400).json({ error: 'Provide credentials JSON' });
    if (!creds.client_email || !creds.private_key) return res.status(400).json({ error: 'Invalid service account JSON' });
    saveCredentials(creds);
    res.json({ success: true, service_account_email: creds.client_email });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

app.post('/api/drive/test', async (req, res) => {
  try { res.json(await testDriveConnection(req.body.folder_url)); }
  catch (err: any) { res.json({ success: false, message: err.message }); }
});

app.get('/api/drive/browse/:folderId', async (req, res) => {
  try {
    const { browseDriveFolder } = await import('./services/google-drive');
    const folderId = req.params.folderId;
    const items = await browseDriveFolder(folderId);
    res.json({ items });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.get('/api/clients/:id/drive/files', async (req, res) => {
  try {
    const client = await store.getClient(paramId(req));
    if (!client) return res.status(404).json({ error: 'Client not found' });
    const fi = client.google_drive_folder_id ?? client.google_drive_folder_url;
    if (!fi) return res.status(400).json({ error: 'No Drive folder' });
    const folderIds = fi.split(',').map((id: string) => extractFolderId(id.trim())).filter(Boolean);
    const allFiles: Awaited<ReturnType<typeof listFolderFiles>> = [];
    for (const fid of folderIds) { allFiles.push(...await listFolderFiles(fid)); }
    res.json({ folder_ids: folderIds, files: allFiles, total: allFiles.length });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.post('/api/clients/:id/drive/sync', async (req, res) => {
  try {
    const client = await store.getClient(paramId(req));
    if (!client) return res.status(404).json({ error: 'Client not found' });
    res.json({ success: true, result: await syncDriveMedia(client) });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// ── Ingest ──

app.post('/api/ingest/property', upload.array('images', 20), async (req, res) => {
  try {
    const data = JSON.parse(req.body.property ?? req.body.data ?? '{}');
    const files = (req.files as Express.Multer.File[]) ?? [];
    if (files.length > 0) {
      if (!data.media) data.media = {};
      const urls = files.map(f => `/api/media/uploads/${f.filename}`);
      if (!data.media.hero_image && urls[0]) data.media.hero_image = urls[0];
      data.media.gallery = [...(data.media.gallery ?? []), ...urls];
    }
    res.json({ success: true, result: await ingestProperty(data, req.body.client_id) });
  } catch (err: any) { res.status(400).json({ success: false, error: err.message }); }
});

app.post('/api/ingest/project', async (req, res) => {
  try { res.json({ success: true, result: await ingestProject(req.body, req.body.client_id) }); }
  catch (err: any) { res.status(400).json({ success: false, error: err.message }); }
});

app.post('/api/ingest/batch', async (req, res) => {
  try {
    const { properties = [], projects = [], client_id } = req.body;
    res.json({ success: true, result: await ingestAndRunPipeline(properties, projects, undefined, client_id) });
  } catch (err: any) { res.status(400).json({ success: false, error: err.message }); }
});

app.use('/api/media/uploads', express.static(uploadDir));

// ── Pipeline ──

app.post('/api/pipeline/run', async (req, res) => {
  try { res.json({ success: true, result: await runDailyPipeline(req.body.date, req.body.client_id) }); }
  catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// ── Entities ──

app.get('/api/entities', async (_req, res) => {
  const entities = await store.getEntities();
  const enriched = await Promise.all(entities.map(async e => {
    const snapshot = e.current_snapshot_id ? await store.getSnapshot(e.current_snapshot_id) : undefined;
    return { ...e, snapshot: snapshot?.normalized_payload };
  }));
  res.json(enriched);
});

app.get('/api/entities/:id', async (req, res) => {
  const entity = await store.getEntity(paramId(req));
  if (!entity) return res.status(404).json({ error: 'Not found' });
  res.json({ ...entity, snapshots: await store.getSnapshots(entity.id), changes: await store.getChangeEvents(entity.id) });
});

// ── Candidates ──

app.get('/api/candidates', async (req, res) => {
  const candidates = await store.getCandidates(req.query.date as string);
  const enriched = await Promise.all(candidates.map(async c => {
    const entity = await store.getEntity(c.entity_id);
    const snapshot = entity?.current_snapshot_id ? await store.getSnapshot(entity.current_snapshot_id) : undefined;
    return { ...c, entity, snapshot: snapshot?.normalized_payload };
  }));
  res.json(enriched);
});

app.post('/api/candidates/generate', async (req, res) => {
  try {
    const today = req.body.date ?? new Date().toISOString().split('T')[0];
    const candidates = await scoreAndSelectCandidates(today, req.body.max_candidates ?? 10);
    res.json({ success: true, total: candidates.length, selected: candidates.filter(c => c.selected).length, candidates });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// ── Creatives ──

app.get('/api/creatives', async (req, res) => {
  const batches = await store.getBatches(req.query.entity_id as string);
  const enriched = await Promise.all(batches.map(async b => {
    const variants = await store.getVariants(b.id);
    const entity = await store.getEntity(b.entity_id);
    const vwr = await Promise.all(variants.map(async v => ({ ...v, reviews: await store.getReviews(v.id), approval: await store.getApprovalTaskForVariant(v.id) })));
    return { ...b, entity, variants: vwr };
  }));
  res.json(enriched);
});

app.post('/api/creatives/generate', async (req, res) => {
  try {
    const candidate = await store.getCandidate(req.body.candidate_id);
    if (!candidate) return res.status(404).json({ error: 'Candidate not found' });
    const result = await generateCreativesForCandidate(candidate);
    const qa = await runQAAndCreateApprovals(result.batch.id);
    res.json({ success: true, batch: result.batch, variants: result.variants, ...qa });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

app.put('/api/creatives/:id', async (req, res) => {
  try {
    const id = paramId(req);
    const variant = await store.getVariant(id);
    if (!variant) return res.status(404).json({ error: 'Variant not found' });
    const { copy_json } = req.body;
    if (copy_json) await store.updateVariant(id, { copy_json });
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// ── Approvals ──

app.get('/api/approvals', async (req, res) => {
  const tasks = await store.getApprovalTasks(req.query.status as string);
  const enriched = await Promise.all(tasks.map(async t => {
    const variant = await store.getVariant(t.creative_variant_id);
    let entity, snapshot;
    if (variant) {
      const batches = await store.getBatches();
      const batch = batches.find(b => b.id === variant.batch_id);
      if (batch) { entity = await store.getEntity(batch.entity_id); snapshot = entity?.current_snapshot_id ? (await store.getSnapshot(entity.current_snapshot_id))?.normalized_payload : undefined; }
    }
    return { ...t, variant, entity, snapshot };
  }));
  res.json(enriched);
});

app.put('/api/approvals/:id', async (req, res) => {
  try {
    const task = await store.getApprovalTask(paramId(req));
    if (!task) return res.status(404).json({ error: 'Not found' });
    task.status = req.body.status; task.decision_notes = req.body.decision_notes; task.decided_at = new Date().toISOString();
    await store.upsertApprovalTask(task);
    res.json({ success: true, task });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// ── Dashboard ──

app.get('/api/dashboard/summary', async (_req, res) => {
  const [entities, candidates, batches, variants, approvals, reviews] = await Promise.all([
    store.getEntities(), store.getCandidates(), store.getBatches(), store.getVariants(), store.getApprovalTasks(), store.getReviews(),
  ]);
  res.json({
    total_entities: entities.length, campaign_ready: entities.filter(e => e.campaign_ready).length,
    total_candidates: candidates.length, selected_candidates: candidates.filter(c => c.selected).length,
    total_batches: batches.length, total_variants: variants.length,
    approvals_pending: approvals.filter(a => a.status === 'pending').length,
    approvals_approved: approvals.filter(a => a.status === 'approved').length,
    approvals_rejected: approvals.filter(a => a.status === 'rejected').length,
    qa_pass: reviews.filter(r => r.status === 'pass').length, qa_warn: reviews.filter(r => r.status === 'warn').length, qa_fail: reviews.filter(r => r.status === 'fail').length,
  });
});

// ── FindUs Connector ──

app.get('/api/findus/config', async (_req, res) => {
  const config = await loadConfig();
  res.json({ ...config, api_token: config.api_token ? '••••' + config.api_token.slice(-4) : '', has_token: !!config.api_token });
});

app.get('/api/findus/config/reveal', requireRole('admin'), async (_req: AuthRequest, res) => {
  res.json({ api_token: (await loadConfig()).api_token || '' });
});

app.put('/api/findus/config', async (req, res) => {
  try {
    const updated = await saveConfig(req.body);
    res.json({ success: true, config: { ...updated, api_token: updated.api_token ? '••••' + updated.api_token.slice(-4) : '', has_token: !!updated.api_token } });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/findus/test', async (req, res) => {
  try {
    const cfg = await loadConfig();
    res.json(await testConnection(req.body.api_token || cfg.api_token, req.body.base_url || cfg.base_url));
  } catch (err: any) { res.json({ success: false, message: err.message }); }
});

app.post('/api/findus/sync', async (req, res) => {
  try { res.json({ success: true, result: await syncFromFindUs(req.body.run_pipeline !== false) }); }
  catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// ── Root ──

// Clear all campaign data (keeps clients and users)
// ── Social Platform OAuth & Publishing ──

const {
  getMetaAuthUrl, exchangeMetaCode, getMetaPages,
  publishToFacebook, publishToInstagram,
  getTikTokAuthUrl, exchangeTikTokCode, getTikTokUserInfo,
} = require('./services/social-publish');

// Meta OAuth
app.get('/api/meta/connect/:clientId', async (req, res) => {
  try {
    const redirectUri = `${req.protocol}://${req.get('host')}/api/meta/callback`;
    const url = getMetaAuthUrl(paramId(req), redirectUri);
    res.json({ url });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.get('/api/meta/callback', async (req, res) => {
  try {
    const { code, state: clientId } = req.query;
    if (!code || !clientId) return res.status(400).send('Missing code or state');
    const redirectUri = `${req.protocol}://${req.get('host')}/api/meta/callback`;
    const { access_token, user_id } = await exchangeMetaCode(code as string, redirectUri);

    // Get pages
    const pages = await getMetaPages(access_token);
    const client = await store.getClient(clientId as string);
    if (!client) return res.status(404).send('Client not found');

    // Auto-select first page
    const page = pages[0];
    const igAccount = page?.instagram_business_account;

    client.meta_config = {
      access_token, user_id,
      page_id: page?.id, page_name: page?.name, page_access_token: page?.access_token,
      instagram_account_id: igAccount?.id, instagram_username: igAccount?.username,
      connected_at: new Date().toISOString(),
    } as any;
    client.updated_at = new Date().toISOString();
    await store.upsertClient(client);

    // Redirect back to client form with success
    res.redirect(`/dashboard/client-form.html?id=${clientId}&meta=connected`);
  } catch (err: any) {
    res.redirect(`/dashboard/client-form.html?id=${req.query.state}&meta=error&msg=${encodeURIComponent(err.message)}`);
  }
});

app.get('/api/meta/pages/:clientId', async (req, res) => {
  try {
    const client = await store.getClient(paramId(req));
    if (!client?.meta_config?.access_token) return res.status(400).json({ error: 'Meta not connected' });
    const pages = await getMetaPages(client.meta_config.access_token);
    res.json(pages);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.post('/api/meta/select-page/:clientId', async (req, res) => {
  try {
    const client = await store.getClient(paramId(req));
    if (!client?.meta_config) return res.status(400).json({ error: 'Meta not connected' });
    const { page_id, page_name, page_access_token, instagram_account_id, instagram_username } = req.body;
    client.meta_config.page_id = page_id;
    client.meta_config.page_name = page_name;
    client.meta_config.page_access_token = page_access_token;
    if (instagram_account_id) client.meta_config.instagram_account_id = instagram_account_id;
    if (instagram_username) client.meta_config.instagram_username = instagram_username;
    client.updated_at = new Date().toISOString();
    await store.upsertClient(client);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// TikTok OAuth
app.get('/api/tiktok/connect/:clientId', async (req, res) => {
  try {
    const redirectUri = `${req.protocol}://${req.get('host')}/api/tiktok/callback`;
    const url = getTikTokAuthUrl(paramId(req), redirectUri);
    res.json({ url });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.get('/api/tiktok/callback', async (req, res) => {
  try {
    const { code, state: clientId } = req.query;
    if (!code || !clientId) return res.status(400).send('Missing code or state');
    const redirectUri = `${req.protocol}://${req.get('host')}/api/tiktok/callback`;
    const tokens = await exchangeTikTokCode(code as string, redirectUri);
    const userInfo = await getTikTokUserInfo(tokens.access_token);

    const client = await store.getClient(clientId as string);
    if (!client) return res.status(404).send('Client not found');

    client.tiktok_config = {
      access_token: tokens.access_token, refresh_token: tokens.refresh_token,
      open_id: tokens.open_id, display_name: userInfo.display_name,
      connected_at: new Date().toISOString(),
    } as any;
    client.updated_at = new Date().toISOString();
    await store.upsertClient(client);

    res.redirect(`/dashboard/client-form.html?id=${clientId}&tiktok=connected`);
  } catch (err: any) {
    res.redirect(`/dashboard/client-form.html?id=${req.query.state}&tiktok=error&msg=${encodeURIComponent(err.message)}`);
  }
});

// Publish endpoints
app.post('/api/publish/facebook/:variantId', async (req, res) => {
  try {
    const variant = await store.getVariant(paramId(req));
    if (!variant) return res.status(404).json({ error: 'Variant not found' });
    const batches = await store.getBatches();
    const batch = batches.find(b => b.id === variant.batch_id);
    if (!batch) return res.status(404).json({ error: 'Batch not found' });
    const entity = await store.getEntity(batch.entity_id);
    if (!entity?.client_id) return res.status(400).json({ error: 'No client associated' });
    const client = await store.getClient(entity.client_id);
    if (!client) return res.status(404).json({ error: 'Client not found' });

    const result = await publishToFacebook(client, variant);
    await store.addPublishAction({
      id: require('uuid').v4(), creative_variant_id: variant.id, platform: 'facebook',
      publish_mode: 'live', status: 'published', external_object_id: result.post_id,
      request_json: {}, response_json: result, published_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    });
    res.json({ success: true, post_id: result.post_id });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/publish/instagram/:variantId', async (req, res) => {
  try {
    const variant = await store.getVariant(paramId(req));
    if (!variant) return res.status(404).json({ error: 'Variant not found' });
    const batches = await store.getBatches();
    const batch = batches.find(b => b.id === variant.batch_id);
    if (!batch) return res.status(404).json({ error: 'Batch not found' });
    const entity = await store.getEntity(batch.entity_id);
    if (!entity?.client_id) return res.status(400).json({ error: 'No client' });
    const client = await store.getClient(entity.client_id);
    if (!client) return res.status(404).json({ error: 'Client not found' });

    const result = await publishToInstagram(client, variant);
    await store.addPublishAction({
      id: require('uuid').v4(), creative_variant_id: variant.id, platform: 'instagram',
      publish_mode: 'live', status: 'published', external_object_id: result.id,
      request_json: {}, response_json: result, published_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    });
    res.json({ success: true, post_id: result.id });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// Social connection status
app.get('/api/clients/:id/social-status', async (req, res) => {
  const client = await store.getClient(paramId(req));
  if (!client) return res.status(404).json({ error: 'Client not found' });
  res.json({
    facebook: client.meta_config?.page_id ? { connected: true, page_name: client.meta_config.page_name, page_id: client.meta_config.page_id } : { connected: false },
    instagram: client.meta_config?.instagram_account_id ? { connected: true, username: client.meta_config.instagram_username } : { connected: false },
    tiktok: client.tiktok_config?.access_token ? { connected: true, display_name: client.tiktok_config.display_name } : { connected: false },
  });
});

app.post('/api/clients/:id/disconnect/:platform', async (req, res) => {
  try {
    const client = await store.getClient(paramId(req));
    if (!client) return res.status(404).json({ error: 'Not found' });
    const platform = req.params.platform;
    if (platform === 'meta' || platform === 'facebook' || platform === 'instagram') {
      client.meta_config = undefined;
    } else if (platform === 'tiktok') {
      client.tiktok_config = undefined;
    }
    client.updated_at = new Date().toISOString();
    await store.upsertClient(client);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.post('/api/reset-campaigns', requireRole('admin'), async (_req: AuthRequest, res) => {
  try {
    const { sql } = await import('./db/neon');
    await sql('DELETE FROM approval_tasks');
    await sql('DELETE FROM qa_reviews');
    await sql('DELETE FROM creative_variants');
    await sql('DELETE FROM creative_batches');
    await sql('DELETE FROM campaign_candidates');
    await sql('DELETE FROM entity_change_events');
    await sql('DELETE FROM entity_snapshots');
    await sql('DELETE FROM source_entities');
    await sql('DELETE FROM publish_actions');
    await sql('DELETE FROM performance_metrics');
    await sql('DELETE FROM source_sync_runs');
    res.json({ success: true, message: 'All campaign data cleared. Clients and users preserved.' });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/', (_req, res) => { res.redirect('/dashboard/clients.html'); });
app.get('/dashboard', (_req, res) => { res.redirect('/dashboard/clients.html'); });

// ── Start ──

export default app;

// Start when run directly (not imported by Vercel serverless)
if (require.main === module || process.argv[1]?.includes('server')) {
  const PORT = process.env.PORT ?? 3001;
  (async () => {
    await initDatabase();
    await ensureDefaultAdmin();
    app.listen(PORT, () => console.log(`Real Estate Marketing Agent running at http://localhost:${PORT}`));
  })().catch(console.error);
}
