import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import { createClient } from "@supabase/supabase-js";

// Ensure we load environment variables
import dotenv from "dotenv";
dotenv.config();

// The issue PDF proxy lives in api/ so Vercel deploys it as a serverless
// function; reusing the same handler here keeps `npm run dev` identical.
import issuePdfHandler from "./api/issue-pdf.js";

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    })
  : null;

async function syncSupabaseState(stateData: any) {
  if (!supabase) return;

  try {
    const { error } = await supabase.from("app_state").upsert(
      {
        id: "app-state",
        data: stateData,
        updated_at: new Date().toISOString()
      },
      { onConflict: "id" }
    );

    if (error) {
      console.warn("Supabase sync warning:", error.message);
    }
  } catch (err) {
    console.warn("Supabase sync failed:", err);
  }
}

async function readSupabaseState() {
  if (!supabase) return null;

  try {
    const { data: row, error } = await supabase
      .from("app_state")
      .select("data")
      .eq("id", "app-state")
      .maybeSingle();

    if (error && error.code !== "PGRST116") {
      console.warn("Supabase read warning:", error.message);
      return null;
    }

    if (!row?.data) {
      return null;
    }

    return typeof row.data === "string" ? JSON.parse(row.data) : row.data;
  } catch (err) {
    console.warn("Supabase read failed:", err);
    return null;
  }
}

async function ensureSupabaseStateSeed() {
  if (!supabase) return;

  const seeded = readDb();
  await syncSupabaseState(seeded);
}

const app = express();
const DEFAULT_PORT = Number(process.env.PORT || 3000);

app.use(express.json({ limit: "50mb" }));

// Initialize Gemini SDK with User-Agent for telemetry
const ai = process.env.GEMINI_API_KEY 
  ? new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    })
  : null;

const DB_PATH = path.join(process.cwd(), "db.json");

// Helper to seed initial data with Layout Section members and pristine starting state
function getInitialData() {
  return {
    members: [
      { id: "1", name: "Rodriguez, Christian Matthew T.", displayName: "RODRIGUEZ - Christian Rodriguez", role: "Layout Editor", college: "CAS", email: "ctrodriguez2@up.edu.ph", contact: "9812918708", statusSem1: "Active", statusSem2: "Active", type: "editor", xp: 0, level: 1, completedTasks: 0, currentSemPubs: 0, schedule: "Mon/Wed/Fri: Free afternoons | Tue/Thu: Classes until 4PM" },
      { id: "2", name: "Abad, Ryaen Vincent C.", displayName: "ABAD - Ronz Abad", role: "Layout Deputy", college: "CAMP", email: "rcabad1@up.edu.ph", contact: "9270675190", statusSem1: "Active", statusSem2: "Active", type: "layout", xp: 0, level: 1, completedTasks: 0, currentSemPubs: 0, schedule: "Mon-Wed: Free after 2PM | Thu/Fri: Available all day" },
      { id: "3", name: "Roldan, Lady Jamaica F.", displayName: "ROLDAN - Jam Roldan", role: "Layout Staffer", college: "CAMP", email: "lfroldan@up.edu.ph", contact: "9629022674", statusSem1: "Active", statusSem2: "Active", type: "layout", xp: 0, level: 1, completedTasks: 0, currentSemPubs: 0, schedule: "Mon/Wed: 8AM-12PM Class, Free PM | Tue/Thu: Free" },
      { id: "4", name: "Donor, Carl Dexter N.", displayName: "DONOR - Carl Donor", role: "Layout Staffer", college: "CP", email: "cndonor@up.edu.ph", contact: "9054353693", statusSem1: "Active", statusSem2: "Active", type: "layout", xp: 0, level: 1, completedTasks: 0, currentSemPubs: 0, schedule: "Tue/Thu: Free after 1PM | Wed/Fri: Available" },
      { id: "5", name: "Umali, Jherica A.", displayName: "UMALI - Jhe Umali", role: "Layout Probi", college: "CPH", email: "jaumali2@up.edu.ph", contact: "9294904845", statusSem1: "Active", statusSem2: "Active", type: "layout", xp: 0, level: 1, completedTasks: 0, currentSemPubs: 0, schedule: "Mon/Fri: Available all day | Tue/Thu: Classes until 3PM" },
      { id: "6", name: "Musni, Clarisse Joy T.", displayName: "MUSNI - Aris Musni", role: "Layout Probi", college: "CP", email: "ctmusni@up.edu.ph", contact: "9305260606", statusSem1: "Active", statusSem2: "Active", type: "layout", xp: 0, level: 1, completedTasks: 0, currentSemPubs: 0, schedule: "Wed/Fri: Free PM | Mon/Tue/Thu: Morning classes" },
      { id: "7", name: "Sorio, Clarissa Joyce A.", displayName: "SORIO - Issa Sorio", role: "Layout Probi", college: "CP", email: "casorio@up.edu.ph", contact: "9662691102", statusSem1: "Active", statusSem2: "Active", type: "layout", xp: 0, level: 1, completedTasks: 0, currentSemPubs: 0, schedule: "Mon-Thu: Free after 4PM | Fri: Available" },
      { id: "8", name: "Atienza, Zoe Marceux T.", displayName: "ATIENZA - Zoe Atienza", role: "Layout Probi", college: "CAS", email: "ztatienza@up.edu.ph", contact: "9989500413", statusSem1: "Active", statusSem2: "Active", type: "layout", xp: 0, level: 1, completedTasks: 0, currentSemPubs: 0, schedule: "Mon/Wed: Available all day | Tue/Thu: 9AM-1PM Class" },
      { id: "9", name: "Magno, Joanna Eve C.", displayName: "MAGNO - Eve Magno", role: "Layout Probi", college: "CAS", email: "jcmagno1@up.edu.ph", contact: "9667320169", statusSem1: "Active", statusSem2: "Active", type: "layout", xp: 0, level: 1, completedTasks: 0, currentSemPubs: 0, schedule: "Tue/Thu/Fri: Available after 12PM | Mon/Wed: Class" },
      { id: "10", name: "Dizon, Iris B.", displayName: "DIZON - Iris Dizon", role: "Layout Probi", college: "CAMP", email: "ibdizon@up.edu.ph", contact: "9955338010", statusSem1: "Active", statusSem2: "Active", type: "layout", xp: 0, level: 1, completedTasks: 0, currentSemPubs: 0, schedule: "Mon/Wed/Fri: Free after 1PM | Tue/Thu: Available" },
    ],
    tasks: [],
    events: [],
    polls: [],
    comments: [],
    notifications: [],
    announcements: [
      {
        id: "ann-1",
        title: "Welcome to MKule Layout Desk 2026",
        content: "New semester workflow activated. Layout staffers and probis please submit your weekly schedules in the Team Directory.",
        date: "2026-07-01",
        author: "Rodriguez, Christian (Layout Editor)"
      }
    ],
    achievements: [
      { id: "ac1", title: "Grid Master", description: "Completed Grid and Alignment challenges with a perfect 100% balance score.", icon: "Grid", xp: 100 },
      { id: "ac2", title: "Contrast Champion", description: "Successfully validated and matched 5 consecutive colors for editorial standards.", icon: "Sun", xp: 150 },
      { id: "ac3", title: "Deadline Samurai", description: "Submitted 10 tasks ahead of or on the exact release date.", icon: "Clock", xp: 200 }
    ],
    memberXp: {}
  };
}

// Read database
function readDb() {
  if (!fs.existsSync(DB_PATH)) {
    const initial = getInitialData();
    fs.writeFileSync(DB_PATH, JSON.stringify(initial, null, 2));
    return initial;
  }
  try {
    const content = fs.readFileSync(DB_PATH, "utf-8");
    return JSON.parse(content);
  } catch (err) {
    console.error("Error reading db.json, returning default data", err);
    return getInitialData();
  }
}

// Write database
function writeDb(data: any) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
    return true;
  } catch (err) {
    console.error("Error writing db.json", err);
    return false;
  }
}

// 1. Get database state
app.get("/api/issue-pdf", issuePdfHandler);

app.get("/api/state", async (req, res) => {
  const supabaseState = await readSupabaseState();
  const fallbackState = readDb();

  if (supabaseState) {
    return res.json(supabaseState);
  }

  if (supabase) {
    await syncSupabaseState(fallbackState);
  }

  res.json(fallbackState);
});

// 1a. Roster read for the client. The browser queries Supabase directly, but this
// endpoint exists so a failing/empty browser read can be recovered — the server uses
// the service key, which is not affected by RLS or PostgREST schema-cache problems.
app.get("/api/members", async (req, res) => {
  if (supabase) {
    const { data, error } = await supabase.from("members").select("*");
    if (!error && Array.isArray(data) && data.length > 0) {
      return res.json(data.map((row: any) => ({
        id: row.id,
        name: row.name || "",
        displayName: row.display_name || row.name || "",
        role: row.role || "Layout Staffer",
        college: row.college || "",
        email: row.email || "",
        contact: row.contact || "",
        statusSem1: row.status_sem1 || "Active",
        statusSem2: row.status_sem2 || "Active",
        type: row.type || "layout",
        xp: row.xp ?? 0,
        level: row.level ?? 1,
        completedTasks: row.completed_tasks ?? 0,
        currentSemPubs: row.current_sem_pubs ?? 0,
        schedule: row.schedule ?? "",
        avatarUrl: row.avatar_url || undefined
      })));
    }
    console.warn("Server roster read failed:", error?.message);
  }

  res.json(readDb().members || []);
});

// 1b. Get personal calendar events for a specific user
app.get("/api/personal-events", (req, res) => {
  const email = (req.query.email as string || "").trim().toLowerCase();
  const db = readDb();
  const allEvents = db.personalCalendarEvents || [];
  if (!email) {
    return res.json([]);
  }
  const userEvents = allEvents.filter((ev: any) => (ev.userEmail || "").trim().toLowerCase() === email);
  res.json(userEvents);
});

// 1c. Add or update personal event for a specific user
app.post("/api/personal-events", async (req, res) => {
  const event = req.body;
  if (!event || !event.userEmail || !event.title || !event.date) {
    return res.status(400).json({ error: "Missing required event fields (userEmail, title, date)" });
  }
  const db = readDb();
  if (!db.personalCalendarEvents) {
    db.personalCalendarEvents = [];
  }
  const existingIdx = db.personalCalendarEvents.findIndex((ev: any) => ev.id === event.id);
  if (existingIdx >= 0) {
    db.personalCalendarEvents[existingIdx] = { ...db.personalCalendarEvents[existingIdx], ...event };
  } else {
    db.personalCalendarEvents.push({
      ...event,
      id: event.id || `personal-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      createdAt: event.createdAt || new Date().toISOString()
    });
  }
  writeDb(db);
  if (supabase) {
    await syncSupabaseState(db);
  }
  res.json({ status: "success", event });
});

// 1d. Delete personal event for a specific user
app.delete("/api/personal-events/:id", async (req, res) => {
  const eventId = req.params.id;
  const email = (req.query.email as string || "").trim().toLowerCase();
  const db = readDb();
  if (!db.personalCalendarEvents) {
    db.personalCalendarEvents = [];
  }
  db.personalCalendarEvents = db.personalCalendarEvents.filter((ev: any) => {
    if (ev.id === eventId) {
      if (email && (ev.userEmail || "").trim().toLowerCase() !== email) {
        return true; // Not authorized to delete another user's event
      }
      return false; // Remove this event
    }
    return true;
  });
  writeDb(db);
  if (supabase) {
    await syncSupabaseState(db);
  }
  res.json({ status: "success" });
});

// 2. Save database state
app.post("/api/state", async (req, res) => {
  const success = writeDb(req.body);
  if (success) {
    await syncSupabaseState(req.body);
    res.json({ status: "success", data: req.body });
  } else {
    res.status(500).json({ error: "Failed to write database" });
  }
});

// 3. AI Layout Critique endpoint
app.post("/api/gemini/critique", async (req, res) => {
  if (!ai) {
    return res.status(400).json({ error: "Gemini API key is not configured in Secrets." });
  }
  const { title, typeOfContent, prompt, imageBase64 } = req.body;
  
  try {
    let parts: any[] = [];
    if (imageBase64) {
      parts.push({
        inlineData: {
          mimeType: "image/png",
          data: imageBase64.replace(/^data:image\/\w+;base64,/, ""),
        }
      });
    }

    const textPrompt = `You are an expert student publication Layout Editor and UI/UX Accessibility specialist.
Analyze the following design assignment details and provide professional constructive critique.
Title: ${title}
Type of Content: ${typeOfContent}
User Design Notes/Description: ${prompt || "No additional description provided."}

Analyze the design based on:
1. Typography & Hierarchy (Font contrast, sizes, line heights, title vs body alignment)
2. Grid Systems & Spacing (White space, margins, flow, padding consistency)
3. Color Harmony & Contrast (Does it meet WCAG 2.2 AA standards? Minimum 4.5:1 ratio for body text, 3:1 for large headings)
4. Editorial / Magazine Layout suitability (Does it draw the reader in, visual balance, composition)

Please respond STRICTLY with a valid JSON block containing:
{
  "score": number (0 to 100 overall score),
  "critique": "Markdown formatted constructive detailed critique",
  "accessibilityCheck": {
    "passed": boolean,
    "issues": ["list of accessibility issues or warnings"]
  },
  "recommendations": ["three key, direct design changes to make next"]
}`;

    parts.push({ text: textPrompt });

    const response = await ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents: { parts },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            score: { type: Type.INTEGER },
            critique: { type: Type.STRING },
            accessibilityCheck: {
              type: Type.OBJECT,
              properties: {
                passed: { type: Type.BOOLEAN },
                issues: { type: Type.ARRAY, items: { type: Type.STRING } }
              },
              required: ["passed", "issues"]
            },
            recommendations: { type: Type.ARRAY, items: { type: Type.STRING } }
          },
          required: ["score", "critique", "accessibilityCheck", "recommendations"]
        }
      }
    });

    const parsedResponse = JSON.parse(response.text || "{}");
    res.json(parsedResponse);

  } catch (error: any) {
    console.error("Gemini Critique Error:", error);
    res.status(500).json({ error: error?.message || "Gemini critique failed" });
  }
});

// 4. AI Workload Balancing and suggested assignee
app.post("/api/gemini/auto-assign", async (req, res) => {
  if (!ai) {
    return res.status(400).json({ error: "Gemini API key is not configured in Secrets." });
  }
  const { taskTitle, typeOfContent, taskPriority, releaseDate } = req.body;
  const dbData = readDb();
  
  // Prepare light payload of members and their current active task count to save tokens
  const activeMembers = dbData.members
    .filter((m: any) => m.statusSem1 === "Active" && m.statusSem2 === "Active")
    .map((m: any) => {
      const activeTasks = dbData.tasks.filter(
        (t: any) => t.illusLayout === m.name && t.progress !== "Completed" && t.progress !== "Shelved" && t.progress !== "Archived"
      ).map((t: any) => t.title);
      return {
        name: m.name,
        role: m.role,
        type: m.type,
        college: m.college,
        activeTasks,
        xp: m.xp,
        level: m.level
      };
    });

  const prompt = `You are the ultimate workflow automation bot for a publication layout team.
We need to assign a new layout/design task.
New Task Details:
- Title: "${taskTitle}"
- Content Type: "${typeOfContent}" (e.g. editorial, op artx, feats artx, illustration)
- Priority: "${taskPriority}"
- Release Target: "${releaseDate}"

Active Layout Artists & Illustrators Workload Roster:
${JSON.stringify(activeMembers, null, 2)}

Pick the SINGLE BEST SUITED assignee from this roster.
Guidelines:
1. Match the content type: If it is "illustration" or "feats artx with graphics", prefer members whose type is "illustrator" or who have high XP levels. If it's a standard newspaper/online article layout, prefer "layout" artists.
2. Balance workload: Avoid assignees with already more than 2 active tasks. Choose the person with lower active task count if possible.
3. Priority matching: If the task is High or Urgent, pick a highly experienced member (higher XP/level or Layout Head).

Return a valid JSON object matching this schema:
{
  "recommendedName": "Exact name of recommended artist from roster",
  "reasoning": "Markdown structured list of reasons why they were chosen, mentioning their current workload, experience matches, or college context",
  "burnoutWarning": "Description of burnout alert if any, or general workload summary of layout team"
}`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            recommendedName: { type: Type.STRING },
            reasoning: { type: Type.STRING },
            burnoutWarning: { type: Type.STRING }
          },
          required: ["recommendedName", "reasoning", "burnoutWarning"]
        }
      }
    });

    const parsedResponse = JSON.parse(response.text || "{}");
    res.json(parsedResponse);

  } catch (error: any) {
    console.error("Gemini Auto-Assign Error:", error);
    res.status(500).json({ error: error?.message || "AI auto-assignment failed" });
  }
});

// 5. Burnout Detection & Predictive Analytics
app.post("/api/gemini/burnout", async (req, res) => {
  if (!ai) {
    return res.status(400).json({ error: "Gemini API key is not configured." });
  }
  const dbData = readDb();

  // Create summary of all members, completed count, and pending tasks
  const workloadSummary = dbData.members.map((m: any) => {
    const pendingTasks = dbData.tasks.filter(
      (t: any) => t.illusLayout === m.name && t.progress !== "Completed" && t.progress !== "Shelved" && t.progress !== "Archived"
    );
    const urgentPendingCount = pendingTasks.filter((t: any) => t.priority === "High" || t.priority === "Urgent").length;
    return {
      name: m.name,
      role: m.role,
      type: m.type,
      college: m.college,
      completedCount: m.completedTasks,
      pendingCount: pendingTasks.length,
      urgentPendingCount,
      xp: m.xp
    };
  });

  const prompt = `You are a burnout prevention AI and team health analyst.
Analyze the following workload roster of a student publication's layout team:
${JSON.stringify(workloadSummary, null, 2)}

Identify any layout artist or illustrator under high stress, risk of late submission, or burnout.
Provide a stress score (0-100) per individual, specify warning flags, and write actionable team coordination advice.

Please respond strictly in a valid JSON array format, where each item matches:
{
  "name": "Exact member name",
  "stressScore": number (0 to 100),
  "riskLevel": "Low" | "Medium" | "High" | "Critical",
  "warningFlags": ["specific reasons, e.g. too many urgent tasks, high historical load"],
  "recommendation": "What the Layout Editor should do (e.g., reassign 1 task, pause new work)"
}`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              stressScore: { type: Type.INTEGER },
              riskLevel: { type: Type.STRING, enum: ["Low", "Medium", "High", "Critical"] },
              warningFlags: { type: Type.ARRAY, items: { type: Type.STRING } },
              recommendation: { type: Type.STRING }
            },
            required: ["name", "stressScore", "riskLevel", "warningFlags", "recommendation"]
          }
        }
      }
    });

    const parsedResponse = JSON.parse(response.text || "[]");
    res.json(parsedResponse);

  } catch (error: any) {
    console.error("Gemini Burnout Error:", error);
    res.status(500).json({ error: error?.message || "AI burnout analysis failed" });
  }
});

// 6. Scan Schedule Image via Gemini Vision
app.post("/api/scan-schedule", async (req, res) => {
  const { imageBase64 } = req.body;
  if (!imageBase64) {
    return res.status(400).json({ error: "Missing imageBase64 data" });
  }

  if (!ai) {
    return res.status(400).json({ 
      error: "Gemini API key is not configured.",
      fallback: "Manual schedule entry is available."
    });
  }

  try {
    const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const mimeMatch = imageBase64.match(/^data:(image\/\w+);base64,/);
    const mimeType = mimeMatch ? mimeMatch[1] : "image/png";

    const promptText = `You are an expert student schedule analyzer for a student publication layout team.
Analyze the provided schedule image (university study list, Form 5, enlistment summary, class schedule timetable, or weekly calendar screenshot).
Extract the person's weekly class commitments and identify when they have classes (busy) versus when they are free / available for layout tasks.

Return STRICT JSON matching this schema:
{
  "summary": "Concise overview of their overall weekly availability (e.g., 'Free Mon/Wed afternoons, Friday and weekends all day. Classes Tue/Thu 8AM-5PM.')",
  "monday": "Availability summary for Monday (e.g., 'Class: 8:30-11:30 AM | Free: 1:00 PM onwards')",
  "tuesday": "Availability summary for Tuesday",
  "wednesday": "Availability summary for Wednesday",
  "thursday": "Availability summary for Thursday",
  "friday": "Availability summary for Friday",
  "saturday": "Availability summary for Saturday",
  "sunday": "Availability summary for Sunday"
}`;

    const response = await ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents: {
        parts: [
          {
            inlineData: {
              mimeType,
              data: cleanBase64
            }
          },
          { text: promptText }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING },
            monday: { type: Type.STRING },
            tuesday: { type: Type.STRING },
            wednesday: { type: Type.STRING },
            thursday: { type: Type.STRING },
            friday: { type: Type.STRING },
            saturday: { type: Type.STRING },
            sunday: { type: Type.STRING },
          },
          required: ["summary", "monday", "tuesday", "wednesday", "thursday", "friday"]
        }
      }
    });

    const parsed = JSON.parse(response.text || "{}");
    res.json(parsed);
  } catch (err: any) {
    console.error("Schedule scan error:", err);
    res.status(500).json({ error: err.message || "Failed to scan schedule image" });
  }
});

// Vite Middleware for client asset serving and index.html fallbacks
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const listenOnPort = (port: number) => {
    const server = app.listen(port, "0.0.0.0", () => {
      console.log(`MKuLayout Server running on port ${port}`);
    });

    server.on("error", (error: any) => {
      if (error && error.code === "EADDRINUSE") {
        const nextPort = port + 1;
        console.warn(`Port ${port} is busy; retrying on ${nextPort}`);
        listenOnPort(nextPort);
        return;
      }
      console.error("Server startup error:", error);
      process.exit(1);
    });
  };

  listenOnPort(DEFAULT_PORT);
}

startServer();
