"use client";

import { useState, useEffect } from "react";

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  thumbnailLink?: string;
  size?: string;
}

interface SelectedFile {
  id: string;
  name: string;
  mimeType: string;
  dataUrl?: string;
}

interface GoogleDrivePickerProps {
  onFilesSelected: (files: SelectedFile[]) => void;
}

export default function GoogleDrivePicker({ onFilesSelected }: GoogleDrivePickerProps) {
  const [connected, setConnected] = useState(false);
  const [checking, setChecking] = useState(true);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [folderStack, setFolderStack] = useState<{ id: string; name: string }[]>([]);
  const [showBrowser, setShowBrowser] = useState(false);
  const [error, setError] = useState("");

  // Check connection on mount
  useEffect(() => {
    checkConn();
  }, []);

  async function checkConn() {
    setChecking(true);
    try {
      const res = await fetch("/api/drive/files");
      if (res.ok) {
        setConnected(true);
      } else {
        setConnected(false);
      }
    } catch {
      setConnected(false);
    }
    setChecking(false);
  }

  function handleConnect() {
    const popup = window.open("/api/auth/google", "google-auth", "width=500,height=700,popup=yes");
    if (!popup) return;

    const poll = setInterval(async () => {
      try {
        if (popup.closed) {
          clearInterval(poll);
          // Wait for cookies, then check
          await new Promise((r) => setTimeout(r, 1000));
          const res = await fetch("/api/drive/files");
          if (res.ok) {
            setConnected(true);
            const data = await res.json();
            setFiles(sortFiles(data.files ?? []));
            setShowBrowser(true);
          }
        }
      } catch {
        clearInterval(poll);
      }
    }, 500);
  }

  async function handleDisconnect() {
    await fetch("/api/auth/google/disconnect", { method: "POST" });
    setConnected(false);
    setShowBrowser(false);
    setFiles([]);
    setFolderStack([]);
    setSelected(new Set());
  }

  async function loadFolder(folderId?: string, q?: string) {
    setLoading(true);
    setError("");
    setFiles([]);
    try {
      const params = new URLSearchParams();
      if (folderId) params.set("folderId", folderId);
      if (q) params.set("q", q);
      const res = await fetch(`/api/drive/files?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || `שגיאה ${res.status}`);
        setLoading(false);
        return;
      }
      if (data.error) {
        setError(data.error);
      } else {
        setFiles(sortFiles(data.files ?? []));
      }
    } catch (err) {
      setError(`שגיאת תקשורת: ${err instanceof Error ? err.message : String(err)}`);
    }
    setLoading(false);
  }

  function handleBrowse() {
    setShowBrowser(true);
    setSearch("");
    setFolderStack([]);
    loadFolder();
  }

  function handleSearchSubmit() {
    if (!search.trim()) return;
    setFolderStack([]);
    loadFolder(undefined, search);
  }

  function openFolder(id: string, name: string) {
    setFolderStack((prev) => [...prev, { id, name }]);
    setSelected(new Set());
    loadFolder(id);
  }

  function navTo(index: number) {
    if (index === -1) {
      setFolderStack([]);
      loadFolder();
    } else {
      const stack = folderStack.slice(0, index + 1);
      setFolderStack(stack);
      loadFolder(stack[stack.length - 1].id);
    }
    setSelected(new Set());
  }

  function toggleFile(id: string) {
    setSelected((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });
  }

  function selectAllFiles() {
    const nonFolders = files.filter((f) => !isFolder(f.mimeType));
    if (selected.size === nonFolders.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(nonFolders.map((f) => f.id)));
    }
  }

  async function addSelected() {
    setLoadingFiles(true);
    const result: SelectedFile[] = [];
    for (const id of selected) {
      const file = files.find((f) => f.id === id);
      if (!file) continue;
      if (file.mimeType.startsWith("image/")) {
        try {
          const res = await fetch(`/api/drive/file?id=${id}`);
          const data = await res.json();
          result.push({ id, name: file.name, mimeType: file.mimeType, dataUrl: data.dataUrl });
        } catch {
          result.push({ id, name: file.name, mimeType: file.mimeType });
        }
      } else {
        result.push({ id, name: file.name, mimeType: file.mimeType });
      }
    }
    setLoadingFiles(false);
    onFilesSelected(result);
    setSelected(new Set());
  }

  function sortFiles(list: DriveFile[]): DriveFile[] {
    return [...list].sort((a, b) => {
      const af = isFolder(a.mimeType) ? 0 : 1;
      const bf = isFolder(b.mimeType) ? 0 : 1;
      if (af !== bf) return af - bf;
      return a.name.localeCompare(b.name);
    });
  }

  function isFolder(m: string) { return m === "application/vnd.google-apps.folder"; }

  function icon(m: string) {
    if (isFolder(m)) return "📁";
    if (m.startsWith("image/")) return "🖼️";
    if (m.includes("pdf")) return "📄";
    if (m.includes("document") || m.includes("text")) return "📝";
    if (m.includes("spreadsheet")) return "📊";
    if (m.includes("presentation")) return "📑";
    return "📎";
  }

  function fmtSize(s?: string) {
    if (!s) return "";
    const b = parseInt(s);
    if (b < 1024) return `${b}B`;
    if (b < 1048576) return `${(b / 1024).toFixed(0)}KB`;
    return `${(b / 1048576).toFixed(1)}MB`;
  }

  // ── Checking ──
  if (checking) {
    return (
      <div className="drive-panel" style={{ padding: "0.5rem 0.75rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.8rem", color: "var(--text-muted)" }}>
          <span className="spinner" /> בודק חיבור ל-Google Drive...
        </div>
      </div>
    );
  }

  // ── Not connected ──
  if (!connected) {
    return (
      <div className="drive-panel" style={{ padding: "0.5rem 0.75rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: "0.85rem" }}>📂 Google Drive</span>
          <button className="btn btn-primary" onClick={handleConnect} style={{ fontSize: "0.72rem", padding: "0.25rem 0.6rem" }}>התחבר</button>
        </div>
      </div>
    );
  }

  // ── Connected, browser closed ──
  if (!showBrowser) {
    return (
      <div className="drive-panel" style={{ padding: "0.5rem 0.75rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: "0.85rem" }}>📂 Drive <span style={{ color: "var(--success)", fontSize: "0.7rem" }}>מחובר</span></span>
          <div style={{ display: "flex", gap: "0.25rem" }}>
            <button className="btn btn-primary" onClick={handleBrowse} style={{ fontSize: "0.72rem", padding: "0.25rem 0.6rem" }}>עיון בקבצים</button>
            <button className="btn btn-secondary" onClick={handleDisconnect} style={{ fontSize: "0.72rem", padding: "0.25rem 0.6rem", color: "var(--error)" }}>התנתק</button>
          </div>
        </div>
      </div>
    );
  }

  // ── File browser ──
  const nonFolders = files.filter((f) => !isFolder(f.mimeType));

  return (
    <div className="drive-panel">
      {/* Header */}
      <div className="drive-header">
        <span style={{ fontWeight: 600, fontSize: "0.82rem" }}>📂 Drive</span>
        <div style={{ display: "flex", gap: "0.25rem" }}>
          {selected.size > 0 && (
            <button className="btn btn-primary" style={{ fontSize: "0.7rem", padding: "0.2rem 0.45rem" }} onClick={addSelected} disabled={loadingFiles}>
              {loadingFiles ? <span className="spinner" /> : `הוסף ${selected.size}`}
            </button>
          )}
          <button className="btn btn-secondary" style={{ fontSize: "0.7rem", padding: "0.2rem 0.45rem" }} onClick={() => setShowBrowser(false)}>סגור</button>
          <button className="btn btn-secondary" style={{ fontSize: "0.7rem", padding: "0.2rem 0.45rem", color: "var(--error)" }} onClick={handleDisconnect}>התנתק</button>
        </div>
      </div>

      {/* Search + browse */}
      <div style={{ display: "flex", gap: "0.25rem", padding: "0.35rem 0.5rem", borderBottom: "1px solid var(--border)" }}>
        <input className="form-input" placeholder="חיפוש..." value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSearchSubmit()} style={{ flex: 1, fontSize: "0.75rem", padding: "0.3rem 0.5rem" }} />
        {search && <button className="btn btn-secondary" onClick={handleSearchSubmit} style={{ fontSize: "0.7rem", padding: "0.25rem 0.4rem" }}>חפש</button>}
        <button className="btn btn-primary" onClick={handleBrowse} style={{ fontSize: "0.7rem", padding: "0.25rem 0.4rem" }}>עיון</button>
      </div>

      {/* Breadcrumbs */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.2rem", padding: "0.3rem 0.5rem", fontSize: "0.72rem", color: "var(--text-muted)", borderBottom: "1px solid var(--border)", flexWrap: "wrap" }}>
        <button onClick={() => navTo(-1)} style={{ background: "none", border: "none", cursor: "pointer", color: folderStack.length > 0 ? "var(--primary)" : "var(--text)", fontWeight: 600, fontSize: "0.72rem", fontFamily: "inherit", padding: 0 }}>My Drive</button>
        {folderStack.map((f, i) => (
          <span key={f.id} style={{ display: "flex", alignItems: "center", gap: "0.2rem" }}>
            <span style={{ opacity: 0.4 }}>/</span>
            <button onClick={() => navTo(i)} style={{ background: "none", border: "none", cursor: "pointer", color: i === folderStack.length - 1 ? "var(--text)" : "var(--primary)", fontWeight: i === folderStack.length - 1 ? 600 : 400, fontSize: "0.72rem", fontFamily: "inherit", padding: 0 }}>{f.name}</button>
          </span>
        ))}
        {nonFolders.length > 0 && (
          <button onClick={selectAllFiles} style={{ marginInlineStart: "auto", background: "none", border: "none", cursor: "pointer", color: "var(--primary)", fontSize: "0.68rem", fontFamily: "inherit" }}>
            {selected.size === nonFolders.length ? "בטל הכל" : "בחר הכל"}
          </button>
        )}
      </div>

      {error && <p style={{ color: "var(--error)", fontSize: "0.72rem", padding: "0.3rem 0.5rem" }}>{error}</p>}

      {/* Files */}
      <div className="drive-files">
        {loading ? (
          <div style={{ textAlign: "center", padding: "0.75rem" }}><span className="spinner" /></div>
        ) : files.length === 0 ? (
          <p style={{ textAlign: "center", color: "var(--text-muted)", padding: "0.75rem", fontSize: "0.78rem" }}>תיקייה ריקה</p>
        ) : (
          files.map((file) => (
            <div
              key={file.id}
              className={`drive-file-row ${selected.has(file.id) ? "selected" : ""}`}
              onClick={() => isFolder(file.mimeType) ? openFolder(file.id, file.name) : toggleFile(file.id)}
            >
              {!isFolder(file.mimeType) ? (
                <input type="checkbox" checked={selected.has(file.id)} onChange={() => toggleFile(file.id)} onClick={(e) => e.stopPropagation()} style={{ accentColor: "var(--primary)", flexShrink: 0 }} />
              ) : <span style={{ width: 16, flexShrink: 0 }} />}
              <span className="drive-file-icon">{icon(file.mimeType)}</span>
              {file.thumbnailLink && file.mimeType.startsWith("image/") && <img src={file.thumbnailLink} alt="" className="drive-file-thumb" />}
              <span className="drive-file-name">{file.name}</span>
              {isFolder(file.mimeType) && <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>▸</span>}
              {!isFolder(file.mimeType) && file.size && <span style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>{fmtSize(file.size)}</span>}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
