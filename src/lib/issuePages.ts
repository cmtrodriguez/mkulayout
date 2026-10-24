// Renders the published issue PDFs page by page. Drive gives no CORS headers,
// so the bytes come through /api/issue-pdf and pdf.js runs entirely in the
// browser. Kept out of the main bundle: the library is only pulled in when the
// Issue Assessment desk is opened.
import { ISSUE_FILES } from "./issues";

type PdfDocument = import("pdfjs-dist/types/src/display/api").PDFDocumentProxy;

const documents = new Map<string, Promise<PdfDocument>>();
const pageImages = new Map<string, Promise<string>>();

async function pdfLibrary() {
  const [pdfjs, worker] = await Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  return pdfjs;
}

/** Downloads one issue and parses it once; every later page read reuses it. */
export function loadIssueDocument(issueKey: string): Promise<PdfDocument> {
  const cached = documents.get(issueKey);
  if (cached) return cached;

  const fileId = ISSUE_FILES[issueKey]?.fileId;
  const pending = (async () => {
    if (!fileId) throw new Error("Unknown issue.");
    const response = await fetch(`/api/issue-pdf?id=${fileId}`);
    if (!response.ok) {
      const detail = await response.json().catch(() => null);
      throw new Error(detail?.error || `Could not load the issue (${response.status}).`);
    }
    const pdfjs = await pdfLibrary();
    const buffer = await response.arrayBuffer();
    return pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
  })();

  documents.set(issueKey, pending);
  pending.catch(() => documents.delete(issueKey));
  return pending;
}

export async function getIssuePageCount(issueKey: string): Promise<number> {
  const doc = await loadIssueDocument(issueKey);
  return doc.numPages;
}

/**
 * Rasterizes one page to a PNG object URL at the given CSS width, cached so the
 * table can re-render without repainting every page.
 */
export function getIssuePageImage(issueKey: string, page: number, width: number): Promise<string> {
  const cacheKey = `${issueKey}:${page}:${width}`;
  const cached = pageImages.get(cacheKey);
  if (cached) return cached;

  const pending = (async () => {
    const doc = await loadIssueDocument(issueKey);
    const pdfPage = await doc.getPage(page);
    const natural = pdfPage.getViewport({ scale: 1 });
    const viewport = pdfPage.getViewport({ scale: width / natural.width });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is unavailable in this browser.");
    await pdfPage.render({ canvas, canvasContext: context, viewport }).promise;
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("This page could not be drawn.");
    return URL.createObjectURL(blob);
  })();

  pageImages.set(cacheKey, pending);
  pending.catch(() => pageImages.delete(cacheKey));
  return pending;
}
