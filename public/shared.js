// ── Shared Auth & Nav for all dashboard pages ──

function getAuthHeaders() {
  const token = localStorage.getItem('auth_token');
  return token ? { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
}

async function apiCall(path, opts = {}) {
  const res = await fetch(path, { credentials: 'include', headers: getAuthHeaders(), ...opts });
  if (res.status === 401) { window.location.href = '/dashboard/login.html'; return {}; }
  return res.json();
}

let _currentUser = null;

async function requireLogin() {
  try {
    const res = await fetch('/api/auth/me', { credentials: 'include', headers: getAuthHeaders() });
    if (!res.ok) throw new Error();
    const data = await res.json();
    _currentUser = data.user;
    return _currentUser;
  } catch { window.location.href = '/dashboard/login.html'; return null; }
}

async function handleLogout() {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'include', headers: getAuthHeaders() });
  localStorage.removeItem('auth_token');
  localStorage.removeItem('auth_user');
  window.location.href = '/dashboard/login.html';
}

function injectNav(activePage) {
  const nav = document.createElement('div');
  nav.className = 'side-nav';
  nav.innerHTML = `
    <div class="nav-brand">
      <img src="/dashboard/favicon-32x32.png" width="22" height="22" alt="Logo" style="border-radius:4px">
      <span>Marketing Agent</span>
    </div>
    <nav class="nav-links">
      <a href="/dashboard" class="${activePage === 'dashboard' ? 'active' : ''}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
        Dashboard
      </a>
      <a href="/dashboard/clients.html" class="${activePage === 'clients' ? 'active' : ''}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        Clients
      </a>
      <a href="/dashboard/connector.html" class="${activePage === 'connector' ? 'active' : ''}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
        API Connector
      </a>
      <a href="/dashboard/video-presets.html" class="${activePage === 'video-presets' ? 'active' : ''}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/></svg>
        Video Presets
      </a>
      <a href="/dashboard/sound-library.html" class="${activePage === 'sound-library' ? 'active' : ''}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
        Sound Library
      </a>
      ${_currentUser?.role === 'admin' ? `
      <a href="/dashboard/users.html" class="${activePage === 'users' ? 'active' : ''}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        Users
      </a>` : ''}
    </nav>
    <div class="nav-footer">
      <div class="nav-user">
        <div class="nav-avatar">${(_currentUser?.name || 'U')[0].toUpperCase()}</div>
        <div class="nav-user-info">
          <div class="nav-user-name">${_currentUser?.name || ''}</div>
          <div class="nav-user-role">${_currentUser?.role || ''}</div>
        </div>
      </div>
      <button class="nav-logout" onclick="handleLogout()">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
      </button>
    </div>
  `;
  document.body.insertBefore(nav, document.body.firstChild);
  document.body.classList.add('has-nav');
}

// Inject nav CSS
const navStyle = document.createElement('style');
navStyle.textContent = `
  .side-nav {
    position: fixed;
    left: 0;
    top: 0;
    bottom: 0;
    width: 220px;
    background: #1a1d27;
    border-right: 1px solid #2e3345;
    display: flex;
    flex-direction: column;
    z-index: 200;
  }
  .nav-brand {
    padding: 20px 18px;
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 15px;
    font-weight: 700;
    color: #e4e6f0;
    border-bottom: 1px solid #2e3345;
  }
  .nav-brand svg { color: #6366f1; }
  .nav-links {
    flex: 1;
    padding: 12px 10px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .nav-links a {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border-radius: 8px;
    color: #9da3b7;
    text-decoration: none;
    font-size: 13px;
    font-weight: 500;
    transition: all 0.15s;
  }
  .nav-links a:hover { background: #242836; color: #e4e6f0; }
  .nav-links a.active { background: #6366f1; color: white; }
  .nav-footer {
    padding: 14px;
    border-top: 1px solid #2e3345;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .nav-user { display: flex; align-items: center; gap: 10px; }
  .nav-avatar {
    width: 32px; height: 32px; border-radius: 50%;
    background: #6366f1; color: white;
    display: flex; align-items: center; justify-content: center;
    font-weight: 700; font-size: 13px;
  }
  .nav-user-name { font-size: 13px; font-weight: 600; color: #e4e6f0; }
  .nav-user-role { font-size: 11px; color: #9da3b7; text-transform: capitalize; }
  .nav-logout {
    background: none; border: none; color: #9da3b7; cursor: pointer; padding: 6px;
    border-radius: 6px; transition: all 0.15s;
  }
  .nav-logout:hover { background: #242836; color: #ef4444; }

  body.has-nav { padding-left: 220px; }
  body.has-nav .header { left: 220px; }

  @media (max-width: 768px) {
    .side-nav { width: 60px; }
    .side-nav .nav-brand span,
    .side-nav .nav-links a span,
    .side-nav .nav-user-info { display: none; }
    .side-nav .nav-links a { justify-content: center; padding: 12px; }
    body.has-nav { padding-left: 60px; }
    body.has-nav .header { left: 60px; }
  }
`;
document.head.appendChild(navStyle);

function showToast(msg) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
