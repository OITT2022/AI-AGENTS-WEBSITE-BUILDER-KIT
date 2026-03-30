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
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '50mb' }));
app.use('/dashboard', express.static(path.join(__dirname, '..', 'public')));

const uploadDir = path.join(process.cwd(), 'data', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
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
  try { res.json({ success: true, user: await updateUser(req.params.id, req.body) }); }
  catch (err: any) { res.status(400).json({ error: err.message }); }
});

app.delete('/api/users/:id', requireAuth, requireRole('admin'), async (req: AuthRequest, res) => {
  if (req.params.id === req.user?.id) return res.status(400).json({ error: 'Cannot delete your own account' });
  if (!(await deleteUser(req.params.id))) return res.status(404).json({ error: 'User not found' });
  res.json({ success: true });
});

// ── Protect all API routes below ──
app.use('/api', requireAuth);

// ── Clients ──

app.get('/api/clients', async (_req, res) => { res.json(await store.getClients()); });

app.get('/api/clients/:id', async (req, res) => {
  const c = await store.getClient(req.params.id);
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
    const client = await store.getClient(req.params.id);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    const updated = { ...client, ...req.body, id: client.id, created_at: client.created_at, updated_at: new Date().toISOString() };
    await store.upsertClient(updated);
    res.json({ success: true, client: updated });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

app.delete('/api/clients/:id', requireRole('admin'), async (req: AuthRequest, res) => {
  if (!(await store.deleteClient(req.params.id))) return res.status(404).json({ error: 'Client not found' });
  res.json({ success: true });
});

// ── Per-client campaign data ──

app.get('/api/clients/:id/dashboard', async (req, res) => {
  const clientId = req.params.id;
  const client = await store.getClient(clientId);
  if (!client) return res.status(404).json({ error: 'Client not found' });
  const entities = await store.getEntitiesByClient(clientId);
  const candidates = await store.getCandidatesByClient(clientId);
  const batches = await store.getBatchesByClient(clientId);
  const variantIds = new Set<string>();
  const allVariants: any[] = [];
  for (const b of batches) { for (const v of await store.getVariants(b.id)) { variantIds.add(v.id); allVariants.push(v); } }
  const approvals = (await store.getApprovalTasks()).filter(a => variantIds.has(a.creative_variant_id));
  const reviews = (await store.getReviews()).filter(r => variantIds.has(r.creative_variant_id));
  res.json({
    client, total_entities: entities.length, campaign_ready: entities.filter(e => e.campaign_ready).length,
    total_candidates: candidates.length, selected_candidates: candidates.filter(c => c.selected).length,
    total_batches: batches.length, total_variants: allVariants.length,
    approvals_pending: approvals.filter(a => a.status === 'pending').length,
    approvals_approved: approvals.filter(a => a.status === 'approved').length,
    approvals_rejected: approvals.filter(a => a.status === 'rejected').length,
    qa_pass: reviews.filter(r => r.status === 'pass').length, qa_warn: reviews.filter(r => r.status === 'warn').length, qa_fail: reviews.filter(r => r.status === 'fail').length,
  });
});

app.get('/api/clients/:id/entities', async (req, res) => {
  const entities = await store.getEntitiesByClient(req.params.id);
  const enriched = await Promise.all(entities.map(async e => {
    const snapshot = e.current_snapshot_id ? await store.getSnapshot(e.current_snapshot_id) : undefined;
    return { ...e, snapshot: snapshot?.normalized_payload };
  }));
  res.json(enriched);
});

app.get('/api/clients/:id/candidates', async (req, res) => {
  const candidates = await store.getCandidatesByClient(req.params.id, req.query.date as string);
  const enriched = await Promise.all(candidates.map(async c => {
    const entity = await store.getEntity(c.entity_id);
    const snapshot = entity?.current_snapshot_id ? await store.getSnapshot(entity.current_snapshot_id) : undefined;
    return { ...c, entity, snapshot: snapshot?.normalized_payload };
  }));
  res.json(enriched);
});

app.get('/api/clients/:id/creatives', async (req, res) => {
  const batches = await store.getBatchesByClient(req.params.id);
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
  const batches = await store.getBatchesByClient(req.params.id);
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
    const client = await store.getClient(req.params.id);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    if (!client.api_config?.api_token) return res.status(400).json({ error: 'No API config' });
    const result = await syncFromFindUs(req.body.run_pipeline !== false, client.id, client.api_config);
    res.json({ success: true, result });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/clients/:id/pipeline', async (req, res) => {
  try {
    const client = await store.getClient(req.params.id);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    res.json({ success: true, result: await runDailyPipeline(req.body.date, client.id) });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
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

app.get('/api/clients/:id/drive/files', async (req, res) => {
  try {
    const client = await store.getClient(req.params.id);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    const fi = client.google_drive_folder_id ?? client.google_drive_folder_url;
    if (!fi) return res.status(400).json({ error: 'No Drive folder' });
    const files = await listFolderFiles(extractFolderId(fi));
    res.json({ folder_id: extractFolderId(fi), files, total: files.length });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.post('/api/clients/:id/drive/sync', async (req, res) => {
  try {
    const client = await store.getClient(req.params.id);
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
  const entity = await store.getEntity(req.params.id);
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
    const task = await store.getApprovalTask(req.params.id);
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

app.get('/', (_req, res) => { res.redirect('/dashboard'); });

// ── Start ──

const PORT = process.env.PORT ?? 3001;

async function start() {
  await initDatabase();
  await ensureDefaultAdmin();
  app.listen(PORT, () => {
    console.log(`Real Estate Marketing Agent running at http://localhost:${PORT}`);
  });
}

start().catch(console.error);

export default app;
