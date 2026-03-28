"use client";

import { useState, useEffect, useCallback } from "react";

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  thumbnailLink?: string;
  size?: string;
  modifiedTime?: string;
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
  const [connected, setConnected] = useState<boolean | null>(null);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [folderStack, setFolderStack] = useState<{ id: string; name: string }[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { checkConnection(); }, []);

  useEffect(() => {
    function handleMessage(e: MessageEvent) {
      if (e.data?.type === "google-auth-success") {
        setConnected(true);
        setExpanded(true);
        loadFiles();
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  async function checkConnection() {
    try {
      const res = await fetch("/api/drive/files?pageSize=1");
      if (res.ok) { setConnected(true); } else { setConnected(false); }
    } catch { setConnected(false); }
  }

  function handleConnect() {
    window.open("/api/auth/google", "google-auth", "width=500,height=700,popup=yes");
  }

  const loadFiles = useCallback(async (folderId?: string, q?: string) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (folderId) params.set("folderId", folderId);
      if (q) params.set("q", q);
      const res = await fetch(`/api/drive/files?${params.toString()}`);
      if (res.status === 401) { setConnected(false); setLoading(false); return; }
      const data = await res.json();
      if (data.error) { setError(data.error); }
      else {
        // Sort: folders first, then files
        const sorted = (data.files ?? []).sort((a: DriveFile, b: DriveFile) => {
          const aFolder = a.mimeType === "application/vnd.google-apps.folder" ? 0 : 1;
          const bFolder = b.mimeType === "application/vnd.google-apps.folder" ? 0 : 1;
          if (aFolder !== bFolder) return aFolder - bFolder;
          return a.name.localeCompare(b.name);
        });
        setFiles(sorted);
      }
    } catch { setError("שגיאת תקשורת"); }
    setLoading(false);
  }, []);

  function handleSearch() {
    setFolderStack([]);
    loadFiles(undefined, search);
  }

  function handleFolderOpen(folderId: string, folderName: string) {
    setFolderStack((prev) => [...prev, { id: folderId, name: folderName }]);
    setSelected(new Set());
    loadFiles(folderId);
  }

  function handleBreadcrumbNav(index: number) {
    if (index === -1) {
      // Go to root
      setFolderStack([]);
      setSelected(new Set());
      loadFiles();
    } else {
      const newStack = folderStack.slice(0, index + 1);
      setFolderStack(newStack);
      setSelected(new Set());
      loadFiles(newStack[newStack.length - 1].id);
    }
  }

  function toggleSelect(fileId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(fileId)) next.delete(fileId);
      else next.add(fileId);
      return next;
    });
  }

  function selectAll() {
    const nonFolders = files.filter((f) => f.mimeType !== "application/vnd.google-apps.folder");
    if (selected.size === nonFolders.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(nonFolders.map((f) => f.id)));
    }
  }

  async function handleAddSelected() {
    const selectedFiles: SelectedFile[] = [];
    const ids = Array.from(selected);
    setLoadingFiles(true);

    for (const id of ids) {
      const file = files.find((f) => f.id === id);
      if (!file) continue;

      if (file.mimeType.startsWith("image/")) {
        try {
          const res = await fetch(`/api/drive/file?id=${id}`);
          const data = await res.json();
          if (data.dataUrl) {
            selectedFiles.push({ id, name: file.name, mimeType: file.mimeType, dataUrl: data.dataUrl });
          }
        } catch {
          selectedFiles.push({ id, name: file.name, mimeType: file.mimeType });
        }
      } else {
        selectedFiles.push({ id, name: file.name, mimeType: file.mimeType });
      }
    }

    setLoadingFiles(false);
    onFilesSelected(selectedFiles);
    setSelected(new Set());
  }

  function isFolder(mime: string) { return mime === "application/vnd.google-apps.folder"; }
  function isImage(mime: string) { return mime.startsWith("image/"); }

  function fileIcon(mime: string) {
    if (isFolder(mime)) return "📁";
    if (isImage(mime)) return "🖼️";
    if (mime.includes("pdf")) return "📄";
    if (mime.includes("document") || mime.includes("text")) return "📝";
    if (mime.includes("spreadsheet")) return "📊";
    if (mime.includes("presentation")) return "📑";
    if (mime.includes("video")) return "🎬";
    if (mime.includes("audio")) return "🎵";
    return "📎";
  }

  function formatSize(size?: string) {
    if (!size) return "";
    const bytes = parseInt(size);
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  }

  // ── Not connected ──
  if (connected === false) {
    return (
      <div className="drive-panel" style={{ padding: "0.5rem 0.75rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: "0.85rem" }}>📂 Google Drive</span>
          <button className="btn btn-primary" onClick={handleConnect} style={{ fontSize: "0.72rem", padding: "0.25rem 0.6rem" }}>
            התחבר
          </button>
        </div>
      </div>
    );
  }

  // ── Checking ──
  if (connected === null) {
    return (
      <div className="drive-panel" style={{ padding: "0.5rem 0.75rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.8rem", color: "var(--text-muted)" }}>
          <span className="spinner" /> בודק חיבור...
        </div>
      </div>
    );
  }

  // ── Connected but collapsed ──
  if (!expanded) {
    return (
      <div className="drive-panel" style={{ padding: "0.5rem 0.75rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: "0.85rem" }}>📂 Google Drive <span style={{ color: "var(--success)", fontSize: "0.7rem" }}>מחובר</span></span>
          <button className="btn btn-primary" onClick={() => { setExpanded(true); loadFiles(); }} style={{ fontSize: "0.72rem", padding: "0.25rem 0.6rem" }}>
            עיון בקבצים
          </button>
        </div>
      </div>
    );
  }

  // ── Connected + expanded ──
  const nonFolderFiles = files.filter((f) => !isFolder(f.mimeType));
  const allSelected = nonFolderFiles.length > 0 && selected.size === nonFolderFiles.length;

  return (
    <div className="drive-panel">
      {/* Header */}
      <div className="drive-header">
        <span style={{ fontWeight: 600, fontSize: "0.82rem" }}>📂 Google Drive</span>
        <div style={{ display: "flex", gap: "0.25rem" }}>
          {selected.size > 0 && (
            <button className="btn btn-primary" style={{ fontSize: "0.7rem", padding: "0.2rem 0.45rem" }} onClick={handleAddSelected} disabled={loadingFiles}>
              {loadingFiles ? <span className="spinner" /> : `הוסף ${selected.size}`}
            </button>
          )}
          <button className="btn btn-secondary" style={{ fontSize: "0.7rem", padding: "0.2rem 0.45rem" }} onClick={() => setExpanded(false)}>סגור</button>
        </div>
      </div>

      {/* Search */}
      <div style={{ display: "flex", gap: "0.25rem", padding: "0.35rem 0.5rem", borderBottom: "1px solid var(--border)" }}>
        <input className="form-input" placeholder="חיפוש קבצים..." value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSearch()} style={{ flex: 1, fontSize: "0.75rem", padding: "0.3rem 0.5rem" }} />
        <button className="btn btn-secondary" onClick={handleSearch} style={{ fontSize: "0.7rem", padding: "0.25rem 0.4rem" }}>חפש</button>
      </div>

      {/* Breadcrumbs */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.2rem", padding: "0.3rem 0.5rem", fontSize: "0.72rem", color: "var(--text-muted)", borderBottom: "1px solid var(--border)", flexWrap: "wrap" }}>
        <button onClick={() => handleBreadcrumbNav(-1)} style={{ background: "none", border: "none", cursor: "pointer", color: folderStack.length > 0 ? "var(--primary)" : "var(--text)", fontWeight: 600, fontSize: "0.72rem", fontFamily: "inherit", padding: 0 }}>
          My Drive
        </button>
        {folderStack.map((folder, i) => (
          <span key={folder.id} style={{ display: "flex", alignItems: "center", gap: "0.2rem" }}>
            <span style={{ opacity: 0.4 }}>/</span>
            <button onClick={() => handleBreadcrumbNav(i)} style={{ background: "none", border: "none", cursor: "pointer", color: i === folderStack.length - 1 ? "var(--text)" : "var(--primary)", fontWeight: i === folderStack.length - 1 ? 600 : 400, fontSize: "0.72rem", fontFamily: "inherit", padding: 0 }}>
              {folder.name}
            </button>
          </span>
        ))}
        {nonFolderFiles.length > 0 && (
          <button onClick={selectAll} style={{ marginInlineStart: "auto", background: "none", border: "none", cursor: "pointer", color: "var(--primary)", fontSize: "0.68rem", fontFamily: "inherit" }}>
            {allSelected ? "בטל הכל" : "בחר הכל"}
          </button>
        )}
      </div>

      {error && <p style={{ color: "var(--error)", fontSize: "0.72rem", padding: "0.3rem 0.5rem" }}>{error}</p>}

      {/* File list */}
      <div className="drive-files">
        {loading ? (
          <div style={{ textAlign: "center", padding: "0.75rem", color: "var(--text-muted)" }}><span className="spinner" /></div>
        ) : files.length === 0 ? (
          <p style={{ textAlign: "center", color: "var(--text-muted)", padding: "0.75rem", fontSize: "0.78rem" }}>תיקייה ריקה</p>
        ) : (
          files.map((file) => (
            <div
              key={file.id}
              className={`drive-file-row ${selected.has(file.id) ? "selected" : ""}`}
              onClick={() => isFolder(file.mimeType) ? handleFolderOpen(file.id, file.name) : toggleSelect(file.id)}
              onDoubleClick={() => isFolder(file.mimeType) ? handleFolderOpen(file.id, file.name) : undefined}
            >
              {/* Checkbox for non-folders */}
              {!isFolder(file.mimeType) ? (
                <input type="checkbox" checked={selected.has(file.id)} onChange={() => toggleSelect(file.id)} onClick={(e) => e.stopPropagation()} style={{ accentColor: "var(--primary)", flexShrink: 0 }} />
              ) : (
                <span style={{ width: 16, flexShrink: 0 }} />
              )}

              <span className="drive-file-icon">{fileIcon(file.mimeType)}</span>

              {file.thumbnailLink && isImage(file.mimeType) ? (
                <img src={file.thumbnailLink} alt="" className="drive-file-thumb" />
              ) : null}

              <span className="drive-file-name">{file.name}</span>

              {isFolder(file.mimeType) && (
                <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", flexShrink: 0 }}>▸</span>
              )}

              {!isFolder(file.mimeType) && file.size && (
                <span style={{ fontSize: "0.68rem", color: "var(--text-muted)", flexShrink: 0 }}>{formatSize(file.size)}</span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
