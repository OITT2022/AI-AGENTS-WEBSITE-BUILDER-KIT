"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import GoogleDrivePicker from "./GoogleDrivePicker";

interface LogEntry { text: string; type: "info" | "success" | "error"; }
type PreviewMode = "empty" | "scrape" | "research" | "media" | "site";

interface DriveSelectedFile {
  id: string;
  name: string;
  mimeType: string;
  dataUrl?: string;
}

function downloadFile(content: string, filename: string, mime = "text/plain") {
  const blob = new Blob([content], { type: mime });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

interface SiteBuilderProps {
  user: { firstName: string; lastName: string; email: string; admin?: boolean };
}

export default function SiteBuilder({ user }: SiteBuilderProps) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [researchQuery, setResearchQuery] = useState("");
  const [mediaPrompt, setMediaPrompt] = useState("");
  const [siteDescription, setSiteDescription] = useState("");
  const [siteName, setSiteName] = useState("");

  const [scrapeStatus, setScrapeStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [researchStatus, setResearchStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [mediaStatus, setMediaStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [generateStatus, setGenerateStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  const [scrapeData, setScrapeData] = useState<Record<string, unknown> | null>(null);
  const [researchData, setResearchData] = useState<Record<string, unknown> | null>(null);
  const [mediaData, setMediaData] = useState<Record<string, unknown>[] | null>(null);
  const [driveFiles, setDriveFiles] = useState<DriveSelectedFile[]>([]);
  const [generatedHtml, setGeneratedHtml] = useState("");
  const [savedPath, setSavedPath] = useState("");
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const [previewMode, setPreviewMode] = useState<PreviewMode>("empty");
  const [formWidth, setFormWidth] = useState(50);
  const [isResizing, setIsResizing] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  function addLog(text: string, type: LogEntry["type"] = "info") {
    setLogs((prev) => [...prev, { text, type }]);
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.refresh();
  }

  const handleMouseDown = useCallback(() => {
    setIsResizing(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    const onMove = (e: MouseEvent) => {
      e.preventDefault();
      const pct = (e.clientX / window.innerWidth) * 100;
      setFormWidth(Math.max(25, Math.min(75, 100 - pct)));
    };
    const onUp = () => {
      setIsResizing(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, []);

  async function handleScrape() {
    if (!url) return;
    setScrapeStatus("loading"); addLog(`Firecrawl: סורק ${url}...`);
    try {
      const res = await fetch("/api/scrape", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) });
      const data = await res.json();
      if (data.error) { setScrapeStatus("error"); addLog(`Firecrawl: שגיאה — ${data.error}`, "error"); return; }
      setScrapeData(data); setScrapeStatus("success"); setPreviewMode("scrape");
      addLog(`Firecrawl: נסרק בהצלחה — "${data.title}"`, "success");
    } catch (err) { setScrapeStatus("error"); addLog(`Firecrawl: ${err instanceof Error ? err.message : "שגיאה"}`, "error"); }
  }

  async function handleResearch() {
    if (!researchQuery) return;
    setResearchStatus("loading"); addLog(`Tavily: מחפש "${researchQuery.slice(0, 40)}..."...`);
    try {
      const res = await fetch("/api/research", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: researchQuery }) });
      const data = await res.json();
      if (data.error) { setResearchStatus("error"); addLog(`Tavily: שגיאה — ${data.error}`, "error"); return; }
      setResearchData(data); setResearchStatus("success"); setPreviewMode("research");
      addLog(`Tavily: נמצאו ${data.results?.length ?? 0} תוצאות`, "success");
    } catch (err) { setResearchStatus("error"); addLog(`Tavily: ${err instanceof Error ? err.message : "שגיאה"}`, "error"); }
  }

  async function handleMedia() {
    if (!mediaPrompt) return;
    setMediaStatus("loading"); addLog("Nano Banana: מייצר מדיות...");
    const lines = mediaPrompt.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
    const results: Record<string, unknown>[] = [];
    for (const line of lines) {
      let type: "banner" | "icon" | "background" | "image" = "image";
      let width = 1024, height = 1024;
      if (/באנר|banner|hero/i.test(line)) { type = "banner"; width = 1920; height = 600; }
      else if (/אייקון|icon/i.test(line)) { type = "icon"; width = 512; height = 512; }
      else if (/רקע|background/i.test(line)) { type = "background"; width = 1920; height = 1080; }
      addLog(`  → ${type}: "${line.slice(0, 35)}..."`);
      try {
        const res = await fetch("/api/media", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: line, type, width, height }) });
        const data = await res.json();
        if (data.error) { addLog(`  ✗ ${data.error}`, "error"); results.push({ prompt: line, type, error: data.error }); }
        else { addLog(`  ✓ נוצר בהצלחה`, "success"); results.push(data); }
      } catch (err) { const msg = err instanceof Error ? err.message : "שגיאה"; addLog(`  ✗ ${msg}`, "error"); results.push({ prompt: line, type, error: msg }); }
    }
    setMediaData(results);
    const ok = results.filter((r) => !r.error).length;
    if (ok > 0) { setMediaStatus("success"); addLog(`Nano Banana: ${ok}/${lines.length} מדיות נוצרו`, "success"); }
    else { setMediaStatus("error"); addLog("Nano Banana: לא הצליח — Claude ייצור placeholders", "error"); }
    setPreviewMode("media");
  }

  async function handleGenerate() {
    if (!scrapeData && !researchData) { addLog("יש לסרוק אתר או לבצע מחקר קודם", "error"); return; }
    setGenerateStatus("loading"); addLog("Claude: מייצר אתר (streaming)...");
    try {
      const lightMedia = mediaData?.map((m: Record<string, unknown>) => ({
        type: m.type, prompt: m.prompt, imageUrl: m.imageUrl ? "HAS_IMAGE" : undefined, error: m.error,
      }));
      const lightDrive = driveFiles.length > 0 ? driveFiles.map((f: { id: string; name: string; mimeType: string; dataUrl?: string }) => ({
        name: f.name, mimeType: f.mimeType, dataUrl: f.dataUrl ? "HAS_IMAGE" : undefined,
      })) : undefined;

      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scrapeData, researchData, mediaData: lightMedia, mediaPrompt: mediaPrompt || undefined, siteDescription: siteDescription || undefined, driveFiles: lightDrive }),
      });

      // Check if it's a streaming response or JSON error
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const data = await res.json();
        setGenerateStatus("error"); addLog(`Claude: שגיאה — ${data.error || "Unknown error"}`, "error"); return;
      }

      // Read SSE stream
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let fullText = "";
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") continue;
          try {
            const parsed = JSON.parse(data);
            if (parsed.text) fullText += parsed.text;
          } catch { /* skip */ }
        }
      }

      // Clean up markdown fences
      let html = fullText.replace(/^```html?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();

      if (!html) { setGenerateStatus("error"); addLog("Claude: לא התקבל תוכן", "error"); return; }

      // Replace {{IMG_X}} placeholders with actual data URLs
      let idx = 0;
      if (mediaData) {
        for (const m of mediaData as Array<{ imageUrl?: string }>) {
          if (m.imageUrl) { idx++; html = html.replaceAll(`{{IMG_${idx}}}`, String(m.imageUrl)); }
        }
      }
      for (const f of driveFiles) {
        if (f.dataUrl && f.mimeType.startsWith("image/")) { idx++; html = html.replaceAll(`{{IMG_${idx}}}`, f.dataUrl); }
      }

      setGeneratedHtml(html); setGenerateStatus("success"); setPreviewMode("site");
      addLog("האתר נוצר בהצלחה!", "success");
      setTimeout(() => {
        if (iframeRef.current) { iframeRef.current.src = URL.createObjectURL(new Blob([html], { type: "text/html" })); }
      }, 50);
    } catch (err) { setGenerateStatus("error"); addLog(`Claude: ${err instanceof Error ? err.message : "שגיאה"}`, "error"); }
  }

  const isGenerating = generateStatus === "loading";
  const canGenerate = (scrapeStatus === "success" || researchStatus === "success") && !isGenerating;

  function badge(status: string) {
    const m: Record<string, { l: string; c: string }> = { idle: { l: "ממתין", c: "status-idle" }, loading: { l: "פועל...", c: "status-loading" }, success: { l: "הושלם", c: "status-success" }, error: { l: "שגיאה", c: "status-error" } };
    const s = m[status] ?? m.idle;
    return <span className={`status-badge ${s.c}`}>{status === "loading" && <span className="spinner" />}{s.l}</span>;
  }

  function viewBtn(mode: PreviewMode, hasData: boolean) {
    if (!hasData) return null;
    return (
      <button className={`btn ${previewMode === mode ? "btn-primary" : "btn-secondary"}`} style={{ padding: "0.2rem 0.5rem", fontSize: "0.7rem" }} onClick={() => { setPreviewMode(mode); if (mode === "site" && iframeRef.current && generatedHtml) { iframeRef.current.src = URL.createObjectURL(new Blob([generatedHtml], { type: "text/html" })); } }}>
        הצג
      </button>
    );
  }

  function renderPreview() {
    if (previewMode === "scrape" && scrapeData) {
      return (
        <div className="preview-data">
          <div className="preview-data-header">
            <h3>תוצאות סריקה — Firecrawl</h3>
            <button className="btn btn-secondary btn-sm" onClick={() => downloadFile(JSON.stringify(scrapeData, null, 2), "scrape-data.json", "application/json")}>הורד JSON</button>
            <button className="btn btn-secondary btn-sm" onClick={() => downloadFile(String(scrapeData.markdown ?? ""), "scrape-content.md", "text/markdown")}>הורד Markdown</button>
          </div>
          <div className="data-section"><div className="data-label">כותרת</div><div className="data-value">{String(scrapeData.title ?? "—")}</div></div>
          <div className="data-section"><div className="data-label">תיאור</div><div className="data-value">{String(scrapeData.description ?? "—")}</div></div>
          <div className="data-section"><div className="data-label">כתובת מקור</div><div className="data-value" dir="ltr">{String(scrapeData.sourceUrl ?? "—")}</div></div>
          <div className="data-section"><div className="data-label">תוכן (Markdown)</div><pre className="data-pre">{String(scrapeData.markdown ?? "").slice(0, 5000)}</pre></div>
        </div>
      );
    }
    if (previewMode === "research" && researchData) {
      const results = (researchData.results ?? []) as Array<{ title: string; url: string; content: string; score: number }>;
      return (
        <div className="preview-data">
          <div className="preview-data-header">
            <h3>תוצאות מחקר — Tavily</h3>
            <button className="btn btn-secondary btn-sm" onClick={() => downloadFile(JSON.stringify(researchData, null, 2), "research-data.json", "application/json")}>הורד JSON</button>
          </div>
          {typeof researchData.answer === "string" && researchData.answer && (
            <div className="data-section"><div className="data-label">סיכום</div><div className="data-value" style={{ lineHeight: 1.7 }}>{String(researchData.answer)}</div></div>
          )}
          <div className="data-section">
            <div className="data-label">מקורות ({results.length})</div>
            <div className="data-results">
              {results.map((r, i) => (
                <div key={i} className="data-result-card">
                  <div className="data-result-title">{r.title}</div>
                  <a className="data-result-url" href={r.url} target="_blank" rel="noreferrer" dir="ltr">{r.url}</a>
                  <p className="data-result-content">{r.content?.slice(0, 200)}...</p>
                  <span className="data-result-score">ציון: {(r.score * 100).toFixed(0)}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }
    if (previewMode === "media" && mediaData) {
      return (
        <div className="preview-data">
          <div className="preview-data-header">
            <h3>מדיות — Nano Banana</h3>
            <button className="btn btn-secondary btn-sm" onClick={() => downloadFile(JSON.stringify(mediaData, null, 2), "media-data.json", "application/json")}>הורד JSON</button>
          </div>
          <div className="media-grid">
            {mediaData.map((m, i) => (
              <div key={i} className="media-card">
                {m.imageUrl ? (
                  <>
                    <img src={String(m.imageUrl)} alt={String(m.prompt)} className="media-thumb" />
                    <div className="media-card-footer">
                      <span className="media-type-badge">{String(m.type)}</span>
                      <button className="btn btn-secondary btn-sm" onClick={() => { const a = document.createElement("a"); a.href = String(m.imageUrl); a.download = `media-${i + 1}.png`; a.click(); }}>הורד</button>
                    </div>
                  </>
                ) : (
                  <div className="media-error"><span>✗</span><span style={{ fontSize: "0.75rem" }}>{String(m.error ?? "שגיאה")}</span></div>
                )}
                <p className="media-prompt">{String(m.prompt)}</p>
              </div>
            ))}
          </div>
        </div>
      );
    }
    if (previewMode === "site" && generatedHtml) {
      return <iframe ref={iframeRef} className="preview-frame" title="Generated site preview" sandbox="allow-scripts" />;
    }
    return (
      <div className="preview-empty">
        <div>
          <div style={{ fontSize: "2.5rem", marginBottom: "0.75rem", opacity: 0.2 }}>🌐</div>
          <p>הנתונים שיופקו יוצגו כאן</p>
          <p style={{ fontSize: "0.8rem", marginTop: "0.4rem", opacity: 0.5 }}>סרוק ← חקור ← מדיה ← בנה</p>
        </div>
      </div>
    );
  }

  const previewTitles: Record<PreviewMode, string> = { empty: "תצוגה מקדימה", scrape: "תוצאות סריקה", research: "תוצאות מחקר", media: "מדיות שנוצרו", site: "תצוגת האתר" };

  return (
    <div className="app-layout">
      {isResizing && <div style={{ position: "fixed", inset: 0, zIndex: 9999, cursor: "col-resize" }} />}
      <div className="form-panel" style={{ width: `${formWidth}%` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div className="panel-title"><span>AI</span> Site Builder</div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>שלום, {user.firstName}</span>
            {user.admin && (
              <button className="btn btn-secondary" style={{ padding: "0.2rem 0.5rem", fontSize: "0.7rem" }} onClick={() => router.push("/admin")}>ניהול</button>
            )}
            <button className="btn btn-secondary" style={{ padding: "0.2rem 0.5rem", fontSize: "0.7rem" }} onClick={handleLogout}>יציאה</button>
          </div>
        </div>

        <hr className="divider" />

        <div className="form-group">
          <div className="step-header"><div className="step-title"><span className="step-number">1</span>סריקת אתר (Firecrawl)</div><div style={{ display: "flex", gap: "0.3rem", alignItems: "center" }}>{viewBtn("scrape", !!scrapeData)}{badge(scrapeStatus)}</div></div>
          <div style={{ display: "flex", gap: "0.4rem" }}><input id="url" type="url" className="form-input" placeholder="https://example.com" value={url} onChange={(e) => setUrl(e.target.value)} dir="ltr" style={{ flex: 1 }} /><button className="btn btn-primary" onClick={handleScrape} disabled={!url || scrapeStatus === "loading"}>{scrapeStatus === "loading" ? <span className="spinner" /> : "סרוק"}</button></div>
        </div>
        <hr className="divider" />
        <div className="form-group">
          <div className="step-header"><div className="step-title"><span className="step-number">2</span>מחקר (Tavily)</div><div style={{ display: "flex", gap: "0.3rem", alignItems: "center" }}>{viewBtn("research", !!researchData)}{badge(researchStatus)}</div></div>
          <textarea id="research" className="form-input" placeholder="חקור מתחרים, מגמות עיצוב, שירותים נפוצים..." value={researchQuery} onChange={(e) => setResearchQuery(e.target.value)} rows={2} />
          <button className="btn btn-primary" onClick={handleResearch} disabled={!researchQuery || researchStatus === "loading"} style={{ alignSelf: "flex-start" }}>{researchStatus === "loading" ? <span className="spinner" /> : "חקור"}</button>
        </div>
        <hr className="divider" />
        <div className="form-group">
          <div className="step-header"><div className="step-title"><span className="step-number">3</span>יצירת מדיות (Nano Banana)</div><div style={{ display: "flex", gap: "0.3rem", alignItems: "center" }}>{viewBtn("media", !!mediaData)}{badge(mediaStatus)}</div></div>
          <textarea id="media" className="form-input" placeholder={"באנר ראשי — נוף עירוני מודרני\nאייקון — מגן אבטחה\nתמונה — צוות במשרד"} value={mediaPrompt} onChange={(e) => setMediaPrompt(e.target.value)} rows={2} />
          <button className="btn btn-primary" onClick={handleMedia} disabled={!mediaPrompt || mediaStatus === "loading"} style={{ alignSelf: "flex-start" }}>{mediaStatus === "loading" ? <span className="spinner" /> : "צור מדיות"}</button>
        </div>
        <hr className="divider" />

        {/* Google Drive */}
        <GoogleDrivePicker onFilesSelected={(files) => {
          setDriveFiles((prev) => [...prev, ...files]);
          addLog(`Google Drive: ${files.length} קבצים נוספו`, "success");
        }} />
        {driveFiles.length > 0 && (
          <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", display: "flex", flexWrap: "wrap", gap: "0.3rem" }}>
            {driveFiles.map((f, i) => (
              <span key={i} style={{ background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: "0.4rem", padding: "0.15rem 0.4rem", display: "inline-flex", alignItems: "center", gap: "0.2rem" }}>
                {f.name}
                <button onClick={() => setDriveFiles((prev) => prev.filter((_, j) => j !== i))} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--error)", fontSize: "0.7rem", fontFamily: "inherit" }}>✕</button>
              </span>
            ))}
          </div>
        )}

        <hr className="divider" />
        <div className="form-group">
          <div className="step-header"><div className="step-title"><span className="step-number">4</span>הפקת אתר (Claude AI)</div><div style={{ display: "flex", gap: "0.3rem", alignItems: "center" }}>{viewBtn("site", !!generatedHtml)}{badge(generateStatus)}</div></div>
          <textarea id="siteDesc" className="form-input" placeholder="תאר את האתר שברצונך לבנות: סוג, קהל יעד, סגנון, שפה, סקציות..." value={siteDescription} onChange={(e) => setSiteDescription(e.target.value)} rows={2} />
          <input id="siteName" type="text" className="form-input" placeholder="שם תיקיית האתר (לשמירה ב-sites/)" value={siteName} onChange={(e) => setSiteName(e.target.value)} dir="ltr" />
          <button className="btn btn-generate" onClick={handleGenerate} disabled={!canGenerate} style={{ width: "100%" }}>{isGenerating ? <><span className="spinner" /> מייצר אתר...</> : "בנה אתר"}</button>
          {savedPath && <p style={{ fontSize: "0.75rem", color: "var(--success)" }}>נשמר ב: {savedPath}</p>}
        </div>
        <hr className="divider" />
        <div className="form-group" style={{ flex: 1, minHeight: 0 }}>
          <label className="form-label">לוג</label>
          <div className="log-area" style={{ flex: 1 }}>
            {logs.length === 0 && <span className="log-line" style={{ opacity: 0.5 }}>ממתין לפעולה...</span>}
            {logs.map((log, i) => <span key={i} className={`log-line log-${log.type}`}>{log.text}</span>)}
          </div>
        </div>
      </div>
      <div className="resize-handle" onMouseDown={handleMouseDown} />
      <div className="preview-panel">
        <div className="preview-header">
          <span>{previewTitles[previewMode]}</span>
          <div style={{ display: "flex", gap: "0.3rem" }}>
            {generatedHtml && <button className="btn btn-secondary btn-sm" onClick={() => downloadFile(generatedHtml, `${siteName || "site"}.html`, "text/html")}>הורד HTML</button>}
          </div>
        </div>
        {renderPreview()}
      </div>
    </div>
  );
}
