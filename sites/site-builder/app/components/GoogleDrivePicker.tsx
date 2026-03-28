"use client";

import { useState, useEffect, useCallback } from "react";

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  thumbnailLink?: string;
  webViewLink?: string;
  iconLink?: string;
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
  const [connected, setConnected] = useState<boolean | null>(null); // null = checking
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loadingFiles, setLoadingFiles] = useState<Set<string>>(new Set());
  const [folderStack, setFolderStack] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState("");

  // Check connection on mount
  useEffect(() => {
    checkConnection();
  }, []);

  // Listen for Google auth popup completion
  useEffect(() => {
    function handleMessage(e: MessageEvent) {
      if (e.data?.type === "google-auth-success") {
        setConnected(true);
        loadFiles();
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  async function checkConnection() {
    try {
      const res = await fetch("/api/drive/files?pageSize=1");
      if (res.ok) {
        setConnected(true);
        loadFiles();
      } else {
        setConnected(false);
      }
    } catch {
      setConnected(false);
    }
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
      if (res.status === 401) {
        setConnected(false);
        setLoading(false);
        return;
      }
      const data = await res.json();
      if (data.error) { setError(data.error); }
      else { setFiles(data.files ?? []); }
    } catch {
      setError("שגיאת תקשורת");
    }
    setLoading(false);
  }, []);

  function handleSearch() {
    const currentFolder = folderStack.length > 0 ? folderStack[folderStack.length - 1].id : undefined;
    loadFiles(currentFolder, search);
  }

  function handleFolderOpen(folderId: string, folderName: string) {
    setFolderStack((prev) => [...prev, { id: folderId, name: folderName }]);
    loadFiles(folderId);
  }

  function handleFolderBack() {
    const newStack = [...folderStack];
    newStack.pop();
    setFolderStack(newStack);
    const parentId = newStack.length > 0 ? newStack[newStack.length - 1].id : undefined;
    loadFiles(parentId);
  }

  function toggleSelect(fileId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(fileId)) next.delete(fileId);
      else next.add(fileId);
      return next;
    });
  }

  async function handleAddSelected() {
    const selectedFiles: SelectedFile[] = [];
    const ids = Array.from(selected);

    for (const id of ids) {
      const file = files.find((f) => f.id === id);
      if (!file) continue;

      // Only download image files
      if (file.mimeType.startsWith("image/")) {
        setLoadingFiles((prev) => new Set(prev).add(id));
        try {
          const res = await fetch(`/api/drive/file?id=${id}`);
          const data = await res.json();
          if (data.dataUrl) {
            selectedFiles.push({ id, name: file.name, mimeType: file.mimeType, dataUrl: data.dataUrl });
          }
        } catch {
          selectedFiles.push({ id, name: file.name, mimeType: file.mimeType });
        }
        setLoadingFiles((prev) => { const next = new Set(prev); next.delete(id); return next; });
      } else {
        selectedFiles.push({ id, name: file.name, mimeType: file.mimeType });
      }
    }

    onFilesSelected(selectedFiles);
    setSelected(new Set());
  }

  function isFolder(mimeType: string) {
    return mimeType === "application/vnd.google-apps.folder";
  }

  function isImage(mimeType: string) {
    return mimeType.startsWith("image/");
  }

  function fileIcon(mimeType: string) {
    if (isFolder(mimeType)) return "📁";
    if (isImage(mimeType)) return "🖼️";
    if (mimeType.includes("pdf")) return "📄";
    if (mimeType.includes("document") || mimeType.includes("text")) return "📝";
    if (mimeType.includes("presentation")) return "📊";
    return "📎";
  }

  // ── Not connected state ──
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

  // ── Loading state ──
  if (connected === null) {
    return (
      <div className="drive-panel" style={{ padding: "0.5rem 0.75rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.8rem", color: "var(--text-muted)" }}>
          <span className="spinner" /> בודק חיבור ל-Google Drive...
        </div>
      </div>
    );
  }

  // ── Connected state ──
  return (
    <div className="drive-panel">
      <div className="drive-header">
        <span style={{ fontWeight: 600, fontSize: "0.85rem" }}>📂 Google Drive</span>
        {selected.size > 0 && (
          <button className="btn btn-primary" style={{ fontSize: "0.72rem", padding: "0.2rem 0.5rem" }} onClick={handleAddSelected}>
            {loadingFiles.size > 0 ? <span className="spinner" /> : `הוסף ${selected.size} קבצים`}
          </button>
        )}
      </div>

      {/* Search */}
      <div style={{ display: "flex", gap: "0.3rem", padding: "0 0.5rem 0.5rem" }}>
        <input
          className="form-input"
          placeholder="חפש קבצים..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          style={{ flex: 1, fontSize: "0.78rem", padding: "0.35rem 0.5rem" }}
        />
        <button className="btn btn-secondary" onClick={handleSearch} style={{ fontSize: "0.72rem", padding: "0.3rem 0.5rem" }}>חפש</button>
      </div>

      {/* Breadcrumb */}
      {folderStack.length > 0 && (
        <div className="drive-breadcrumb">
          <button onClick={handleFolderBack} className="drive-back-btn">← חזרה</button>
          <span>{folderStack[folderStack.length - 1].name}</span>
        </div>
      )}

      {error && <p style={{ color: "var(--error)", fontSize: "0.75rem", padding: "0 0.5rem" }}>{error}</p>}

      {/* File list */}
      <div className="drive-files">
        {loading ? (
          <div style={{ textAlign: "center", padding: "1rem", color: "var(--text-muted)" }}>
            <span className="spinner" />
          </div>
        ) : files.length === 0 ? (
          <p style={{ textAlign: "center", color: "var(--text-muted)", padding: "1rem", fontSize: "0.8rem" }}>
            לא נמצאו קבצים
          </p>
        ) : (
          files.map((file) => (
            <div
              key={file.id}
              className={`drive-file-row ${selected.has(file.id) ? "selected" : ""}`}
              onClick={() => {
                if (isFolder(file.mimeType)) {
                  handleFolderOpen(file.id, file.name);
                } else {
                  toggleSelect(file.id);
                }
              }}
            >
              <span className="drive-file-icon">{fileIcon(file.mimeType)}</span>
              {file.thumbnailLink && isImage(file.mimeType) ? (
                <img src={file.thumbnailLink} alt="" className="drive-file-thumb" />
              ) : null}
              <span className="drive-file-name">{file.name}</span>
              {!isFolder(file.mimeType) && selected.has(file.id) && (
                <span className="drive-file-check">✓</span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
