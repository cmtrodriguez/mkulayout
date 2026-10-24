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
function loadIssueDocument(issueKey: string): Promise<PdfDocument> {
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
    const widths: number[] = [];
    for (let page = 1; page <= doc.numPages; page++) {
      const pdfPage = await doc.getPage(page);
      widths.push(pdfPage.getViewport({ scale: 1 }).width);
    }
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
