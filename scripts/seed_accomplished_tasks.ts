import dotenv from "dotenv";
dotenv.config();
import { createClient } from "@supabase/supabase-js";

const sbUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!sbUrl || !sbKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY");
  process.exit(1);
}

const sb = createClient(sbUrl, sbKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

// Format: Name of Account - Category - Issue/Online - Title - Date Accomplished
const ACCOMPLISHED = [
  { name: "Issa Sorio", category: "Features", title: "ICC", dateLabel: "October 3, 2026", dateIso: "2026-10-03T00:00:00.000Z" },
  { name: "Zoe Atienza", category: "News", title: "UEB Ballot", dateLabel: "October 4, 2026", dateIso: "2026-10-04T00:00:00.000Z" },
  { name: "Ronz Abad", category: "Opinion", title: "PT", dateLabel: "October 6, 2026", dateIso: "2026-10-06T00:00:00.000Z" }
];

function rowFor(entry: (typeof ACCOMPLISHED)[number]) {
  return {
    id: crypto.randomUUID(),
    title: entry.title,
    type_of_release: "Online Article",
    type_of_content: entry.category,
    writer: "",
    illus_layout: entry.name,
    graphics: "",
    progress: "Completed",
    writeup: "",
    priority: "Medium",
    release_date: entry.dateLabel,
    time: null,
    estimated_hours: null,
    actual_hours: null,
    notes: "",
    reviewers: [],
    files: [],
    comments_count: 0,
    revision_count: 0,
    last_updated: entry.dateIso,
    canva_link: null,
    medium_canva_link: null,
    pubmat_link: null,
    draft_link: null,
    added_to_layout: null,
    graphics_illus: null,
    online_handler: null,
    source_sheet_title: null,
    is_pending_confirmation: false,
    created_at: entry.dateIso,
    updated_at: entry.dateIso
  };
}

async function run() {
  const { count: beforeCount } = await sb
    .from("tasks")
    .select("*", { count: "exact", head: true })
    .in("progress", ["Completed", "Approved"]);
  console.log("Accomplished tasks before:", beforeCount ?? 0);

  for (const entry of ACCOMPLISHED) {
    const { data: existing } = await sb
      .from("tasks")
      .select("id, title, illus_layout, progress")
      .eq("title", entry.title)
      .eq("illus_layout", entry.name);
    if ((existing || []).length > 0) {
      console.log(`Skip (already exists): ${entry.name} - ${entry.title}`);
      continue;
    }
    const { error } = await sb.from("tasks").insert(rowFor(entry));
    if (error) {
      console.error(`Failed to insert ${entry.name} - ${entry.title}:`, error.message);
      continue;
    }
    console.log(`Inserted: ${entry.name} - ${entry.category} - Online - ${entry.title} - ${entry.dateLabel}`);
  }

  const { count: afterCount } = await sb
    .from("tasks")
    .select("*", { count: "exact", head: true })
    .in("progress", ["Completed", "Approved"]);
  console.log("Accomplished tasks after:", afterCount ?? 0);
}

run();
