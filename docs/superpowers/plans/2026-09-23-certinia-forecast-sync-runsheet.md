# Certinia Forecast Sync — Phase A runsheet

Use this after the Apps Script is in a Google Spreadsheet. You do **not** pre-build tabs or type dummy rows by hand. A **blank spreadsheet** plus a calendar you can write is enough.

**You need before starting**

- Google account that can open Google Sheets and Google Calendar (`mikemwp@gmail.com` is the default From/To).
- A **new empty Google Spreadsheet** (File → New → Spreadsheet). Do not add tabs yourself.
- Write access to one calendar (usually your primary).
- Apps Script project **bound to that spreadsheet** (paste `apps-script/src` files, or `clasp push` later). Jest (`npm test`) on the laptop only proves unit tests; it does **not** show tabs, inspector JSON, or calendar events.

**You do not need**

- Smartsheet login or sheet IDs
- Certinia / Salesforce sandbox
- Pre-filled Resource emails, companies, or milestones (the dummy-data import creates them)

**Related docs:** spec `docs/superpowers/specs/2026-09-14-certinia-forecast-sync-design.md` · plan `docs/superpowers/plans/2026-09-23-certinia-forecast-sync.md`

---

## 0. Bind the script (once)

Do **not** use **Deploy → New deployment** as a web app, library, or API executable. Custom menus come from `onOpen` on a **container-bound** script.

The **Calendar**, **Certinia**, and **Test** menus appear in the **spreadsheet menu bar** (next to Help), not under Extensions.

### 0.1 Create the sheet

- [ ] Create an empty Google Spreadsheet (File → New → Spreadsheet). Name it e.g. `Certinia forecast harness`. Do not add tabs yourself.

### 0.2 Open the bound Apps Script (not a standalone project)

- [ ] From **that spreadsheet**, choose **Extensions → Apps Script**. This creates a project bound to the sheet.
- [ ] Confirm it is bound: Apps Script gear → **Project Settings**. You should see this spreadsheet as the **container**. If you created the project at [script.google.com](https://script.google.com) instead, it is standalone: copy the files into a new project opened from the sheet (this subsection), or use the Editor add-on test in §0.6.

### 0.3 Name files correctly when pasting

Copy every file from `apps-script/src/` into the bound project. In the Apps Script editor:

- For each `.js` module, add a **Script** file named **without** `.js`. Example: create `Bootstrap` → the editor saves `**Bootstrap.gs`**. Do **not** name it `Bootstrap.js` (that becomes `Bootstrap.js.gs`).
- Same for `Menu`, `Config`, `GasAdapters`, `SheetIO`, and the rest of `apps-script/src/*.js`.
- Add an **HTML** file named `InspectorSidebar` (becomes `InspectorSidebar.html`). The code looks up `'InspectorSidebar'`.
- Do **not** paste `tests/` or `package.json`.

### 0.4 Manifest (`appsscript.json`)

- [ ] Project Settings → check **Show "appsscript.json" manifest file**.
- [ ] Paste `apps-script/appsscript.json`. `enabledAdvancedServices` must be **inside** `dependencies`, not at the top level. A top-level `enabledAdvancedServices` field produces: `Invalid manifest: unknown fields: [enabledAdvancedServices]`.
- [ ] **Services → Add → Calendar API**, identifier `Calendar` (needed for `Calendar.Events`).
- [ ] Save.

### 0.5 Reload and authorize

- [ ] Close the script tab. **Refresh the browser** on the spreadsheet. Menus often appear only after a full reload.
- [ ] Confirm top menus: **Calendar**, **Certinia**, **Test**.
- [ ] There is no separate “grant Sheets + Calendar” button. Google asks on the **first menu run**. Click **Test → Import dummy data** (any menu item that runs a function also works). Then:
  1. **Authorization required** → **OK** / **Review permissions**.
  2. Choose your Google account.
  3. If **Google hasn’t verified this app** appears: **Advanced** → **Go to project name (unsafe)**.
  4. Allow Sheets and Calendar access.

After Allow, Import dummy data should create the tabs. Later clicks should not prompt again unless scopes change.

### 0.6 Optional: keep a standalone project (Editor add-on test only)

Only if you already built the script at script.google.com and do not want to recopy files:

- [ ] In that project: **Deploy → Test deployments**.
- [ ] Enable type **Editor add-on** (not Web app).
- [ ] Create a test, pick **this spreadsheet**, install **and** enable, then **Execute**.
- [ ] Reload the sheet and use the top **Calendar / Certinia / Test** menus.

---

## 1. Import dummy data (Sheets only)

- [ ] **Test → Import dummy data**

This must create every tab below if missing, and fill fixture rows. It must **not** create Google Calendar events.


| Tab                     | Dummy content                                                                                       |
| ----------------------- | --------------------------------------------------------------------------------------------------- |
| Resource emails         | `mikemwp@gmail.com` | Mike | `R_MIKE`                                                               |
| Canonical companies     | `Acme Ltd`                                                                                          |
| Canonical milestones    | Kickoff, Discovery, Build, UAT, Go-Live                                                             |
| Milestone resource type | those five milestones → default types (e.g. Consultant)                                             |
| Staffing board          | headers only                                                                                        |
| Error Log               | headers only                                                                                        |
| Dry-run results         | headers only                                                                                        |
| TimecardEventMap        | headers only                                                                                        |
| Harness_ProjectIndex    | `P-DEMO` | `CS_P-DEMO` | `ss_demo`                                                                  |
| CS_P-DEMO               | consultation headers only (no meeting rows yet)                                                     |
| Harness_Projects        | `P-DEMO`, Acme Ltd, purchased hours (e.g. 40)                                                       |
| Harness_Milestones      | P-DEMO rows for Kickoff, Discovery, Build, UAT, Go-Live with hours that sum to purchased            |
| Harness_CalendarSeed    | **10** future rows; From and To `mikemwp@gmail.com`; project `P-DEMO`; pipe-ready company/milestone |
| Harness_Forecast        | banner + planner headers only                                                                       |
| API_Inspector           | headers only                                                                                        |


- [ ] Open **Resource emails** and **Harness_CalendarSeed**. If you will use a different mailbox, change **From** / **To** / Email now.
- [ ] **Test → TEST_MODE** shows `true` (or set Script Property `TEST_MODE` = `true`).

---

## 2. Point at your calendar

- [ ] Google Calendar → Settings → your calendar → **Integrate calendar** → copy **Calendar ID** (for the primary calendar this is often `mikemwp@gmail.com`).
- [ ] Apps Script → Project Settings → Script properties:
  - `TEST_MODE` = `true`
  - `CALENDAR_IDS` = that calendar ID
- [ ] **Test → Import seed calendar events**
- [ ] Open Google Calendar: **10** timed future meetings, titles like `Acme Kickoff`, description like `Acme Ltd|Kickoff workshop|Kickoff|P-DEMO`.
- [ ] Run import again: toast/log says skipped 10, **no duplicates**.

---

## 3. Dry-run Calendar GET

- [ ] **Calendar → Get consultations (dry-run)**
- [ ] `CS_P-DEMO` still has **no** meeting rows (headers only).
- [ ] `Harness_Forecast` still has **no** hour grid (banner/headers only).
- [ ] **API_Inspector** (and Test → Open API Inspector) has rows with `Dry-run` true: Smartsheet row JSON and Salesforce assignment JSON.
- [ ] **Error Log** has no unexpected skips (pipe/company/milestone/project should match dummy data).

---

## 4. Live harness GET (still no Smartsheet/Certinia)

- [ ] **Calendar → Get consultations**
- [ ] `CS_P-DEMO` has **10** rows: Consultation Name, Description (pipe), dates, Resource `Mike` (or your edited To names), Duration, hidden Event ID.
- [ ] **Harness_Forecast** looks like Project Planner (PM): banner In Progress / Weeks; project row `P-DEMO` / `(all)`; resource row `Mike`; hours under **week beginning** columns; two **Build** meetings in the same week **sum**.
- [ ] API Inspector: Smartsheet `/2.0/sheets/.../rows` and Salesforce `pse__Assignment__c` (or schedule) bodies. No UrlFetch to smartsheet.com or salesforce.com (Executions log).
- [ ] Run GET again: still 10 consultation rows (no duplicate Event IDs). Forecast totals unchanged.

---

## 5. Import project + Draft resource requests (harness)

- [ ] **Certinia → Import project** → enter `P-DEMO`
- [ ] **Staffing board** has one row per dummy milestone, default resource type, request hours = milestone hours.
- [ ] Tick **Confirmed** on one or more rows.
- [ ] **Certinia → Create resource requests (dry-run)** → Inspector shows Draft RR JSON; staffing **Certinia Resource Request Id** still empty.
- [ ] **Certinia → Create resource requests** → fake Ids written on staffing board. Run again: same Ids, no extra Inspector creates for new records (updates).

---

## 6. Negative checks (optional but useful)

- [ ] On a seed calendar event, change company in the description to `NotACompany`. GET: that event **Error Log**, no new CS row for it.
- [ ] Dry-run after a successful GET: CS row count and Forecast grid **unchanged**.

---

## 7. Pass / fail

Phase A **passes** if steps 1–5 succeed and step 4 shows Forecast + Inspector without Smartsheet or Salesforce HTTP.

Phase B (later, not this runsheet): `TEST_MODE=false`, real Smartsheet Consultation Schedule, Salesforce sandbox. See spec §15.

---

## Troubleshooting


| Symptom                                     | Check                                                                                                                                                      |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Extensions → AppSheet has no apps           | Wrong product. Use **Extensions → Apps Script**. Menus live in the **sheet menu bar**, not under Extensions.                                               |
| Menus missing                               | Refresh the browser; `onOpen` in `Menu.gs`; Project Settings shows **this** spreadsheet as container. A standalone script.google.com project is not bound. |
| `unknown fields: [enabledAdvancedServices]` | Nest that array under `dependencies` (see `apps-script/appsscript.json`).                                                                                  |
| Files named `Something.js.gs`               | Recreate as Script file `Something` (no `.js`).                                                                                                            |
| No “grant permissions” screen               | Click a real menu item (e.g. **Test → Import dummy data**). Authorization is not a separate control.                                                       |
| Unverified-app warning                      | **Advanced** → go to the project → **Allow**. Expected for a personal script.                                                                              |
| Authorization error                         | Run any menu once; grant Calendar + Sheets; Calendar advanced service enabled.                                                                             |
| Import calendar: 0 created, 0 skipped       | Insert failures used to be swallowed. Re-copy `CalendarSeed.gs` and `GasAdapters.gs`, then run again. The toast should say **failed N: \<reason\>**, and **Error Log** should have `CalendarSeed` rows. Common causes: **Harness_CalendarSeed** has no titled rows (run **Test → Import dummy data**); Calendar API not in **Services**; script cannot write that calendar (`CalendarApp.getCalendarById` returns null). `CALENDAR_IDS` can be correct and inserts still fail if the advanced Calendar service is missing — the updated import falls back to CalendarApp. |
| GET finds 0 events                          | Seed import actually created events; descriptions still four pipe segments; `P-DEMO` on Harness_ProjectIndex; fetch window includes those dates            |
| Resource column empty                       | To address is on **Resource emails** (default `mikemwp@gmail.com`)                                                                                         |
| Forecast empty                              | You ran live GET not dry-run; events are still in the **future**                                                                                           |
| Duplicate calendar events                   | Seed **Google Event ID** column should skip; delete extras in Calendar by hand if you created them outside the import                                      |


