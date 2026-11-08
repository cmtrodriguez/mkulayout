// Renders the published issue PDFs page by page. Drive gives no CORS headers,
// so the bytes come through /api/issue-pdf and pdf.js runs entirely in the
// browser. Kept out of the main bundle: the library is only pulled in when the
// Issue Assessment desk is opened.
import { ISSUE_FILES } from "./issues";

type PdfDocument = import("pdfjs-dist/types/src/display/api").PDFDocumentProxy;

const documents = new Map<string, Promise<PdfDocument>>();
const pageImages = new Map<string, Promise<string>>();

// One issue is ~20 MB, so a stalled pull used to leave the desk spinning for
// minutes. Give up when the bytes stop arriving, and never wait forever.
const STALL_MS = 15_000;
const OVERALL_MS = 120_000;

// The downloaded PDF is kept on the device, so opening the desk again on mobile
// data costs nothing.
const CACHE_NAME = "mkulayout-issue-pdfs";
const CACHE_FRESH_MS = 86_400_000;

export interface IssueDownloadProgress {
  issueKey: string;
  loaded: number;
  total: number;
}

type ProgressListener = (progress: IssueDownloadProgress) => void;
const progressListeners = new Set<ProgressListener>();

export function onIssueDownloadProgress(listener: ProgressListener): () => void {
  progressListeners.add(listener);
  return () => { progressListeners.delete(listener); };
}

function emitProgress(progress: IssueDownloadProgress) {
  progressListeners.forEach((listener) => listener(progress));
}

export function formatIssueBytes(bytes: number): string {
  return bytes >= 1048576
    ? `${(bytes / 1048576).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

const pdfUrl = (fileId: string) => `/api/issue-pdf?id=${encodeURIComponent(fileId)}`;

async function readCachedPdf(url: string): Promise<Uint8Array | null> {
  if (typeof caches === "undefined") return null;
  try {
    const hit = await (await caches.open(CACHE_NAME)).match(url);
    if (!hit) return null;
    const cachedAt = Number(hit.headers.get("x-mku-cached-at") || 0);
    if (!cachedAt || Date.now() - cachedAt > CACHE_FRESH_MS) return null;
    return new Uint8Array(await hit.arrayBuffer());
  } catch {
    return null;
  }
}

async function writeCachedPdf(url: string, bytes: Uint8Array): Promise<void> {
  if (typeof caches === "undefined") return;
  try {
    await (await caches.open(CACHE_NAME)).put(
      url,
      new Response(bytes.slice().buffer, {
        headers: { "content-type": "application/pdf", "x-mku-cached-at": String(Date.now()) },
      })
    );
  } catch {
    // A full or unavailable cache must not take the desk down with it.
  }
}

async function downloadPdf(fileId: string, issueKey: string): Promise<Uint8Array> {
  const controller = new AbortController();
  const startedAt = Date.now();
  let lastByteAt = startedAt;
  let loaded = 0;
  const watchdog = window.setInterval(() => {
    if (Date.now() - lastByteAt > STALL_MS || Date.now() - startedAt > OVERALL_MS) controller.abort();
  }, 1000);

  try {
    const response = await fetch(pdfUrl(fileId), { signal: controller.signal });
    if (!response.ok) {
      const detail = await response.json().catch(() => null);
      throw new Error(detail?.error || `Could not load the issue (${response.status}).`);
    }

    const total = Number(response.headers.get("content-length") || 0);
    if (!response.body) {
      const bytes = new Uint8Array(await response.arrayBuffer());
      emitProgress({ issueKey, loaded: bytes.byteLength, total: bytes.byteLength });
      return bytes;
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      chunks.push(value);
      loaded += value.byteLength;
      lastByteAt = Date.now();
      emitProgress({ issueKey, loaded, total });
    }

    const bytes = new Uint8Array(loaded);
    let offset = 0;
    chunks.forEach((chunk) => { bytes.set(chunk, offset); offset += chunk.byteLength; });
    if (total && loaded < total) throw new Error("The issue download stopped before the whole PDF arrived. Retry it.");
    return bytes;
  } catch (error) {
    if ((error as Error)?.name === "AbortError") {
      throw new Error(
        loaded
          ? "The issue download stalled. Retry it, or open the issue in Drive."
          : "The issue could not start downloading. Check the connection and retry."
      );
    }
    throw error;
  } finally {
    window.clearInterval(watchdog);
  }
}

async function getIssueBytes(issueKey: string, fileId: string): Promise<Uint8Array> {
  const url = pdfUrl(fileId);
  const cached = await readCachedPdf(url);
  if (cached) {
    emitProgress({ issueKey, loaded: cached.byteLength, total: cached.byteLength });
    return cached;
  }
  const bytes = await downloadPdf(fileId, issueKey);
  await writeCachedPdf(url, bytes);
  return bytes;
}

async function pdfLibrary() {
  const [pdfjs, worker] = await Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  return pdfjs;
}

/** Downloads one issue and parses it once; every later page read reuses it. */
function loadIssueDocument(issueKey: string): Promise<PdfDocument> {
  const cached = documents.get(issueKey);
  if (cached) return cached;

  const fileId = ISSUE_FILES[issueKey]?.fileId;
  const pending = (async () => {
    if (!fileId) throw new Error("Unknown issue.");
    const [pdfjs, bytes] = await Promise.all([pdfLibrary(), getIssueBytes(issueKey, fileId)]);
    return pdfjs.getDocument({ data: bytes }).promise;
  })();

  documents.set(issueKey, pending);
  pending.catch(() => documents.delete(issueKey));
  return pending;
}

export interface IssuePageSpan {
  /** Sheet number inside the PDF, which is what pdf.js is asked to draw. */
  pdfPage: number;
  /** First printed folio that sheet carries. */
  first: number;
  last: number;
  spread: boolean;
}

const pageSpans = new Map<string, Promise<IssuePageSpan[]>>();

/**
 * A spread is one PDF sheet holding two printed pages side by side, and it shows
 * up as exactly double the issue's usual page width (792 pt versus 1584 pt for
 * 1K1-2). Printed numbering therefore skips two on those sheets, which is why
 * sheet 4 of 1K1-2 is folios 4-5 and sheet 5 is folio 6.
 */
export function getIssuePageSpans(issueKey: string): Promise<IssuePageSpan[]> {
  const cached = pageSpans.get(issueKey);
  if (cached) return cached;

  const pending = (async () => {
    const doc = await loadIssueDocument(issueKey);
    const widths = await Promise.all(
      Array.from({ length: doc.numPages }, (_, index) =>
        doc.getPage(index + 1).then((pdfPage) => pdfPage.getViewport({ scale: 1 }).width))
    );
    const singleWidth = Math.min(...widths);
    let folio = 1;
    return widths.map((width, index) => {
      const spread = width >= singleWidth * 1.5;
      const first = folio;
      folio += spread ? 2 : 1;
      return { pdfPage: index + 1, first, last: spread ? first + 1 : first, spread };
    });
  })();

  pageSpans.set(issueKey, pending);
  pending.catch(() => pageSpans.delete(issueKey));
  return pending;
}

export function pageSpanLabel(span: IssuePageSpan): string {
  return span.spread ? `Pages ${span.first}-${span.last}` : `Page ${span.first}`;
}

// Phones drop large canvas rasterizations, so a page is never drawn wider than
// the screen can show at 2x, and never past a size mobile browsers handle.
function rasterWidth(width: number): number {
  const viewport = typeof window === "undefined" ? width : window.innerWidth;
  return Math.max(96, Math.min(width, viewport * 2, 1400));
}

/**
 * Rasterizes one page to an image object URL at the given CSS width, cached so
 * the table can re-render without repainting every page.
 */
export function getIssuePageImage(issueKey: string, page: number, width: number): Promise<string> {
  const targetWidth = rasterWidth(width);
  const cacheKey = `${issueKey}:${page}:${targetWidth}`;
  const cached = pageImages.get(cacheKey);
  if (cached) return cached;

  const pending = (async () => {
    const doc = await loadIssueDocument(issueKey);
    const pdfPage = await doc.getPage(page);
    const natural = pdfPage.getViewport({ scale: 1 });
    const viewport = pdfPage.getViewport({ scale: targetWidth / natural.width });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is unavailable in this browser.");
    // JPEG has no alpha, so the page is painted onto paper white first.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    await pdfPage.render({ canvas, canvasContext: context, viewport }).promise;
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
    if (!blob) throw new Error("This page could not be drawn.");
    return URL.createObjectURL(blob);
  })();

  pageImages.set(cacheKey, pending);
  pending.catch(() => pageImages.delete(cacheKey));
  return pending;
}
