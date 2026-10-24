// Streams a link-shared issue PDF to the browser so pdf.js can read it.
// Drive sends no CORS headers, so the client cannot fetch the file directly.
// Deployed by Vercel as an Edge-free Node function (package.json is "type":
// "module", so api/*.js is ESM) and reused by server.ts for `npm run dev`.

import { Readable } from "node:stream";

// Only these three issues may be proxied: an open Drive proxy would let any
// caller pull arbitrary files through the app.
export const ALLOWED_ISSUE_FILES = {
  "1eHUhpqFtPEj07uCG9Hoc47sweVbzc59y": "1K1-2",
  "1z8baF1AbGRy9T2wh6my6zfH9ooWO4uO1": "1K3-4",
  "1oDTnQQ2oJmv9OwAOzOmpZVdABh2FUq8v": "1K5",
};

const MAX_BYTES = 80 * 1024 * 1024;

// An issue PDF takes ~10 s to stream in from Drive, so ask for headroom.
export const maxDuration = 60;

async function downloadFromDrive(fileId) {
  const endpoints = [
    `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`,
    `https://drive.google.com/uc?export=download&id=${fileId}&confirm=t`,
  ];

  let lastProblem = "Issue file is unavailable.";
  for (const endpoint of endpoints) {
    let response;
    try {
      response = await fetch(endpoint, { redirect: "follow" });
    } catch (error) {
      lastProblem = `Could not reach Google Drive: ${error.message}`;
      continue;
    }
    if (!response.ok || !response.body) {
      lastProblem = `Google Drive returned ${response.status}.`;
      continue;
    }

    const contentType = response.headers.get("content-type") || "";
    const length = Number(response.headers.get("content-length") || 0);
    // A large shared PDF can come back as an HTML virus-scan interstitial
    // instead of the file, which pdf.js would silently fail on.
    if (contentType.includes("text/html") || contentType.includes("text/plain")) {
      lastProblem = "Google Drive refuses to serve this file anonymously.";
      continue;
    }
    if (length > MAX_BYTES) {
      lastProblem = `Issue PDF is larger than the ${Math.round(MAX_BYTES / 1048576)} MB limit.`;
      continue;
    }

    return response;
  }

  throw Object.assign(new Error(lastProblem), { status: 502 });
}

export default async function issuePdfHandler(req, res) {
  const fileId = String(req.query?.id || "");
  if (!ALLOWED_ISSUE_FILES[fileId]) {
    res.status(400).json({ error: "Unknown issue file." });
    return;
  }

  try {
    const response = await downloadFromDrive(fileId);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Cache-Control", "public, max-age=1800");
    const length = response.headers.get("content-length");
    if (length) res.setHeader("Content-Length", length);
    const stream = Readable.fromWeb(response.body);
    // A reader who closes the tab mid-download must not take the host down with them.
    stream.on("error", () => res.destroy());
    res.on("close", () => stream.destroy());
    stream.pipe(res);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
}
