# Certinia Forecast Sync — Design Spec

**Date:** 2026-09-14  
**Revised:** 2026-09-23 (test harness: no live Smartsheet/Certinia required)  
**Status:** Draft for review (no implementation yet)  
**Runtime (v1):** Google Apps Script  
**Fallback (specified, not built):** Python FastAPI if Apps Script cannot complete UrlFetch or stay within run limits

This spec is the source of truth for a later implementation plan. It does not include production code.

---

## 1. Purpose

Project managers today copy meeting and contract data by hand across **Google Calendar**, **Smartsheet**, and **Certinia (Salesforce PSA)**. The product automates three jobs:

1. **Consultation schedule + planner hours** — Pull meetings from Google Calendar, write them onto each project’s Smartsheet **Consultation Schedule**, and upsert **named-resource scheduled hours** in Certinia so **Project Planner (PM)** / **Project Manager Work Planner** shows duration under the correct week-beginning columns.
2. **PM timesheet (actuals)** — Pre-fill the **organizer’s (From)** unsubmitted weekly timecard: one row per project + milestone, hours in Mon–Fri. Consultants still key their own cards and submit to the PM at week-end. Do not auto-submit or approve.
3. **Staffing resource requests** — When a PM is assigned a project, they import that project from Certinia into a **Google Sheet**, adjust resource types, and create **Draft** Certinia resource requests for team managers.

Success: after a Calendar GET, Consultation Schedule has one row per matching event; the planner shows one line per resource on the project with **future** meeting hours summed in the right weeks; the PM’s open timesheet shows **completed** meeting hours on the correct weekday/milestone. After Import + Create, Draft resource requests exist for the PM-confirmed milestone × resource-type rows, without duplicates.

---

## 2. Non-goals (v1)

- Do **not** read or write Smartsheet **Project Schedule** (milestones live there operationally; this project ignores that page in v1).
- Do **not** write milestone hour splits from Smartsheet into Certinia.
- Do **not** create or update **consultant / named-resource** timecards. Those people key their own cards and submit to the PM for approval.
- Do **not** auto-submit or approve the PM’s timecard; **unsubmitted / saved** only.
- Do **not** parse a person’s name or Certinia Id from `firstname.lastname@…`. Mapping is the Resource emails sheet only.
- Do **not** auto-submit resource requests; Draft only.
- Do **not** implement Gmail auto-import (future state only; see §12).
- Do **not** implement Python FastAPI unless Apps Script is proven insufficient (see §13).
- Do **not** fuzzy-match company or milestone names.
- Do **not** require per-user Google OAuth for extra personal calendars in v1 (optional extra calendar IDs are shared/configured, not “every employee installs the script”).
- Do **not** bi-sync: Calendar and Certinia contracts are sources; Consultation Schedule and the staffing Sheet are working copies; Certinia planner, **PM timesheet**, and requests are outputs. No write-back to Calendar.

---

## 3. Architecture

One **Google Apps Script** project, bound to the **staffing Google Spreadsheet** (menus appear there). It runs as a **Workspace integration user** that can:

- Read configured Google Calendars (`CalendarApp` / Calendar advanced service)
- UrlFetch **Smartsheet** REST API (Consultation Schedule sheets only) — **or** the test harness adapter when `TEST_MODE=true` (§14)
- UrlFetch **Salesforce REST** (Certinia objects) — **or** the test harness adapter when `TEST_MODE=true` (§14)
- Read/write the staffing spreadsheet (`SpreadsheetApp`)

PMs use custom menus. They do not hold API tokens. Tokens live in Script Properties.

**Adapters:** Calendar and Google Sheets are always real. Smartsheet and Certinia are accessed only through thin clients (`SmartsheetClient`, `SalesforceClient`). Live clients use UrlFetch. Harness clients never call those hosts; they write emulator tabs and an API Inspector (§14). All menus and parsing use the same code path either way.

```
Google Calendar (shared + optional configured calendars)
        │  Calendar GET (menu or daily trigger)
        ▼
Parse description: Company | Meeting Title | Milestone | Certinia Project ID
        │  canonical company + milestone; exact Project ID
        ▼
Smartsheet Consultation Schedule (one sheet per project)
        │  one row per event; Event ID key
        ├──────────────────────────────────────────────►
        │  Future (start still ahead):                 │  Completed (end in the past):
        ▼                                              ▼
Certinia Assignment + schedule hours          PM unsubmitted timesheet
(Project Planner week columns)                (From email only; row = project + milestone; Mon–Fri)

Certinia project + milestone hours
        │  PM menu: Import project (paste Project ID)
        ▼
Staffing Google Sheet (default resource type; PM override)
        │  PM menu: Create resource requests (confirmed rows)
        ▼
Certinia Draft resource requests
```

**Isolation:** Calendar GET and Certinia Import/Create are separate entry points. A time trigger runs **only** Calendar GET. Import and Create are never unattended in v1. The daily trigger must **not** run while `TEST_MODE=true` (or it must no-op) so a harness workbook cannot be mistaken for production.

---

## 4. Calendar description contract

Event **body** is pipe-delimited, typed by PMs today:

```
Company Name|Meeting Title|Milestone|Certinia Proj ID
```

| Segment | Rule |
|---|---|
| Company Name | Must match the canonical company list (trim, case-insensitive). Else skip + Error Log. |
| Meeting Title | Informational in the body. **Consultation Name** on the sheet comes from the Calendar **title**, not this segment. |
| Milestone | Must match the canonical milestone list (trim, case-insensitive). Else skip + Error Log. **Written** to the Consultation **Milestone** column and used as the PM timesheet row key. |
| Certinia Proj ID | Must **exactly** match the project-ID field on a Consultation Schedule sheet (after cache lookup). Else skip + Error Log. |

Malformed bodies (wrong number of segments, empty Project ID) skip + Error Log. The extract **never** invents a company, milestone, or project.

---

## 5. Calendar sources and resource matching

**Calendars:** A config list of **shared calendar IDs** (primary). Optional extra calendar IDs (named resources) may be added in config. The integration user must have access to every listed calendar.

**Window:** From **start of the current timesheet week** (default Monday 00:00 in the integration user’s timezone; overridable if the org’s PSA week starts another day) through `now + CALENDAR_HORIZON_DAYS` (default **90**). Single-instance expansion so recurring meetings appear as dated instances. The week start is required so completed Mon–Fri meetings can land on the PM timesheet; Consultation Schedule still receives future events in the horizon.

**Which events qualify:** Description parses successfully **and** Project ID maps to a Consultation Schedule sheet.

**From (organizer) = PM for that meeting.** Google Calendar `organizer.email` (the meeting **From**). Look up that email on the **Resource emails** sheet (trim, case-insensitive) to get **Name** and **Certinia Resource Id**. That Id is whose **timesheet** to update. If From is missing from the sheet, skip the timesheet write and Error Log; still process Consultation Schedule and planner To-resources.

Do **not** derive the PM from `firstname.secondname@domain` (hyphens, middle names, aliases, and shared mailboxes break it). Put every PM on Resource emails, same as consultants.

**Resource (To):** Collect **attendee** emails. Keep an address only if it appears on Resource emails. Customers dropped. Multiple internal matches → one Consultation row, Resource column = comma-separated **Name** values (stable sort by email). Organizer is **not** added to Resource solely for being From; they appear there only if they are also on To and on the sheet (usual for a PM who invites themselves).

**Duration:** End minus start, in hours (decimal, e.g. 90 minutes → `1.5`). All-day events: skip + Error Log (consultations are timed meetings). If several internal resources match To, **each** gets the **full** duration on their Certinia assignment (hours are not split across attendees).

---

## 6. Smartsheet: Consultation Schedule (only Smartsheet write in v1)

Each in-scope project has a Consultation Schedule sheet that starts **blank except header columns**. **Certinia Project ID is sheet-level** (the same project for every meeting row): a configured column, summary field, or named cell read once per sheet for cache discovery — not typed per event on the grid.

**Visible columns**

| Column | First insert | Later GET |
|---|---|---|
| Consultation Name | Calendar **title** | Unchanged unless §6 update rules say otherwise (title-only changes do **not** rewrite) |
| Description | Calendar **body** | Unchanged on later GETs if only body/title changed |
| Start Date | Event start date | Update if date/time changed |
| Start Time | Event start time | Update if date/time changed |
| Milestone | Pipe **Milestone** | Update if the parsed milestone changes |
| Resource | Matched To list | Update if To/resource set changed |
| Duration | Calculated | Update if start **or end** (length) changed |

**Hidden / system columns** (create if missing): `Google Event ID` (unique key), `Status` (empty or `Cancelled`).

**Later GET behaviour**

- Unknown Event ID → **insert** one row.
- Same Event ID, start date/time **and** matched To set **and** parsed milestone unchanged → **do not rewrite Smartsheet cells**. Still run §8 time-based Certinia rules (future → past moves hours from planner onto the PM timesheet).
- Same Event ID, start **or end** changed → update Start Date, Start Time, Duration (and Certinia hours; §8).
- Same Event ID, To/resource set changed → update Resource (and Certinia hours; §8).
- Same Event ID, parsed milestone changed → update Milestone (and move PM timesheet hours to the new milestone row).
- Date/time and To both changed → update all of those fields.
- **Cancelled / deleted on Calendar:** Event still has Start Date ≥ today, was previously synced, and Calendar no longer returns a non-cancelled instance → set `Status = Cancelled`. **Do not delete** the row. Remove that event’s hours from planner **and** from the PM timesheet (§8).
- **Do not** flag Cancelled merely because the event fell **outside the fetch window** (older than this timesheet week, or start date beyond `CALENDAR_HORIZON_DAYS`). Those rows stay as last written.

**Sheet discovery:** Hybrid cache `Certinia Project ID → Smartsheet sheet ID`. Build by scanning a **configured Smartsheet workspace** for the project-ID field on Consultation Schedule sheets. Refresh cache on script start and on cache miss. Unknown Project ID after refresh → skip + Error Log (do not auto-create sheets).

**Out of v1:** Project Schedule and any other Smartsheet pages.

---

## 7. Google Sheets (staffing workbook)

The Apps Script is bound to this spreadsheet.

### 7.1 Tab: Resource emails

| Column | Purpose |
|---|---|
| Email | Match Calendar **To** and **From** (trim, case-insensitive) |
| Name | Display value for Consultation Resource column |
| Certinia Resource Id | Salesforce Contact/Resource Id for **planner assignments** (To) and **PM timesheet** (From) |

Every PM who sends consultation invites must have a row (same list as consultants). Missing Certinia Resource Id when an assignment or timesheet write is required → skip that write + Error Log. The Consultation row may still list a To name if the email matched.

### 7.2 Tab: Canonical companies

One column of allowed company names.

### 7.3 Tab: Canonical milestones

One column of allowed milestone names (the fixed set used in Calendar bodies and on contracts).

### 7.4 Tab: Milestone → resource type lookup

| Milestone | Default Resource Type |
|---|---|
| (canonical name) | Default role for staffing rows |

### 7.5 Tab: Staffing board

Filled by **Import project**, edited by the PM.

| Column | Source |
|---|---|
| Project ID | Import / Certinia |
| Company Name | Import / Certinia |
| Total purchased hours | Import / Certinia |
| Milestone | Import / Certinia |
| Milestone hours | Import / Certinia |
| Resource type | Default from lookup; **PM may override** |
| Request hours | Default = milestone hours; PM may split/edit |
| Confirmed | Checkbox; Create only processes checked rows |
| Certinia Resource Request Id | Written after successful create (idempotency) |

**Key:** Project ID + Milestone + Resource type.

### 7.6 Tab: Error Log

Append-only: timestamp, job (`CalendarGET` / `Import` / `CreateRR`), Event ID or Project ID, reason, raw snippet.

### 7.7 Tab: Dry-run results

Overwritten each dry-run: proposed inserts/updates/flags/creates and whether they would be skipped.

### 7.8 Tab: TimecardEventMap

Append/update used by Calendar GET: Event ID, Certinia Resource Id (From), week-start, Project ID, Milestone, weekday, hours. Source of truth for idempotent PM timesheet deltas.

### 7.9 Harness tabs (only used when `TEST_MODE=true`; see §14)

| Tab | Role |
|---|---|
| `Harness_ProjectIndex` | Project ID → emulator Consultation tab name, fake Smartsheet sheet ID, sheet-level Project ID field |
| `CS_<ProjectId>` | Emulates that project’s Consultation Schedule (same columns as §6, including hidden Event ID and Status) |
| `Harness_Projects` | Fixture rows for Import: Project ID, company, purchased hours, fake Salesforce Project Id |
| `Harness_Milestones` | Fixture rows: Project ID, milestone name, milestone hours |
| `Harness_CalendarSeed` | 10 future meetings to create on Google Calendar. Edit **From** / **To** then run **Test → Import seed calendar events**. Default both addresses: `mikemwp@gmail.com`. |
| `Harness_Forecast` | **Certinia forecasting preview** (not live Certinia). Mimics Project Planner (PM): In Progress, project then resources (expanded chevron), hours under **week beginning** columns. Refreshed by Calendar GET from the same assignment-hour model. |
| `API_Inspector` | One row per captured outbound call (and fake response) |

---

## 8. Certinia writes

Certinia is Salesforce. Use REST (composite/collections where possible, batches small enough to avoid CPU timeouts; prefer chunks of **50** for assignment/schedule DML because PSA roll-ups are heavy). Test against **sandbox** first (`https://test.salesforce.com`, Script Property `SF_LOGIN_DOMAIN=test`).

### 8.1 Planner hours (from Consultation Schedule)

**Observable target:** **Project Planner (PM)** and/or **Project Manager Work Planner**, default filter **in progress**, grouping by project then resource (chevron), hours under **week beginning** columns.

In `TEST_MODE`, that layout is **also rendered** on the `Harness_Forecast` tab so you can see the week grid before Salesforce exists. Live Certinia remains the planner UI once `TEST_MODE=false`. Live planner UIs read **assignments** and **schedules**, not calendar events.

### 8.1.1 `Harness_Forecast` tab layout (TEST_MODE)

Row 1 (banner, merged): `Certinia forecasting preview — Project Planner (PM) — Filter: In Progress — Zoom: Weeks — not live Salesforce`

Row 2 (headers):

| ▾ Project ID | Customer | Resource | Total hrs | {Mon week-begin} | {next Mon} | … |

- Week columns start at the current timesheet week (`TIMESHEET_WEEK_START`) and continue through the last week that has **future** assignment hours (cap **16** week columns). Format `d MMM yyyy` (e.g. `28 Sep 2026`).
- **Project rollup row** (collapsed chevron): Project ID, Customer, Resource blank or `(all)`, Total hrs = sum of resources, week cells = sums. Sort projects by Project ID.
- **Resource rows** immediately under that project (expanded chevron): same Project ID and Customer, Resource = name from Resource emails, hours for that person only. Blank week cells stay empty (not `0`).
- Hours are **future** meeting durations only, **summed** if several meetings fall in the same week (same as Certinia). Completed/cancelled events do not appear.
- Calendar GET (not dry-run) **rebuilds** this tab from the assignment-hour model. Dry-run does not change `Harness_Forecast`.

**Rules**

- **One assignment per (Certinia Project Id, Certinia Resource Id).** Do not create one assignment per meeting.
- **Future events only** (meeting **end** still in the future): each matched **To** resource gets the **full** duration on their assignment on the meeting date (hours are not split).
- Multiple future events for the same person/project in the same week **sum** in that week column.
- Date/time change while still future: remove that Event ID’s hours from the old date; apply to the new date.
- To/resource change: remove hours from the old resource’s assignment; add to the new resource’s assignment (create assignment if needed). If Resource becomes empty (no internal attendees), remove that Event ID’s hours from any previous resource.
- When an event **completes** (end is in the past): **remove that Event ID’s hours from all assignments** (so actuals are not also forecast). PM hours go to the timesheet (§8.2); consultants get nothing auto-written (they key their own cards).
- Cancelled: remove that Event ID’s hours from assignments. Leave the assignment if other events still have hours.
- Idempotency: persist Google Event ID on a custom field on the schedule exception / hour slice, or a small mapping object. Implementation must confirm in the org whether hours are applied via `pse__Schedule__c`, schedule exceptions, or assignment daily-hour APIs. **Acceptance is the Planner week column**, not a specific internal field name.

**Implementation check (before coding against prod):** In sandbox, create one assignment and set hours on a single date; confirm they appear in Project Planner (PM) / Work Planner for that week. Document the exact objects/fields in the implementation plan. Do not guess a second write path.

### 8.2 PM timesheet (from Calendar From)

**Observable target:** The PM’s weekly time entry grid: first column project (ID + customer), then **milestone**, then **Mon–Fri** hour cells. One row per project + milestone.

**Who:** Calendar **From** (organizer) resolved via Resource emails → Certinia Resource Id. **Never** write another resource’s timecard.

**When:** Meeting **end** is in the past (completed), Status is not Cancelled, From mapped, milestone canonical. Skip future meetings (those stay on Planner). Skip all-day.

**Rules**

- Open or create the organizer’s **unsubmitted** timecard for the week that contains the meeting date. Do not submit, recall, or approve.
- Upsert the line for **Project + Milestone**. Add this Event ID’s duration into the correct weekday cell. Several completed meetings the same day on the same project+milestone **sum**.
- Idempotency: store Event ID → hours/day (custom field, notes, or a mapping sheet tab `TimecardEventMap`). Rerun replaces that Event ID’s contribution; it does not add a second copy.
- Date change: subtract from the old weekday (and old week if needed); add to the new.
- Milestone change: subtract from the old row; add to the new.
- From/organizer change: subtract from the old PM’s card; add to the new PM’s card if the new From is on Resource emails.
- Cancelled or From not on Resource emails: remove that Event ID’s hours from any PM card we previously wrote.
- Do not overwrite the PM’s own typed hours. Keep a **TimecardEventMap** tab (Event ID, Resource Id, Week, Project, Milestone, Weekday, Hours). Each GET applies **deltas** from that map only. If the weekly card is **submitted**, skip that week + Error Log (PM must recall to allow a calendar correction).

**Implementation check:** In sandbox, confirm object names (`pse__Timecard_Header__c` / splits or org equivalent) and that an unsubmitted line with Monday hours appears on the PM time-entry UI.

### 8.3 Draft resource requests (from staffing board)

- Object: Certinia **Resource Request** (`pse__Resource_Request__c` or org-confirmed API name).
- Status: **Draft** (do not submit/hold).
- Fields (minimum): Project, Milestone (if the org links RR to milestone), Resource Role/Type, hours, start/end if required by validation.
- Create/update only **Confirmed** rows.
- Hours: request hours ≤ that row’s milestone hours; **sum of request hours for the same Project + Milestone** ≤ that milestone’s hours; sum of milestone hours on the import ≤ total purchased hours. Default request hours = milestone hours (one row per milestone). If the PM adds a second resource type for the same milestone, they must split hours so the sum still fits. Violate → block Create for that project + Error Log.
- Rerun with existing Certinia Resource Request Id → **update**, do not insert a second request.

### 8.4 What we do not write in v1

- `pse__Milestone__c` create/update from Smartsheet
- Consultant / named-resource timecards (`pse__Timecard_Header__c` for anyone except Calendar **From**)
- Submitted or approved timecards
- Smartsheet Project Schedule
- Auto-held or named resource on milestone RRs (staffing RRs are **role-based** until team managers staff them)

---

## 9. PM operations

| Menu | Behaviour |
|---|---|
| Calendar → Get consultations | Fetch, parse, upsert Consultation Schedule, upsert planner hours for **future** events, upsert **PM unsubmitted** timesheet hours for **completed** events |
| Calendar → Get consultations (dry-run) | Same reads; **no** Smartsheet or Salesforce writes (and no harness emulator writes); fill Dry-run results **and** API Inspector as `dry-run` |
| Certinia → Import project | Prompt for **Certinia Project ID**; GET project, company, purchased hours, milestones, milestone hours; upsert staffing rows; apply default resource types |
| Certinia → Create resource requests | Draft RRs for Confirmed rows that pass hour rules |
| Certinia → Create resource requests (dry-run) | List would-be creates/updates; no Salesforce writes |
| Test → Open API Inspector | Sidebar showing the last run’s captured Smartsheet and Certinia calls (§14) |
| Test → TEST_MODE | Show current mode; turning live mode on requires Smartsheet and Salesforce properties to be set |
| Test → Import dummy data | Create missing tabs and **all dummy fixture rows**. Does not create Google Calendar events. Safe to re-run (idempotent). |
| Test → Import seed calendar events | Create (or skip existing) 10 timed events on `CALENDAR_IDS` from `Harness_CalendarSeed` |

**Scheduled:** Time-driven trigger (default **daily**) = Get consultations (live, not dry-run). Not Import, not Create.

**Import identity (v1):** PM **pastes Project ID**. No Gmail. No “my projects” picker.

---

## 10. Errors and limits

- Never guess canonical values or Project IDs.
- Partial success is allowed: one bad event does not abort the whole GET; log and continue.
- Apps Script: **6 minutes per execution**. Calendar GET must process calendars in order and stop cleanly if remaining time is under a 45-second safety margin, recording a cursor (last calendar ID + page token) in Script Properties for the next run. Import of a single project must complete in one run.
- UrlFetch: Smartsheet and Salesforce only when `TEST_MODE=false`; handle 429 with backoff. Smartsheet ~300 requests/minute. Salesforce composite chunk size 50 for PSA DML. When `TEST_MODE=true`, those hosts are never called.
- Row locks: sequential updates per project when writing assignments/schedules.

---

## 11. Security

- One integration user; Script Properties for Smartsheet token and Salesforce refresh token / connected-app credentials. No tokens in source. **Not required** while `TEST_MODE=true`.
- Salesforce Connected App with minimum scopes; sandbox first.
- PMs need access to the staffing spreadsheet and (as today) their Smartsheet project. They do not need Script editor access.
- UrlFetch (`script.external_request`) to `api.smartsheet.com` and the org’s Salesforce host must be allowed by Workspace policy. If it is not, stop and use the FastAPI fallback (§13) rather than storing tokens on laptops.

---

## 12. Future state: Gmail

**Not v1.** Note only:

There is no Apps Script “on email arrived” trigger. A later phase may poll Gmail (filter/label, every 5–10 minutes) for Certinia “new project” mail, parse Project ID and company, and call the same Import function. Prefer a **shared mailbox or Google Group** so one integration user holds Gmail scope. True push (Gmail `users.watch` + Pub/Sub) is out of scope unless the FastAPI fallback is already in play. Manual Import remains the fallback if mail format drifts.

---

## 13. Fallback: Python FastAPI

**Specified, not implemented in v1.** If Apps Script cannot UrlFetch Smartsheet/Salesforce, cannot finish Calendar GET within limits, or IT rejects script-stored tokens, implement the **same behaviour** as this spec as:

- Python services: Calendar fetch, parser, Smartsheet upsert, Salesforce assignment/schedule, **PM timecard**, and RR writes
- Thin FastAPI: `POST /sync`, `POST /sync?dry_run=true`, last-run errors
- Scheduler calling the same code path as `/sync`

Do not dual-run Apps Script and FastAPI for the same calendars.

---

## 14. Test harness (no live Smartsheet or Certinia)

**Why:** Calendar and Google Sheets are available from day one. Smartsheet workspaces and Certinia sandbox projects may not exist yet. The **full Apps Script workflow** (menus, parser, canonical lists, Resource emails, Consultation upsert rules, planner/timecard/RR payload builders) must still run.

**Default:** `TEST_MODE=true` until tokens and test projects exist. In this mode the script **must not** UrlFetch `api.smartsheet.com` or any Salesforce host.

### 14.1 What is real vs fake

| System | TEST_MODE |
|---|---|
| Google Calendar | **Real** fetch (`CalendarApp` / Calendar API) |
| Staffing workbook (canonical lists, Resource emails, staffing board, Error Log, TimecardEventMap) | **Real** |
| Smartsheet Consultation Schedule | **Emulated** as `CS_<ProjectId>` tabs; same columns and GET rules as §6 |
| Smartsheet workspace scan | **Emulated** via `Harness_ProjectIndex` |
| Certinia / Salesforce (assignments, schedules, timecards, resource requests, Import GET) | **Not called.** Payloads are built exactly as live would send, logged, fake Ids returned |

### 14.2 API Inspector (test UI)

**Sheet tab `API_Inspector`** (durable log) plus **Apps Script HTML sidebar** (Test → Open API Inspector).

Each captured call is one inspector row / sidebar card:

| Field | Content |
|---|---|
| Timestamp | Run time |
| Job | `CalendarGET` / `Import` / `CreateRR` |
| Dry-run | true/false |
| System | `Smartsheet` or `Salesforce` |
| Operation | e.g. `sheets.get`, `rows.add`, `rows.update`, `sobjects/pse__Assignment__c PATCH`, `composite/sobjects`, `query` |
| Method | GET/POST/PATCH/DELETE |
| Path | Live URL path that **would** be called (e.g. `/2.0/sheets/{id}/rows`, `/services/data/v60.0/sobjects/pse__Assignment__c`) |
| Request JSON | Pretty-printed body (row cells, composite records, SOQL). This is the format to review before going live |
| Fake response JSON | `{ "success": true, "id": "harness_…" }` in the same shape the live client expects, so upsert maps and staffing RR Ids still work |
| Notes | e.g. emulator tab name, Event ID |

The sidebar lists the **current run** (filter Smartsheet / Salesforce), expands JSON, and links “open `API_Inspector` tab”. Closing the sidebar does not lose data.

Dry-run in TEST_MODE: **no** writes to `CS_*` emulator tabs and **no** TimecardEventMap / fake Id updates; inspector rows are still written with `Dry-run=true`.

### 14.3 Emulator behaviour

- **Calendar seed:** Tab `Harness_CalendarSeed` holds **10 future** timed meetings. Description is `Company|Meeting Title|Milestone|Certinia Proj ID` so Calendar GET can complete. Default **From** and **To** are `mikemwp@gmail.com` (edit the tab, then re-run import). Import writes events onto the first calendar in `CALENDAR_IDS`, sets organizer/attendee from those columns, and stores Google Event ID on the seed row so a second import does not duplicate. Requires calendar **write** scope. Does not call Smartsheet or Salesforce.
- **Consultation GET:** Resolve Project ID through `Harness_ProjectIndex`. If missing → Error Log (same as unknown Smartsheet). Upsert rows on `CS_<ProjectId>` using §6 rules (Event ID, date/To updates, Cancelled flag). Those tabs start blank except headers, like a real Consultation Schedule.
- **Forecast preview:** After a live (non-dry-run) Calendar GET, rebuild `Harness_Forecast` from assignment hours (§8.1.1).
- **Import:** Read `Harness_Projects` + `Harness_Milestones` for the pasted Project ID. Inspector logs the SOQL/`query` that **would** have run. Staffing board fills as in live.
- **Create RR / planner / timesheet:** Build the same REST bodies as live; log them; return fake Ids; update TimecardEventMap and staffing RR Id columns as if Salesforce had responded. Optional **read-model** tabs (`Harness_Assignments`, `Harness_Timecards`) may store the post-upsert state so a second GET can demonstrate idempotency without Salesforce.

### 14.4 Switching to live APIs

When a Smartsheet test sheet and Certinia sandbox exist: set tokens in Script Properties, set `TEST_MODE=false`, map `Harness_ProjectIndex` Project IDs to **real** sheet IDs (or rebuild cache from the workspace). Same menus. Do not leave TEST_MODE on in a workbook that also has production tokens.

### 14.5 Harness must-pass (before any Smartsheet/Certinia access)

1. Test → **Import dummy data**, then Test → Import seed calendar events (From/To `mikemwp@gmail.com` unless edited). Calendar GET finds 10 future pipe-formatted events and inserts 10 rows on `CS_P-DEMO`.
2. `Harness_Forecast` shows `P-DEMO`, resource `Mike` (or edited To names), and hours under the correct week-beginning columns; two Build meetings in the same week **sum**. Project rollup row totals match resource rows.
3. Second GET does not duplicate Event IDs; date/To changes update the emulator row; `Harness_Forecast` week cells move with date changes.
4. Sidebar / `API_Inspector` shows Smartsheet-shaped row payloads **and** Salesforce-shaped assignment, schedule, and (for completed meetings) timecard payloads.
5. From not on Resource emails → timesheet payload absent; Error Log row present.
6. Import from fixture Project ID fills staffing board; Create RR (confirmed) logs RR JSON and writes a fake Id.
7. Dry-run: inspector filled; `CS_*` row count and `Harness_Forecast` unchanged.
8. With `TEST_MODE=true`, no outbound HTTP to Smartsheet or Salesforce (no UrlFetch to those hosts).

---

## 15. Testing and rollout

**Phase A — harness (§14):** Calendar + Google Sheets only. Prove parser, menus, Consultation rules, and payload **shape**. No Smartsheet or Certinia account required.

**Phase B — live sandbox:** Salesforce sandbox, Smartsheet test workspace (one blank Consultation Schedule + known Project ID field), same staffing spreadsheet with `TEST_MODE=false`, test calendars. No production writes until the pilot.

**Must pass (Phase B, in addition to §14.5)**

1. Parser: valid pipe; bad company/milestone/Project ID → Error Log, no write.
2. First GET: empty sheet → one row per matching future event; Resource from email list only; Duration = end − start.
3. Second GET: unchanged events untouched; date/time or To updates those fields; calendar-cancelled future event → Status Cancelled and hours removed in sandbox planner; events that merely age out of the horizon are not cancelled.
4. Planner: one assignment per project+person; two **future** meetings same week **sum**; visible in Project Planner (PM) / Work Planner, in-progress filter. Completed events do **not** remain on the assignment.
5. PM timesheet: From email on Resource emails; completed meeting hours on the correct Mon–Fri cell and milestone row; second GET does not double; consultant From-not-used (To-only people) get no timecard; submitted card is skipped + Error Log; unknown From email → Error Log, no timesheet write.
6. Import + Create: paste ID fills rows; default resource type; override; dry-run; Draft RRs; rerun no duplicate; over-hours blocked.
7. One GET and one Import finish within 6 minutes or resume via cursor as specified.
8. Dry-run performs zero Smartsheet and zero Salesforce writes (asserted by no new Ids / unchanged Updated timestamps on fixtures).

**Rollout:** Harness until payloads look right → `TEST_MODE=false` on sandbox → dry-run on one real project → live GET → PM checks Consultation Schedule, Planner, and unsubmitted timesheet → enable daily trigger. Create resource requests only when the PM is ready.

---

## 16. Configuration (Script Properties / config tab)

| Key | Meaning |
|---|---|
| `TEST_MODE` | `true` (default) = harness; `false` = live UrlFetch |
| `CALENDAR_IDS` | Comma-separated calendar IDs |
| `CALENDAR_HORIZON_DAYS` | Default 90 |
| `SMARTSHEET_TOKEN` | API token (required only when `TEST_MODE=false`) |
| `SMARTSHEET_WORKSPACE_ID` | Workspace to scan for Consultation sheets (live only) |
| `SF_LOGIN_DOMAIN` | `test` or `login` (live only) |
| `SF_CONNECTED_APP_*` | OAuth client + refresh token (live only) |
| `CONSULTATION_PROJECT_ID_COLUMN` | Column title of the Certinia Project ID field on the Consultation sheet |
| `TIMESHEET_WEEK_START` | Default `Monday` |

Canonical lists, resource emails, and harness fixtures live in spreadsheet tabs, not Properties.

---

## 17. Decisions log

| Topic | Decision |
|---|---|
| Forecasting | Both: planner hours from meetings **and** Draft RRs from milestone staffing |
| Calendar join | Pipe body + exact Certinia Project ID |
| Calendars | Shared list + optional extra IDs |
| Smartsheet v1 | Consultation Schedule only |
| Row identity | Google Event ID |
| Updates | Date/time and To/resource; flag cancelled; no silent delete |
| Planner shape | One assignment per project+resource; **future** hours summed by week |
| PM timesheet | Calendar **From** → Resource emails → unsubmitted Mon–Fri / milestone row; consultants self-key |
| Email mapping | Resource emails sheet only; no `firstname.lastname` parse |
| Staffing | Hybrid default resource type; PM override; confirm then Draft RR |
| Import | PM pastes Project ID |
| Runtime | Apps Script first |
| Gmail | Future only |
| FastAPI | Fallback in spec, not built |
| First-run testing | `TEST_MODE` harness: real Calendar + Sheets; Smartsheet/Certinia captured in API Inspector; no UrlFetch to those APIs |
| Calendar seed | 10 future events from `Harness_CalendarSeed`; default From/To `mikemwp@gmail.com`; editable before import |
| Forecast preview | `Harness_Forecast` tab mimics Project Planner (PM) week grid from assignment hours |

---

## 18. Spec self-review

- No TBD in behaviour; org-specific PSA field names for schedule hours and timecard lines are **confirmed in sandbox** with Planner and time-entry UI acceptance (§8.1, §8.2).
- Calendar GET does not write Project Schedule; Import does not write Consultation Schedule; Create does not write assignments or timecards.
- v1 is one Apps Script with two entry points, testable independently. Smartsheet and Salesforce are behind adapters so `TEST_MODE` does not fork business logic.
- “Resource” on Consultation Schedule means **named people from To ∩ email list**. “PM” for timesheets means Calendar **From** ∩ the same list. Resource **type** belongs on the staffing board only.
