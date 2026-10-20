import dotenv from "dotenv";
dotenv.config();
import { createClient } from "@supabase/supabase-js";

// READ-ONLY diagnostic: lists task_comments whose task_id no longer matches any
// row in tasks (orphaned chats), and shows which completed/archive tasks exist
// so we can tell whether past chats can be re-keyed or were cascade-deleted.
// Usage: npx tsx scripts/diagnose_orphan_comments.ts

const sbUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!sbUrl || !sbKey) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in environment.");
  process.exit(1);
}

const sb = createClient(sbUrl, sbKey);

async function main() {
  const [{ data: tasks, error: e1 }, { data: comments, error: e2 }] = await Promise.all([
    sb.from("tasks").select("id,title,type_of_release,progress,release_date,illus_layout,created_at"),
    sb.from("task_comments").select("id,task_id,timestamp,author_name"),
  ]);
  if (e1) { console.error("tasks error:", e1.message); process.exit(1); }
  if (e2) { console.error("comments error:", e2.message); process.exit(1); }

  const taskIds = new Set((tasks || []).map((t: any) => t.id));
  const orphans = (comments || []).filter((c: any) => !taskIds.has(c.task_id));
  const orphanByTask = new Map<string, any[]>();
  orphans.forEach((c: any) => {
    const list = orphanByTask.get(c.task_id) || [];
    list.push(c);
    orphanByTask.set(c.task_id, list);
  });

  console.log(`tasks: ${tasks?.length ?? 0}`);
  console.log(`task_comments: ${comments?.length ?? 0}`);
  console.log(`orphaned comments: ${orphans.length} across ${orphanByTask.size} dead task ids`);
  console.log("\n-- orphan groups (dead task_id -> count, first/last ts) --");
  [...orphanByTask.entries()].forEach(([tid, list]) => {
    const ts = list.map((c: any) => c.timestamp).sort();
    console.log(`${tid}  n=${list.length}  ${ts[0]} .. ${ts[ts.length - 1]}`);
  });

  const completed = (tasks || []).filter((t: any) => t.progress === "Completed" || t.progress === "Archived");
  console.log(`\n-- completed/archived tasks (${completed.length}) --`);
  completed.forEach((t: any) => console.log(`${t.id}  [${t.type_of_release}]  ${t.progress}  "${t.title}"  ${t.release_date || ""}  ${t.illus_layout || ""}`));

  const liveWithComments = new Set((comments || []).map((c: any) => c.task_id).filter((id: string) => taskIds.has(id)));
  console.log(`\nlive tasks that still have comments: ${liveWithComments.size}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
