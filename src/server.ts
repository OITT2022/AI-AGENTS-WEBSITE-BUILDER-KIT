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
  testDriveConnection, syncDriveMedia, syncAndCacheDriveMedia, listFolderFiles, extractFolderId,
} from './services/google-drive';
import {
  ensureDefaultAdmin, login, logout, getSessionUser,
  createUser, updateUser, deleteUser, listUsers,
  requireAuth, requireRole, AuthRequest,
} from './services/auth';
import * as imageAi from './services/image-ai';
import * as videoAi from './services/video-ai';
import * as canva from './services/canva';

const app = express();

function paramId(req: express.Request): string {
  // Support :id, :variantId, :batchId, :clientId — take the first param value
  const id = req.params.id ?? req.params.variantId ?? req.params.batchId ?? req.params.clientId ?? Object.values(req.params)[0];
  return Array.isArray(id) ? id[0] : id;
}

/** Prevent open-redirect: only allow relative paths starting with / */
function sanitizeReturnTo(raw: string | undefined, fallback: string): string {
  if (!raw) return fallback;
  // Block absolute URLs, protocol-relative, and backslash-based redirects
  if (raw.includes('://') || raw.startsWith('//') || raw.startsWith('\\')) return fallback;
  if (!raw.startsWith('/')) return fallback;
  return raw;
}

/** Validate that a state/clientId parameter looks like a UUID (not injection payload) */
function validateStateId(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.trim();
  if (/^[a-f0-9-]{36}$/i.test(cleaned)) return cleaned;
  return null;
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

// Public pages (no auth required)
app.get('/terms', (_req, res) => { res.sendFile(path.join(publicDir, 'terms.html')); });
app.get('/privacy', (_req, res) => { res.sendFile(path.join(publicDir, 'privacy.html')); });
app.get('/favicon.ico', (_req, res) => { res.sendFile(path.join(publicDir, 'favicon.ico')); });
app.get('/favicon-:size.png', (req, res) => { res.sendFile(path.join(publicDir, `favicon-${req.params.size}.png`)); });
app.get('/apple-touch-icon.png', (_req, res) => { res.sendFile(path.join(publicDir, 'apple-touch-icon.png')); });
app.get('/android-chrome-:size.png', (req, res) => { res.sendFile(path.join(publicDir, `android-chrome-${req.params.size}.png`)); });

const uploadDir = path.join(process.env.VERCEL ? '/tmp' : process.cwd(), 'data', 'uploads');
try { if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true }); } catch {}
const upload = multer({ dest: uploadDir, limits: { fileSize: 50 * 1024 * 1024 } });

// ── Auth routes (public) ──

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  const result = await login(email, password);
  if (!result) return res.status(401).json({ error: 'Invalid email or password' });
  const securePart = process.env.NODE_ENV === 'production' || req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `auth_token=${result.token}; Path=/; HttpOnly; SameSite=Lax${securePart}; Max-Age=${24 * 3600}`);
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

// ── Google OAuth (public — must be before requireAuth) ──

// Helper: get correct base URL behind Vercel proxy
function getBaseUrl(req: express.Request): string {
  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.headers['x-forwarded-host'] || req.get('host');
  return `${proto}://${host}`;
}

// In-memory token store (per session user) — maps user ID to Google tokens
const googleTokens = new Map<string, { access_token: string; refresh_token?: string; expiry?: number }>();

app.get('/api/google/auth', (req, res) => {
  const oauthClientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!oauthClientId || !clientSecret) return res.status(500).json({ error: 'Google OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET env vars.' });

  const baseUrl = getBaseUrl(req);
  const redirectUri = `${baseUrl}/api/google/callback`;
  const returnTo = (req.query.returnTo as string) || '/dashboard/client-form.html';
  const editClientId = req.query.clientId as string || '';
  const state = JSON.stringify({ returnTo, clientId: editClientId });
  const scope = 'https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email';

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${encodeURIComponent(oauthClientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent(scope)}` +
    `&access_type=offline` +
    `&prompt=consent` +
    `&state=${encodeURIComponent(state)}`;

  res.redirect(authUrl);
});

app.get('/api/google/callback', async (req, res) => {
  let returnTo = '/dashboard/client-form.html';
  try {
    const { code, state: stateRaw } = req.query;
    if (!code) return res.status(400).send('Missing authorization code');

    // Parse state (JSON with returnTo + clientId) — validate to prevent open redirect
    let editClientId = '';
    try {
      const st = JSON.parse(stateRaw as string);
      returnTo = sanitizeReturnTo(st.returnTo, returnTo);
      editClientId = st.clientId || '';
    } catch { returnTo = (stateRaw as string) || returnTo; }

    const oauthClientId = process.env.GOOGLE_CLIENT_ID!.trim();
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET!.trim();
    const baseUrl = getBaseUrl(req);
    const redirectUri = `${baseUrl}/api/google/callback`;

    // Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code: code as string, client_id: oauthClientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }),
    });
    const tokens = await tokenRes.json() as any;
    if (tokens.error) {
      const errUrl = `${returnTo}${returnTo.includes('?') ? '&' : '?'}google=error&msg=${encodeURIComponent(tokens.error_description || tokens.error)}`;
      return res.type('html').send(callbackPage(errUrl, tokens.error_description || tokens.error));
    }

    // Get user info
    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', { headers: { Authorization: `Bearer ${tokens.access_token}` } });
    const user = await userRes.json() as any;

    // Store token in memory keyed by app session user
    const cookie = (req.headers.cookie ?? '').split(';').map(c => c.trim()).find(c => c.startsWith('auth_token='));
    const sessionToken = cookie?.split('=')[1];
    const sessionUser = sessionToken ? await getSessionUser(sessionToken) : null;
    const storeKey = sessionUser?.id || 'default';
    googleTokens.set(storeKey, {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry: Date.now() + (tokens.expires_in || 3600) * 1000,
    });

    // Persist refresh token on client record for automated pipeline access
    if (editClientId && tokens.refresh_token) {
      const client = await store.getClient(editClientId);
      if (client) {
        client.google_refresh_token = tokens.refresh_token;
        client.google_email = user.email || undefined;
        client.updated_at = new Date().toISOString();
        await store.upsertClient(client);
      }
    }

    const sep = returnTo.includes('?') ? '&' : '?';
    const successUrl = `${returnTo}${sep}google=connected&g_name=${encodeURIComponent(user.name || '')}&g_email=${encodeURIComponent(user.email || '')}&g_picture=${encodeURIComponent(user.picture || '')}`;
    res.type('html').send(callbackPage(successUrl, null));
  } catch (err: any) {
    const errorUrl = `${returnTo}?google=error&msg=${encodeURIComponent(err.message)}`;
    res.type('html').send(callbackPage(errorUrl, err.message));
  }
});

function callbackPage(redirectUrl: string, error: string | null): string {
  return `<!DOCTYPE html><html><head><title>Google Auth</title></head><body>
<script>
  var url = ${JSON.stringify(redirectUrl)};
  if (window.opener) {
    window.opener.postMessage({ type: 'google-auth-result', url: url, error: ${JSON.stringify(error)} }, window.location.origin);
    window.close();
  } else {
    window.location.replace(url);
  }
  setTimeout(function() { document.body.textContent = 'Redirecting... If not redirected, close this window.'; }, 2000);
</script>
<p>Completing sign-in...</p>
</body></html>`;
}

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
    console.log('[PUT client] Saving:', { id: updated.id, google_drive_folder_id: updated.google_drive_folder_id, google_email: updated.google_email, has_refresh: !!updated.google_refresh_token });
    const saved = await store.upsertClient(updated);
    console.log('[PUT client] Saved:', { id: saved.id, google_drive_folder_id: saved.google_drive_folder_id });
    res.json({ success: true, client: saved });
  } catch (err: any) {
    console.error('[PUT client] Error:', err.message);
    res.status(400).json({ error: err.message });
  }
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

    let apiResult: any = null;
    let driveResult: any = null;

    // 1. Sync from FindUS API (if configured)
    if (client.api_config?.api_token) {
      const apiConfig = {
        base_url: String(client.api_config.base_url || ''),
        api_token: String(client.api_config.api_token || ''),
        filters: {
          city: client.api_config.filters?.city ? String(client.api_config.filters.city) : undefined,
          propertyType: client.api_config.filters?.propertyType ? String(client.api_config.filters.propertyType) : undefined,
        },
      };
      apiResult = await syncFromFindUs(false, client.id, apiConfig); // Don't run pipeline yet
    }

    // 2. Sync Google Drive media (if configured)
    if (client.google_drive_folder_id) {
      try {
        driveResult = await syncAndCacheDriveMedia(client);
      } catch (err: any) {
        console.error('Drive sync error:', err.message);
        driveResult = { error: err.message, total_files: 0 };
      }
    }

    // 3. Run pipeline (scoring + creative generation) with both data sources
    let pipeline: any = null;
    if (req.body.run_pipeline !== false) {
      pipeline = await runDailyPipeline(undefined, client.id);
    }

    res.json({
      success: true,
      result: {
        ...apiResult,
        drive_files_synced: driveResult?.total_files ?? 0,
        drive_images: driveResult?.images ?? 0,
        drive_videos: driveResult?.videos ?? 0,
        pipeline: pipeline ? {
          candidates: pipeline.candidates,
          selected: pipeline.selected,
          batches: pipeline.batches,
          variants: pipeline.variants,
        } : null,
      },
    });
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

// ── Google Config & Drive proxy (authenticated) ──

app.get('/api/config/google', (_req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID || '';
  const apiKey = process.env.GOOGLE_API_KEY || '';
  if (!clientId || !apiKey) return res.status(500).json({ error: 'Google OAuth not configured.' });
  res.json({ client_id: clientId, api_key: apiKey });
});

app.get('/api/google/drive/list', async (req: AuthRequest, res) => {
  try {
    // Try in-memory token first, then fall back to client's stored refresh token
    const storeKey = req.user?.id || 'default';
    let tokenData = googleTokens.get(storeKey);
    const clientId = req.query.clientId as string;

    if (!tokenData && clientId) {
      // Restore session from client's stored refresh token
      const client = await store.getClient(clientId);
      if (client) {
        const { getOAuthAccessToken } = await import('./services/google-drive');
        const accessToken = await getOAuthAccessToken(client);
        if (accessToken) {
          tokenData = { access_token: accessToken, expiry: Date.now() + 3600000 };
          googleTokens.set(storeKey, tokenData);
        }
      }
    }

    if (!tokenData) return res.status(401).json({ error: 'Not connected to Google. Please sign in.' });

    const folderId = (req.query.folderId as string) || 'root';
    const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
    const fields = encodeURIComponent('files(id, name, mimeType, size), nextPageToken');
    const driveRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&pageSize=200&fields=${fields}&orderBy=folder,name`, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    if (!driveRes.ok) {
      const errText = await driveRes.text();
      if (driveRes.status === 401) { googleTokens.delete(storeKey); return res.status(401).json({ error: 'Google session expired. Please sign in again.' }); }
      return res.status(driveRes.status).json({ error: errText });
    }
    res.json(await driveRes.json());
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.get('/api/google/userinfo', async (req: AuthRequest, res) => {
  const storeKey = req.user?.id || 'default';
  let tokenData = googleTokens.get(storeKey);
  const clientId = req.query.clientId as string;

  // Restore from client's stored refresh token if in-memory token is gone
  if (!tokenData && clientId) {
    const client = await store.getClient(clientId);
    if (client) {
      const { getOAuthAccessToken } = await import('./services/google-drive');
      const accessToken = await getOAuthAccessToken(client);
      if (accessToken) {
        tokenData = { access_token: accessToken, expiry: Date.now() + 3600000 };
        googleTokens.set(storeKey, tokenData);
      }
    }
  }

  if (!tokenData) return res.status(401).json({ error: 'Not connected' });
  try {
    const r = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', { headers: { Authorization: `Bearer ${tokenData.access_token}` } });
    if (!r.ok) return res.status(401).json({ error: 'Token expired' });
    res.json(await r.json());
  } catch (err: any) { res.status(500).json({ error: err.message }); }
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
    res.json({ success: true, result: await syncAndCacheDriveMedia(client) });
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
    const updates: Record<string, unknown> = {};
    if (req.body.copy_json) updates.copy_json = req.body.copy_json;
    if (req.body.media_plan_json) updates.media_plan_json = req.body.media_plan_json;
    if (Object.keys(updates).length > 0) await store.updateVariant(id, updates);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

app.delete('/api/creatives/:id', async (req, res) => {
  try {
    const deleted = await store.deleteVariant(paramId(req));
    if (!deleted) return res.status(404).json({ error: 'Variant not found' });
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.post('/api/creatives/bulk-delete', async (req, res) => {
  try {
    const { variant_ids } = req.body;
    if (!Array.isArray(variant_ids) || variant_ids.length === 0) return res.status(400).json({ error: 'No variant_ids provided' });
    const count = await store.deleteVariants(variant_ids);
    res.json({ success: true, deleted: count });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/batches/:id', async (req, res) => {
  try {
    const deleted = await store.deleteBatch(paramId(req));
    if (!deleted) return res.status(404).json({ error: 'Batch not found' });
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.post('/api/clients/:id/creatives/delete-unapproved', requireRole('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const client = await store.getClient(paramId(req));
    if (!client) return res.status(404).json({ error: 'Client not found' });
    const deleted = await store.deleteUnapprovedCreatives(client.id);
    res.json({ success: true, deleted });
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
  // Single SQL query with aggregates — replaces 8 full-table fetches
  res.json(await store.getDashboardSummary());
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
    const { code, state: rawState } = req.query;
    const clientId = validateStateId(rawState);
    if (!code || !clientId) return res.status(400).send('Missing or invalid code/state');
    const redirectUri = `${req.protocol}://${req.get('host')}/api/meta/callback`;
    const { access_token, user_id } = await exchangeMetaCode(code as string, redirectUri);

    // Get pages
    const pages = await getMetaPages(access_token);
    const client = await store.getClient(clientId);
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
    const safeId = validateStateId(req.query.state) || '';
    res.redirect(`/dashboard/client-form.html?id=${safeId}&meta=error&msg=${encodeURIComponent(err.message)}`);
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
    const { code, state: rawState } = req.query;
    const clientId = validateStateId(rawState);
    if (!code || !clientId) return res.status(400).send('Missing or invalid code/state');
    const redirectUri = `${req.protocol}://${req.get('host')}/api/tiktok/callback`;
    const tokens = await exchangeTikTokCode(code as string, redirectUri);
    const userInfo = await getTikTokUserInfo(tokens.access_token);

    const client = await store.getClient(clientId);
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
    const safeId = validateStateId(req.query.state) || '';
    res.redirect(`/dashboard/client-form.html?id=${safeId}&tiktok=error&msg=${encodeURIComponent(err.message)}`);
  }
});

// Publish endpoints
app.post('/api/publish/facebook/:variantId', async (req, res) => {
  try {
    const variant = await store.getVariant(paramId(req));
    if (!variant) return res.status(404).json({ error: 'Variant not found' });

    // Idempotency: skip if already published to this platform
    const existing = await store.getExistingPublish(variant.id, 'facebook');
    if (existing) return res.json({ success: true, post_id: existing.external_object_id, already_published: true });

    const batches = await store.getBatches();
    const batch = batches.find(b => b.id === variant.batch_id);
    if (!batch) return res.status(404).json({ error: 'Batch not found' });
    const entity = await store.getEntity(batch.entity_id);
    if (!entity?.client_id) return res.status(400).json({ error: 'No client associated' });
    const client = await store.getClient(entity.client_id);
    if (!client) return res.status(404).json({ error: 'Client not found' });

    const publishMode = req.body.mode || 'live';
    const copy = variant.copy_json as any;
    const media = variant.media_plan_json as any;
    const requestPayload = {
      page_id: client.meta_config?.page_id,
      message: copy.primary_text || copy.caption || '',
      image_url: media?.hero_image || (media?.selected_images || [])[0] || null,
      variant_id: variant.id,
      entity_id: batch.entity_id,
      client_id: entity.client_id,
      platform: 'facebook',
      mode: publishMode,
      requested_at: new Date().toISOString(),
    };

    const result = await publishToFacebook(client, variant);
    await store.addPublishAction({
      id: require('uuid').v4(), creative_variant_id: variant.id, platform: 'facebook',
      publish_mode: publishMode, status: 'published', external_object_id: result.post_id,
      request_json: requestPayload, response_json: result, published_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    });
    res.json({ success: true, post_id: result.post_id });
  } catch (err: any) {
    // Record failed publish attempt for auditability
    const variant = await store.getVariant(paramId(req));
    if (variant) {
      await store.addPublishAction({
        id: require('uuid').v4(), creative_variant_id: variant.id, platform: 'facebook',
        publish_mode: req.body.mode || 'live', status: 'failed',
        request_json: { error: err.message, variant_id: variant.id, requested_at: new Date().toISOString() },
        response_json: {}, created_at: new Date().toISOString(),
      });
    }
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/publish/instagram/:variantId', async (req, res) => {
  try {
    const variant = await store.getVariant(paramId(req));
    if (!variant) return res.status(404).json({ error: 'Variant not found' });

    // Idempotency: skip if already published to this platform
    const existing = await store.getExistingPublish(variant.id, 'instagram');
    if (existing) return res.json({ success: true, post_id: existing.external_object_id, already_published: true });

    const batches = await store.getBatches();
    const batch = batches.find(b => b.id === variant.batch_id);
    if (!batch) return res.status(404).json({ error: 'Batch not found' });
    const entity = await store.getEntity(batch.entity_id);
    if (!entity?.client_id) return res.status(400).json({ error: 'No client' });
    const client = await store.getClient(entity.client_id);
    if (!client) return res.status(404).json({ error: 'Client not found' });

    const publishMode = req.body.mode || 'live';
    const copy = variant.copy_json as any;
    const media = variant.media_plan_json as any;
    const heroImg = media?.hero_image || (media?.selected_images || [])[0];
    const requestPayload = {
      instagram_account_id: client.meta_config?.instagram_account_id,
      image_url: heroImg,
      caption: copy.caption || copy.primary_text || '',
      hashtags: copy.hashtags || [],
      variant_id: variant.id,
      entity_id: batch.entity_id,
      client_id: entity.client_id,
      platform: 'instagram',
      mode: publishMode,
      requested_at: new Date().toISOString(),
    };

    const result = await publishToInstagram(client, variant);
    await store.addPublishAction({
      id: require('uuid').v4(), creative_variant_id: variant.id, platform: 'instagram',
      publish_mode: publishMode, status: 'published', external_object_id: result.id,
      request_json: requestPayload, response_json: result, published_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    });
    res.json({ success: true, post_id: result.id });
  } catch (err: any) {
    // Record failed publish attempt for auditability
    const variant = await store.getVariant(paramId(req));
    if (variant) {
      await store.addPublishAction({
        id: require('uuid').v4(), creative_variant_id: variant.id, platform: 'instagram',
        publish_mode: req.body.mode || 'live', status: 'failed',
        request_json: { error: err.message, variant_id: variant.id, requested_at: new Date().toISOString() },
        response_json: {}, created_at: new Date().toISOString(),
      });
    }
    res.status(500).json({ success: false, error: err.message });
  }
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

// ── Service Status (public read, safe) ──

app.get('/api/services/status', async (_req, res) => {
  res.json({
    image_ai: { configured: imageAi.isConfigured(), provider: process.env.IMAGE_AI_PROVIDER || 'openai' },
    video_ai: { configured: videoAi.isConfigured(), provider: process.env.VIDEO_AI_PROVIDER || 'runway' },
    canva: { configured: canva.isConfigured() },
  });
});

// ── Image AI triggers ──

app.post('/api/generate/image/:variantId', requireRole('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    if (!imageAi.isConfigured()) return res.status(503).json({ error: 'Image generation service not configured. Contact your administrator.' });

    const variant = await store.getVariant(paramId(req));
    if (!variant) return res.status(404).json({ error: 'Variant not found' });

    const batches = await store.getBatches();
    const batch = batches.find(b => b.id === variant.batch_id);
    if (!batch) return res.status(404).json({ error: 'Batch not found' });
    const entity = await store.getEntity(batch.entity_id);
    if (!entity) return res.status(404).json({ error: 'Entity not found' });
    const snapshot = entity.current_snapshot_id ? await store.getSnapshot(entity.current_snapshot_id) : undefined;
    if (!snapshot) return res.status(400).json({ error: 'No snapshot for entity' });

    const platformSize = (req.body.platform_size || `${variant.platform}_feed`) as imageAi.PlatformSize;
    const images = await imageAi.generateAdImage(snapshot.normalized_payload, variant.copy_json, platformSize);

    // Store generated URLs in variant's media_plan
    const mediaPlan = { ...variant.media_plan_json } as Record<string, unknown>;
    mediaPlan.ai_generated_images = images.map(img => ({
      url: img.url,
      b64: !!img.b64_data,
      width: img.width,
      height: img.height,
      provider: img.provider,
      model: img.model,
      generation_id: img.generation_id,
    }));
    await store.updateVariant(variant.id, { media_plan_json: mediaPlan });

    res.json({ success: true, images: images.map(i => ({ url: i.url, width: i.width, height: i.height, provider: i.provider })) });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/generate/image/batch/:batchId', requireRole('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    if (!imageAi.isConfigured()) return res.status(503).json({ error: 'Image AI not configured' });

    const variants = await store.getVariants(paramId(req));
    if (variants.length === 0) return res.status(404).json({ error: 'No variants in batch' });

    const batch = (await store.getBatches()).find(b => b.id === paramId(req));
    if (!batch) return res.status(404).json({ error: 'Batch not found' });
    const entity = await store.getEntity(batch.entity_id);
    if (!entity?.current_snapshot_id) return res.status(400).json({ error: 'No snapshot' });
    const snapshot = await store.getSnapshot(entity.current_snapshot_id);
    if (!snapshot) return res.status(400).json({ error: 'Snapshot not found' });

    const results: Array<{ variant_id: string; platform: string; images: number; error?: string }> = [];
    for (const variant of variants) {
      try {
        const sizeKey = `${variant.platform}_feed` as imageAi.PlatformSize;
        const platformSize = sizeKey in imageAi.PLATFORM_SIZES ? sizeKey : 'facebook_feed' as imageAi.PlatformSize;
        const images = await imageAi.generateAdImage(snapshot.normalized_payload, variant.copy_json, platformSize);
        const mediaPlan = { ...variant.media_plan_json } as Record<string, unknown>;
        mediaPlan.ai_generated_images = images.map(img => ({
          url: img.url, width: img.width, height: img.height,
          provider: img.provider, model: img.model, generation_id: img.generation_id,
        }));
        await store.updateVariant(variant.id, { media_plan_json: mediaPlan });
        results.push({ variant_id: variant.id, platform: variant.platform, images: images.length });
      } catch (err: any) {
        results.push({ variant_id: variant.id, platform: variant.platform, images: 0, error: err.message });
      }
    }
    res.json({ success: true, results });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// ── Video AI triggers ──

app.post('/api/generate/video/:variantId', requireRole('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    if (!videoAi.isConfigured()) return res.status(503).json({ error: 'Video generation service not configured. Contact your administrator.' });

    const variant = await store.getVariant(paramId(req));
    if (!variant) return res.status(404).json({ error: 'Variant not found' });

    const mediaPlan = variant.media_plan_json as Record<string, unknown>;
    const timeline = mediaPlan.reel_timeline as videoAi.ReelTimeline | undefined;

    const batches = await store.getBatches();
    const batch = batches.find(b => b.id === variant.batch_id);
    if (!batch) return res.status(404).json({ error: 'Batch not found' });
    const entity = await store.getEntity(batch.entity_id);
    if (!entity?.current_snapshot_id) return res.status(400).json({ error: 'No snapshot' });
    const snapshot = await store.getSnapshot(entity.current_snapshot_id);
    if (!snapshot) return res.status(400).json({ error: 'Snapshot not found' });

    let result: videoAi.VideoCompositeResult;
    if (timeline) {
      result = await videoAi.generateAdVideo(snapshot.normalized_payload, timeline, req.body.template_id);
    } else {
      // No timeline: animate the hero image
      const heroImage = (mediaPlan.hero_image as string) || ((mediaPlan.selected_images as string[]) ?? [])[0];
      if (!heroImage) return res.status(400).json({ error: 'No source image or reel timeline for video generation' });
      const title = String(snapshot.normalized_payload.title_he || snapshot.normalized_payload.title_en || '');
      const clip = await videoAi.animateImage(heroImage, `Cinematic real estate tour of ${title}. Slow camera movement.`);
      result = { url: clip.url, duration_sec: clip.duration_sec, provider: clip.provider, render_id: clip.generation_id };
    }

    // Store in variant
    const updatedPlan = { ...mediaPlan };
    updatedPlan.ai_generated_video = {
      url: result.url,
      duration_sec: result.duration_sec,
      thumbnail_url: result.thumbnail_url ?? null,
      provider: result.provider,
      render_id: result.render_id,
      generated_at: new Date().toISOString(),
    };
    await store.updateVariant(variant.id, { media_plan_json: updatedPlan });

    res.json({ success: true, video: { url: result.url, duration_sec: result.duration_sec, provider: result.provider } });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/generate/video/batch/:batchId', requireRole('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    if (!videoAi.isConfigured()) return res.status(503).json({ error: 'Video AI not configured' });

    const variants = await store.getVariants(paramId(req));
    const videoVariants = variants.filter(v => {
      const mp = v.media_plan_json as Record<string, unknown>;
      return mp.reel_timeline || mp.video_ad || ((mp.videos as string[]) ?? []).length > 0;
    });
    if (videoVariants.length === 0) return res.status(400).json({ error: 'No video-eligible variants in batch' });

    const batch = (await store.getBatches()).find(b => b.id === paramId(req));
    if (!batch) return res.status(404).json({ error: 'Batch not found' });
    const entity = await store.getEntity(batch.entity_id);
    if (!entity?.current_snapshot_id) return res.status(400).json({ error: 'No snapshot' });
    const snapshot = await store.getSnapshot(entity.current_snapshot_id);
    if (!snapshot) return res.status(400).json({ error: 'Snapshot not found' });

    const results: Array<{ variant_id: string; platform: string; success: boolean; error?: string }> = [];
    for (const variant of videoVariants) {
      try {
        const mediaPlan = variant.media_plan_json as Record<string, unknown>;
        const timeline = mediaPlan.reel_timeline as videoAi.ReelTimeline | undefined;
        let video: videoAi.VideoCompositeResult;
        if (timeline) {
          video = await videoAi.generateAdVideo(snapshot.normalized_payload, timeline, req.body.template_id);
        } else {
          const heroImage = (mediaPlan.hero_image as string) || ((mediaPlan.selected_images as string[]) ?? [])[0];
          if (!heroImage) { results.push({ variant_id: variant.id, platform: variant.platform, success: false, error: 'No source image' }); continue; }
          const clip = await videoAi.animateImage(heroImage, `Cinematic real estate property tour. Smooth movement.`);
          video = { url: clip.url, duration_sec: clip.duration_sec, provider: clip.provider, render_id: clip.generation_id };
        }
        const updatedPlan = { ...mediaPlan };
        updatedPlan.ai_generated_video = { url: video.url, duration_sec: video.duration_sec, provider: video.provider, render_id: video.render_id, generated_at: new Date().toISOString() };
        await store.updateVariant(variant.id, { media_plan_json: updatedPlan });
        results.push({ variant_id: variant.id, platform: variant.platform, success: true });
      } catch (err: any) {
        results.push({ variant_id: variant.id, platform: variant.platform, success: false, error: err.message });
      }
    }
    res.json({ success: true, results });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// ── AI Ad Generator (orchestrates image + video + canva in one call) ──

app.post('/api/generate/ai-ad/:variantId', requireRole('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const variant = await store.getVariant(paramId(req));
    if (!variant) return res.status(404).json({ error: 'Variant not found' });

    const batches = await store.getBatches();
    const batch = batches.find(b => b.id === variant.batch_id);
    if (!batch) return res.status(404).json({ error: 'Batch not found' });
    const entity = await store.getEntity(batch.entity_id);
    if (!entity?.current_snapshot_id) return res.status(400).json({ error: 'No snapshot' });
    const snapshot = await store.getSnapshot(entity.current_snapshot_id);
    if (!snapshot) return res.status(400).json({ error: 'Snapshot not found' });
    const client = entity.client_id ? await store.getClient(entity.client_id) : null;
    const payload = snapshot.normalized_payload;
    const mediaPlan = { ...variant.media_plan_json } as Record<string, unknown>;
    const copy = variant.copy_json as Record<string, unknown>;
    const servicesUsed: string[] = [];
    const errors: Array<{ service: string; error: string }> = [];

    // Determine platform size
    const platformSizeMap: Record<string, imageAi.PlatformSize> = {
      facebook: 'facebook_feed', instagram: 'instagram_square', tiktok: 'tiktok',
    };
    const platformSize = (req.body.platform_size || platformSizeMap[variant.platform] || 'facebook_feed') as imageAi.PlatformSize;

    // Build scene list from reel_timeline or fallback
    const timeline = mediaPlan.reel_timeline as any;
    const scenes: Array<{ overlay: string; source?: string }> = [];
    if (timeline?.scenes?.length) {
      for (const s of timeline.scenes) {
        scenes.push({ overlay: s.overlay_text || '', source: s.source || undefined });
      }
    } else {
      // Fallback: build scenes from copy
      const title = String(payload.title_he || payload.title_en || '');
      const city = String(payload.city || '');
      const price = String(payload.price_text || '');
      scenes.push({ overlay: `${city}`, source: (mediaPlan.hero_image as string) || undefined });
      scenes.push({ overlay: title });
      if (price) scenes.push({ overlay: price });
      const cta = String(copy.cta || copy.closing_cta || 'Learn More');
      scenes.push({ overlay: `${city} | ${price}\n${cta}` });
    }

    // ── Phase 1: Scene images via OpenAI ──
    const sceneImages: Array<{ scene: number; url: string; overlay: string; width: number; height: number }> = [];
    if (imageAi.isConfigured()) {
      const size = imageAi.PLATFORM_SIZES[platformSize];
      for (let i = 0; i < scenes.length; i++) {
        try {
          const scene = scenes[i];
          const title = String(payload.title_he || payload.title_en || '');
          const city = String(payload.city || '');
          const features = (payload.features as string[] || []).slice(0, 3).join(', ');
          const prompt = [
            `Professional real-estate ad image, scene ${i + 1} of ${scenes.length}.`,
            `Property: ${title} in ${city}.`,
            features ? `Features: ${features}.` : '',
            `Text overlay: "${scene.overlay}".`,
            `Style: modern, clean, cinematic real-estate marketing. ${size.width}x${size.height}.`,
          ].filter(Boolean).join(' ');

          const images = await imageAi.generateImage({
            prompt,
            negative_prompt: 'blurry, low quality, watermark, distorted text',
            width: size.width,
            height: size.height,
          });
          if (images[0]) {
            sceneImages.push({ scene: i + 1, url: images[0].url, overlay: scene.overlay, width: images[0].width, height: images[0].height });
          }
        } catch (err: any) {
          errors.push({ service: `openai_scene_${i + 1}`, error: err.message });
        }
      }
      if (sceneImages.length > 0) servicesUsed.push('openai_image');
    }

    // ── Phase 2: Video via Runway/Pika/etc (conditional) ──
    let videoResult: { url: string; duration_sec: number; provider: string } | null = null;
    if (videoAi.isConfigured()) {
      try {
        if (timeline) {
          // Full timeline: generate ad video from scene structure
          const vid = await videoAi.generateAdVideo(payload, timeline, req.body.template_id);
          videoResult = { url: vid.url, duration_sec: vid.duration_sec, provider: vid.provider };
        } else {
          // No timeline: animate the hero image into a short clip
          const heroImage = (mediaPlan.hero_image as string) || ((mediaPlan.selected_images as string[]) ?? [])[0];
          if (heroImage) {
            const title = String(payload.title_he || payload.title_en || '');
            const city = String(payload.city || '');
            const clip = await videoAi.animateImage(
              heroImage,
              `Cinematic real estate tour of ${title} in ${city}. Slow smooth camera movement, golden hour lighting.`,
              5, '9:16',
            );
            videoResult = { url: clip.url, duration_sec: clip.duration_sec, provider: clip.provider };
          }
        }
        if (videoResult) servicesUsed.push('video_' + videoResult.provider);
      } catch (err: any) {
        errors.push({ service: 'video_ai', error: err.message });
      }
    }

    // ── Phase 3: Canva (conditional) ──
    let canvaResult: { design_id: string; edit_url: string } | null = null;
    if (canva.isConfigured() && client && canva.isClientConnected(client)) {
      try {
        const mediaUrls = (mediaPlan.selected_images as string[]) ?? [];
        const bindings = canva.mapPropertyToBindings(payload, copy, mediaUrls);
        const title = String(payload.title_he || payload.title_en || 'Ad');
        const templateId = req.body.canva_template_id;
        if (templateId) {
          const design = await canva.createDesignFromTemplate(client, templateId, `${title} - ${variant.platform}`, bindings);
          canvaResult = { design_id: design.id, edit_url: design.edit_url };
          servicesUsed.push('canva');
        }
      } catch (err: any) {
        errors.push({ service: 'canva', error: err.message });
      }
    }

    // ── Persist results ──
    mediaPlan.ai_generated = {
      scene_images: sceneImages,
      video: videoResult,
      canva_design: canvaResult,
      generated_at: new Date().toISOString(),
      services_used: servicesUsed,
    };
    await store.updateVariant(variant.id, { media_plan_json: mediaPlan });

    res.json({
      success: true,
      generated: {
        scene_images: sceneImages,
        video: videoResult,
        canva_design: canvaResult,
      },
      services_used: servicesUsed,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// ── Canva triggers ──

app.get('/api/canva/connect/:clientId', async (req, res) => {
  try {
    if (!canva.isConfigured()) return res.status(503).json({ error: 'Canva integration not configured. Contact your administrator.' });
    const redirectUri = `${req.protocol}://${req.get('host')}/api/canva/callback`;
    const url = canva.getCanvaAuthUrl(paramId(req), redirectUri);
    res.json({ url });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.get('/api/canva/callback', async (req, res) => {
  try {
    const { code, state: rawState } = req.query;
    const clientId = validateStateId(rawState);
    if (!code || !clientId) return res.status(400).send('Missing or invalid code/state');
    const redirectUri = `${req.protocol}://${req.get('host')}/api/canva/callback`;
    const tokens = await canva.exchangeCanvaCode(code as string, redirectUri);

    const client = await store.getClient(clientId);
    if (!client) return res.status(404).send('Client not found');

    (client as any).canva_config = tokens;
    client.updated_at = new Date().toISOString();
    await store.upsertClient(client);

    res.redirect(`/dashboard/client-form.html?id=${clientId}&canva=connected`);
  } catch (err: any) {
    const safeId = validateStateId(req.query.state) || '';
    res.redirect(`/dashboard/client-form.html?id=${safeId}&canva=error&msg=${encodeURIComponent(err.message)}`);
  }
});

app.get('/api/canva/templates/:clientId', requireRole('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    if (!canva.isConfigured()) return res.status(503).json({ error: 'Canva not configured' });
    const client = await store.getClient(paramId(req));
    if (!client) return res.status(404).json({ error: 'Client not found' });
    if (!canva.isClientConnected(client)) return res.status(400).json({ error: 'Canva not connected for this client' });
    res.json(await canva.listTemplates(client));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.post('/api/canva/design/:variantId', requireRole('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    if (!canva.isConfigured()) return res.status(503).json({ error: 'Canva not configured' });

    const variant = await store.getVariant(paramId(req));
    if (!variant) return res.status(404).json({ error: 'Variant not found' });
    const templateId = req.body.template_id;
    if (!templateId) return res.status(400).json({ error: 'template_id is required' });

    const batches = await store.getBatches();
    const batch = batches.find(b => b.id === variant.batch_id);
    if (!batch) return res.status(404).json({ error: 'Batch not found' });
    const entity = await store.getEntity(batch.entity_id);
    if (!entity?.client_id) return res.status(400).json({ error: 'No client' });
    const client = await store.getClient(entity.client_id);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    if (!canva.isClientConnected(client)) return res.status(400).json({ error: 'Canva not connected' });

    const snapshot = entity.current_snapshot_id ? await store.getSnapshot(entity.current_snapshot_id) : undefined;
    if (!snapshot) return res.status(400).json({ error: 'No snapshot' });

    const mediaPlan = variant.media_plan_json as Record<string, unknown>;
    const mediaUrls = (mediaPlan.selected_images as string[]) ?? [];
    const bindings = canva.mapPropertyToBindings(snapshot.normalized_payload, variant.copy_json, mediaUrls);

    const title = String(snapshot.normalized_payload.title_he || snapshot.normalized_payload.title_en || 'Ad');
    const design = await canva.createDesignFromTemplate(client, templateId, `${title} - ${variant.platform}`, bindings);

    // Store Canva design info in variant
    const updatedPlan = { ...mediaPlan };
    updatedPlan.canva_design = {
      design_id: design.id,
      edit_url: design.edit_url,
      thumbnail_url: design.thumbnail_url ?? null,
      template_id: templateId,
      created_at: new Date().toISOString(),
    };
    await store.updateVariant(variant.id, { media_plan_json: updatedPlan });

    res.json({ success: true, design });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/canva/export/:variantId', requireRole('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    if (!canva.isConfigured()) return res.status(503).json({ error: 'Canva not configured' });

    const variant = await store.getVariant(paramId(req));
    if (!variant) return res.status(404).json({ error: 'Variant not found' });

    const mediaPlan = variant.media_plan_json as Record<string, unknown>;
    const canvaDesign = mediaPlan.canva_design as { design_id: string } | undefined;
    if (!canvaDesign?.design_id) return res.status(400).json({ error: 'No Canva design for this variant. Create one first via POST /api/canva/design/:variantId' });

    const batches = await store.getBatches();
    const batch = batches.find(b => b.id === variant.batch_id);
    if (!batch) return res.status(404).json({ error: 'Batch not found' });
    const entity = await store.getEntity(batch.entity_id);
    if (!entity?.client_id) return res.status(400).json({ error: 'No client' });
    const client = await store.getClient(entity.client_id);
    if (!client || !canva.isClientConnected(client)) return res.status(400).json({ error: 'Canva not connected' });

    const format = (req.body.format || 'png') as 'png' | 'jpg' | 'pdf';
    const exportResult = await canva.startExport(client, canvaDesign.design_id, format);
    const final = await canva.waitForExport(client, exportResult.export_id, req.body.timeout_ms || 60000);

    if (final.status === 'failed') return res.status(500).json({ success: false, error: 'Canva export failed' });

    // Store exported URLs in variant
    const updatedPlan = { ...mediaPlan };
    (updatedPlan.canva_design as any).exported_urls = final.urls;
    (updatedPlan.canva_design as any).exported_at = new Date().toISOString();
    (updatedPlan.canva_design as any).export_format = format;
    await store.updateVariant(variant.id, { media_plan_json: updatedPlan });

    res.json({ success: true, urls: final.urls, format });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/clients/:id/canva-status', async (req, res) => {
  const client = await store.getClient(paramId(req));
  if (!client) return res.status(404).json({ error: 'Client not found' });
  res.json({
    platform_configured: canva.isConfigured(),
    client_connected: canva.isClientConnected(client),
  });
});

// ── Campaign Reset ──

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
