# MKule News

Task organizer for the MKule **News** section: pitches, artx cards, the editing tiers
(1stSE → 4AE → 4EIC), the handoff to Layout, shortform records, workload and assessments.

It is a sibling of MKuLayout, not a part of it. This code lives on the `MKule-News` branch,
has its own build, its own storage and no writes to MKuLayout's database. The only link
between the two is the URL a published article is handed off to (`VITE_MKULAYOUT_URL`).

## Run

```
npm install
npm run dev      # http://localhost:5173
npm run build    # outputs to dist/
```

`npx tsc --noEmit` is the type check (`npm run lint`).

## Where the data lives

The whole board is one JSON document in `localStorage` under `mkule-news:state:v1`, with
`mkule-news:session` holding the signed-in email and `mkule-news:tab` the last desk open.
A `storage` listener keeps two open tabs in sync. Nothing leaves the browser, so clearing
site data resets the section — Settings has a "Reset local board" button for the same thing.

## Google Sign-In

1. Google Cloud Console → APIs & Services → Credentials → **Create credentials → OAuth client ID**,
   type **Web application**.
2. Add every origin the site is served from to *Authorized JavaScript origins*:
   `http://localhost:5173` for local runs and the deployed `https://…` origin.
3. Put the client ID in `.env` (copy `.env.example`) as `VITE_GOOGLE_CLIENT_ID`.

A Google account only gets in if its email matches a roster entry. The seeded roster uses
placeholder addresses:

| Name | Role | Placeholder email |
| --- | --- | --- |
| Axel Cainglet | Editor-In-Chief | `axel.cainglet@up.edu.ph` |
| Armel Castillo | News Editor | `armel.castillo@up.edu.ph` |
| Rachelle Montes | Associate Editor | `rachelle.montes@up.edu.ph` |
| Anicka Ponce | News Probi | `anicka.ponce@up.edu.ph` |
| Jomig Dave | News Staffer | `jomig.dave@up.edu.ph` |

Replace each with the member's real Gmail under **Settings → Section roster** (leads only).
An unrecognised address is refused with the email named on screen.

With no client ID configured **and** a localhost origin, the login screen falls back to the
roster list so the desks can be exercised. Deployed origins never get that path.

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
