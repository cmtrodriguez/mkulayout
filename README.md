# MKule News

Task organizer for the MKule **News** section: pitches, artx cards, the editing tiers
(1stSE → 4AE → 4EIC), the handoff to Layout, shortform records, workload and assessments.

It is a sibling of MKuLayout, not a part of it. This code lives on the `MKule-News` branch,
has its own build, and talks to the News section's **own Supabase project** — no table, key
or query path is shared with MKuLayout. The only link between the two is the URL a published
article is handed off to (`VITE_MKULAYOUT_URL`).

## Run

```
npm install
npm run dev      # http://localhost:5173
npm run build    # outputs to dist/
```

`npx tsc --noEmit` is the type check (`npm run lint`).

## Where the data lives

The board is shared: one JSON document in the Supabase table `news_board`, written with a
compare-and-set on its `rev` column. A mutation applies locally at once and is queued; if
the cloud rejects it because someone else moved the board first, the desk re-reads their
document, replays the queued edits on top of it, and writes again. Realtime updates from
other members arrive without a reload.

`localStorage["mkule-news:state:v1"]` stays as the offline cache, and it is the only storage
in use when the env vars are absent — a clone with no backend behaves exactly as it did
before, in one browser.

Assessments are the exception: they live in `news_assessments`, one row per sheet, and are
deliberately never part of the shared document. Row-level security hands a sheet only to the
person who filled it in and the person it is about.

## Supabase setup

1. **Dashboard → Authentication → Providers → Google**: enable it and paste a Google OAuth
   client ID and secret (create them in Google Cloud Console, type *Web application*).
2. **Dashboard → Authentication → URL Configuration**: set *Site URL* to where the desk is
   served (`http://localhost:5173` while developing) and add the same value to *Redirect
   URLs*.
3. **Dashboard → SQL Editor**: run [`supabase/schema.sql`](supabase/schema.sql). It creates
   `news_board` and `news_assessments`, turns on row-level security for both, adds the
   realtime publication and reloads the API cache. The migration is the top block; the
   checks below the `STOP` line only report, and they belong in a **separate** query,
   because the editor submits one paste as a single transaction and a bad statement would
   roll the migration back.
4. Copy `.env.example` to `.env.local` and fill in the project URL and the **publishable**
   key. A secret/service key never belongs in that file: every `VITE_` variable is compiled
   into the public bundle, and only RLS protects the rows.

### Sign-in

There is no password path. The desk shows **Continue with Google**, Supabase issues the
session, and every read and write this tab makes afterwards carries its access token — which
is what the policies in `schema.sql` judge.

A Google address only opens a desk if it matches a roster entry, and the roster lives inside
the shared board itself. That is a chicken-and-egg problem only once: while no roster address
is confirmed, the first member to sign in takes the Editor-In-Chief seat and maps everybody
else under **Settings → Section roster**. The seeded addresses are patterns, not people:

| Name | Role | Placeholder email |
| --- | --- | --- |
| Axel Cainglet | Editor-In-Chief | `axel.cainglet@up.edu.ph` |
| Armel Castillo | News Editor | `armel.castillo@up.edu.ph` |
| Rachelle Montes | Associate Editor | `rachelle.montes@up.edu.ph` |
| Anicka Ponce | News Probi | `anicka.ponce@up.edu.ph` |
| Jomig Dave | News Staffer | `jomig.dave@up.edu.ph` |

With no Supabase env configured **and** a localhost origin, the login screen falls back to
that roster list so the desks can still be exercised. A configured or deployed build never
gets that path.

### Deploy

Point a **separate** Vercel project at this repo with Root Directory `mkule-news` and
Production Branch `MKule-News`. MKuLayout keeps its own project on `main`; both settings are
per-project, so neither build sees the other. Give that project the same `VITE_SUPABASE_*`
variables, and add its public origin to Supabase's Site URL and Redirect URLs.

## Shortform → Google Sheets

`VITE_SHORTFORM_APPS_SCRIPT_URL` points at an Apps Script Web App. Each synced entry posts:

```json
{ "row": ["<writer>", "<date>", "<topic>", "<facebook link>"] }
```

as `text/plain` (a simple request, so no CORS preflight). Paste this into the script, swap
in the sheet name, deploy as **Web app / Execute as me / Access: Anyone**:

```javascript
function doPost(e) {
  var row = JSON.parse(e.postData.contents).row;
  SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Shortform')
    .appendRow(row);
  return ContentService.createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}
```

Entries are recorded locally the moment they are added and marked `pending`. The Sync button
stays disabled until a URL is configured, and a row only flips to `synced` when the script
accepts it — a failed sync leaves it pending rather than claiming success.

## Desks

| Desk | Who sees it |
| --- | --- |
| Desk home — quick links, calendar, timeline, to-dos | everyone |
| My articles — cards waiting on the viewer | everyone |
| Pipeline — oversight by tier | leads |
| Pitch bank — open, grabbed and settled pitches | everyone |
| Shortform input | News Editor |
| Releases, Archive | everyone |
| Section team — directory, availability, workload | everyone |
| Assessment — monthly by the Editor, semestral of the Editor | everyone, privately |
| Settings — roster, Layout contacts, template links | leads |

An article moves `outline → drafting → 1stSE…4thSE → 4AE → 4EIC → 4LO → published`. A
same-day piece gets two editing tiers instead of four. News-feat round 1 goes to Rachelle
Montes rather than Armel Castillo. Publishing closes the card, records it in Releases and
settles its pitch out of the bank.
