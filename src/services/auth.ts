import crypto from 'crypto';
import { v4 as uuid } from 'uuid';
import { Request, Response, NextFunction } from 'express';
import { store } from '../db/store';
import { User, UserRole, Session } from '../models/schemas';

const SESSION_DURATION_HOURS = 24;

function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export async function ensureDefaultAdmin(): Promise<void> {
  const users = await store.getUsers();
  if (users.length === 0) {
    const now = new Date().toISOString();
    await store.upsertUser({
      id: uuid(), email: 'admin@marketing.local', name: 'Admin',
      password_hash: hashPassword('admin123'), role: 'admin', active: true,
      created_at: now, updated_at: now,
    });
    console.log('Default admin created: admin@marketing.local / admin123');
  }
}

export async function login(email: string, password: string) {
  const user = await store.getUserByEmail(email);
  if (!user || !user.active || hashPassword(password) !== user.password_hash) return null;
  await store.deleteExpiredSessions();
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_HOURS * 3600000).toISOString();
  await store.addSession({ id: uuid(), user_id: user.id, token, expires_at: expiresAt, created_at: new Date().toISOString() });
  const { password_hash, ...safeUser } = user;
  return { user: safeUser, token };
}

export async function logout(token: string) { await store.deleteSession(token); }

export async function getSessionUser(token: string) {
  const session = await store.getSessionByToken(token);
  if (!session || new Date(session.expires_at) < new Date()) {
    if (session) await store.deleteSession(token);
    return null;
  }
  const user = await store.getUser(session.user_id);
  if (!user || !user.active) return null;
  const { password_hash, ...safeUser } = user;
  return safeUser;
}

export async function createUser(email: string, name: string, password: string, role: UserRole, clientIds?: string[]) {
  if (await store.getUserByEmail(email)) throw new Error('Email already exists');
  const now = new Date().toISOString();
  const user: User = { id: uuid(), email: email.toLowerCase().trim(), name: name.trim(), password_hash: hashPassword(password), role, active: true, client_ids: clientIds ?? [], created_at: now, updated_at: now };
  await store.upsertUser(user);
  const { password_hash, ...safeUser } = user;
  return safeUser;
}

export async function updateUser(id: string, updates: { name?: string; email?: string; role?: UserRole; active?: boolean; password?: string; client_ids?: string[] }) {
  const user = await store.getUser(id);
  if (!user) throw new Error('User not found');
  if (updates.email && updates.email.toLowerCase() !== user.email) {
    const existing = await store.getUserByEmail(updates.email);
    if (existing && existing.id !== id) throw new Error('Email already in use');
    user.email = updates.email.toLowerCase().trim();
  }
  if (updates.name !== undefined) user.name = updates.name.trim();
  if (updates.role !== undefined) user.role = updates.role;
  if (updates.active !== undefined) user.active = updates.active;
  if (updates.client_ids !== undefined) user.client_ids = updates.client_ids;
  if (updates.password) user.password_hash = hashPassword(updates.password);
  user.updated_at = new Date().toISOString();
  await store.upsertUser(user);
  const { password_hash, ...safeUser } = user;
  return safeUser;
}

export async function deleteUser(id: string) { return store.deleteUser(id); }
export async function listUsers() { return (await store.getUsers()).map(({ password_hash, ...u }) => u); }

export interface AuthRequest extends Request { user?: Omit<User, 'password_hash'>; }

function extractToken(req: Request): string | null {
  const cookie = (req.headers.cookie ?? '').split(';').map(c => c.trim()).find(c => c.startsWith('auth_token='));
  if (cookie) return cookie.split('=')[1];
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) return auth.slice(7);
  return null;
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  const token = extractToken(req);
  if (!token) { res.status(401).json({ error: 'Authentication required' }); return; }
  getSessionUser(token).then(user => {
    if (!user) { res.status(401).json({ error: 'Invalid or expired session' }); return; }
    req.user = user;
    next();
  }).catch(() => res.status(401).json({ error: 'Auth error' }));
}

export function requireRole(...roles: UserRole[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) { res.status(401).json({ error: 'Authentication required' }); return; }
    // client_manager has the same permissions as manager for allowed routes
    const effectiveRole = req.user.role === 'client_manager' ? 'manager' : req.user.role;
    if (!roles.includes(req.user.role) && !roles.includes(effectiveRole as UserRole)) {
      res.status(403).json({ error: 'Insufficient permissions' }); return;
    }
    next();
  };
}

/** Check that a client_manager has access to a specific client. Admins/managers pass through. */
export function requireClientAccess(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!req.user) { res.status(401).json({ error: 'Authentication required' }); return; }
  if (req.user.role === 'admin' || req.user.role === 'manager') { next(); return; }
  if (req.user.role === 'client_manager') {
    const clientId = req.params.id || req.params.clientId || req.body?.client_id;
    const allowed = (req.user as any).client_ids || [];
    if (clientId && allowed.includes(clientId)) { next(); return; }
    res.status(403).json({ error: 'No access to this client' }); return;
  }
  res.status(403).json({ error: 'Insufficient permissions' });
}
