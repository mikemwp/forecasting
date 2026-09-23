# Certinia Forecast Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a Google Apps Script bound to the staffing spreadsheet that, in `TEST_MODE=true`, fetches real Google Calendar events, upserts Consultation Schedule rows onto emulator sheets, builds Certinia REST payloads, and shows them in an API Inspector — without calling Smartsheet or Salesforce.

**Architecture:** Dual-runtime JavaScript: each logic file works in Apps Script (globals) and in Node (Jest). Calendar GET, Import, and Create RR share `SmartsheetClient` / `SalesforceClient` interfaces. Harness implementations write `CS_*` tabs and `API_Inspector`; live UrlFetch clients are added last and must not run while `TEST_MODE` is true.

**Tech Stack:** Google Apps Script (V8), clasp, Node 20+, Jest, SpreadsheetApp, CalendarApp, HtmlService sidebar. No FastAPI, no Gmail, no Python.

**Runsheet:** `docs/superpowers/plans/2026-09-23-certinia-forecast-sync-runsheet.md` (operator testing). Dummy Sheet data is **Test → Import dummy data**; calendar events are a second import.

## Global Constraints

- Runtime v1 is Google Apps Script; FastAPI is specified-not-built; Gmail is future-only.
- `TEST_MODE=true` by default: never UrlFetch `api.smartsheet.com` or any Salesforce host.
- Daily time trigger must no-op when `TEST_MODE=true`.
- Do not write Smartsheet Project Schedule; Consultation Schedule only (emulator tabs in TEST_MODE).
- Do not create consultant timecards; only Calendar **From** unsubmitted PM timesheet payloads.
- Do not auto-submit/approve timecards or resource requests (Draft / unsubmitted only).
- Do not parse `firstname.lastname@` for identity; Resource emails sheet only.
- Canonical company/milestone: trim, case-insensitive; never invent values.
- Certinia Project ID match is exact.
- One assignment per (project, resource); full duration per matched To attendee; future events only on planner; completed events move PM hours to timesheet.
- Consultation key is Google Event ID; cancelled is flagged, never deleted; do not cancel merely because an event left the fetch window.
- Salesforce DML chunk size 50; Apps Script 6-minute run with 45s safety cursor (implement cursor in Calendar GET).
- Object names default to `pse__Assignment__c`, `pse__Schedule__c`, `pse__Timecard_Header__c`, `pse__Resource_Request__c` and live in `Config.objects` so sandbox field names can change without rewriting orchestrators.
- No tokens in source. Live tokens are Script Properties only, required only when `TEST_MODE=false`.
- Menu copy and tab names must match the spec (§7, §9, §14).
- Operator starts from a **blank** Google Spreadsheet. All dummy tabs/rows come from **Test → Import dummy data**. Do not require hand-built sheets.
- Human Phase A steps live in `docs/superpowers/plans/2026-09-23-certinia-forecast-sync-runsheet.md`.

---

## File structure

```
apps-script/
  appsscript.json
  src/
    Config.js                 TEST_MODE, tab names, object API names, week start
    ParseDescription.js       pipe body → fields or error
    Canonical.js              case-insensitive list match
    Duration.js               hours; reject all-day
    Week.js                   timesheet week start; fetch window
    Resources.js              To filter + From lookup
    ConsultationDiff.js       insert / update / skip / cancel
    Inspector.js              capture outbound call records
    SheetIO.js                read/write named tabs (GAS + test double)
    SmartsheetClient.js       interface + HarnessSmartsheetClient
    SalesforceClient.js       interface + HarnessSalesforceClient (+ payload builders)
    PlannerPreview.js         Harness_Forecast Project Planner (PM) week grid
    CalendarGet.js            orchestrate GET
    ImportProject.js          Import menu
    CreateResourceRequests.js Create RR menu + hour rules
    CalendarSeed.js           10 future events from Harness_CalendarSeed
    Menu.js                   onOpen, prompts, TEST_MODE guard, trigger no-op
    InspectorSidebar.html     Test UI
    Bootstrap.js              tabs + fixtures
  tests/
    ParseDescription.test.js
    Canonical.test.js
    Duration.test.js
    Week.test.js
    Resources.test.js
    ConsultationDiff.test.js
    Inspector.test.js
    SmartsheetHarness.test.js
    SalesforcePayloads.test.js
    PlannerPreview.test.js
    CalendarGet.test.js
    ImportProject.test.js
    CreateResourceRequests.test.js
    CalendarSeed.test.js
    TestModeGuard.test.js
    Bootstrap.test.js
  package.json
  jest.config.js
.gitignore
README.md
```

Pure functions take plain objects. `SheetIO` in tests is an in-memory workbook. GAS wrappers in `Menu.js` call the same orchestrators.

Live UrlFetch implementations (`LiveSmartsheetClient`, `LiveSalesforceClient`) are Task 12 and unused until `TEST_MODE=false`.

---

### Task 1: Dual-runtime scaffold and Jest

**Files:**
- Create: `apps-script/package.json`
- Create: `apps-script/jest.config.js`
- Create: `apps-script/appsscript.json`
- Create: `apps-script/src/Config.js`
- Create: `.gitignore`
- Create: `README.md`
- Test: `apps-script/tests/Config.test.js`

**Interfaces:**
- Consumes: nothing
- Produces: `Config` object; `module.exports` when Node; globals when GAS

- [ ] **Step 1: Write the failing test**

```javascript
// apps-script/tests/Config.test.js
const { Config } = require('../src/Config');

test('TEST_MODE defaults true', () => {
  expect(Config.TEST_MODE_DEFAULT).toBe(true);
});

test('object API names are Certinia PSA defaults', () => {
  expect(Config.objects.assignment).toBe('pse__Assignment__c');
  expect(Config.objects.schedule).toBe('pse__Schedule__c');
  expect(Config.objects.timecard).toBe('pse__Timecard_Header__c');
  expect(Config.objects.resourceRequest).toBe('pse__Resource_Request__c');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps-script && npm test -- tests/Config.test.js`
Expected: FAIL (cannot find module)

- [ ] **Step 3: Write minimal implementation**

`apps-script/package.json`:

```json
{
  "name": "certinia-forecast-sync",
  "private": true,
  "scripts": {
    "test": "jest"
  },
  "devDependencies": {
    "jest": "^29.7.0"
  }
}
```

`apps-script/jest.config.js`:

```javascript
module.exports = { testEnvironment: 'node' };
```

`apps-script/src/Config.js`:

```javascript
var Config = {
  TEST_MODE_DEFAULT: true,
  CALENDAR_HORIZON_DAYS: 90,
  TIMESHEET_WEEK_START: 'Monday',
  SF_API_VERSION: 'v60.0',
  DML_CHUNK: 50,
  SAFETY_MS: 45000,
  tabs: {
    resourceEmails: 'Resource emails',
    companies: 'Canonical companies',
    milestones: 'Canonical milestones',
    lookup: 'Milestone resource type',
    staffing: 'Staffing board',
    errorLog: 'Error Log',
    dryRun: 'Dry-run results',
    timecardMap: 'TimecardEventMap',
    projectIndex: 'Harness_ProjectIndex',
    harnessProjects: 'Harness_Projects',
    harnessMilestones: 'Harness_Milestones',
    calendarSeed: 'Harness_CalendarSeed',
    forecast: 'Harness_Forecast',
    apiInspector: 'API_Inspector'
  },
  consultationHeaders: [
    'Consultation Name',
    'Description',
    'Start Date',
    'Start Time',
    'Milestone',
    'Resource',
    'Duration',
    'Google Event ID',
    'Status'
  ],
  objects: {
    assignment: 'pse__Assignment__c',
    schedule: 'pse__Schedule__c',
    timecard: 'pse__Timecard_Header__c',
    resourceRequest: 'pse__Resource_Request__c',
    project: 'pse__Proj__c',
    milestone: 'pse__Milestone__c'
  },
  status: { cancelled: 'Cancelled', draft: 'Draft' }
};

if (typeof module !== 'undefined') module.exports = { Config };
```

`apps-script/appsscript.json`:

```json
{
  "timeZone": "Europe/London",
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8",
  "oauthScopes": [
    "https://www.googleapis.com/auth/calendar.readonly",
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/script.container.ui"
  ]
}
```

Do **not** include `script.external_request` yet.

`.gitignore`: `node_modules/`, `.clasp.json`, `.env`

`README.md`: how to `npm test`, clasp push later, `TEST_MODE` default.

- [ ] **Step 4: Run tests**

Run: `cd apps-script && npm install && npm test -- tests/Config.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git init
git add apps-script .gitignore README.md docs
git commit -m "chore: scaffold Apps Script project with Jest and TEST_MODE config"
```

---

### Task 2: Pipe parser, canonical match, duration, week window

**Files:**
- Create: `apps-script/src/ParseDescription.js`
- Create: `apps-script/src/Canonical.js`
- Create: `apps-script/src/Duration.js`
- Create: `apps-script/src/Week.js`
- Test: `apps-script/tests/ParseDescription.test.js`, `Canonical.test.js`, `Duration.test.js`, `Week.test.js`

**Interfaces:**
- Consumes: `Config.TIMESHEET_WEEK_START`
- Produces:
  - `parseDescription(body) → { ok, company, meetingTitle, milestone, projectId, error }`
  - `canonicalize(value, allowedList) → string|null`
  - `durationHours(start, end, isAllDay) → { ok, hours, error }`
  - `weekStart(date, weekStartDay) → Date`
  - `fetchWindow(now, horizonDays, weekStartDay) → { timeMin, timeMax }`

- [ ] **Step 1: Write failing tests**

```javascript
// apps-script/tests/ParseDescription.test.js
const { parseDescription } = require('../src/ParseDescription');

test('parses four pipe segments', () => {
  const r = parseDescription('Acme Ltd|Kickoff call|Kickoff|a0B000000000001');
  expect(r.ok).toBe(true);
  expect(r.company).toBe('Acme Ltd');
  expect(r.meetingTitle).toBe('Kickoff call');
  expect(r.milestone).toBe('Kickoff');
  expect(r.projectId).toBe('a0B000000000001');
});

test('rejects wrong segment count', () => {
  const r = parseDescription('only|two');
  expect(r.ok).toBe(false);
  expect(r.error).toMatch(/segments/i);
});

test('rejects empty project id', () => {
  const r = parseDescription('Acme|Title|Kickoff|');
  expect(r.ok).toBe(false);
});

test('trims whitespace', () => {
  const r = parseDescription(' Acme | Title | Kickoff | a0B000000000001 ');
  expect(r.ok).toBe(true);
  expect(r.company).toBe('Acme');
});
```

```javascript
// apps-script/tests/Canonical.test.js
const { canonicalize } = require('../src/Canonical');

test('matches case-insensitive and returns canonical spelling', () => {
  expect(canonicalize(' kickoff ', ['Discovery', 'Kickoff'])).toBe('Kickoff');
});

test('unknown returns null', () => {
  expect(canonicalize('Kick off', ['Kickoff'])).toBeNull();
});
```

```javascript
// apps-script/tests/Duration.test.js
const { durationHours } = require('../src/Duration');

test('90 minutes is 1.5 hours', () => {
  const s = new Date('2026-09-23T09:00:00Z');
  const e = new Date('2026-09-23T10:30:00Z');
  expect(durationHours(s, e, false)).toEqual({ ok: true, hours: 1.5 });
});

test('all-day is rejected', () => {
  const r = durationHours(new Date(), new Date(), true);
  expect(r.ok).toBe(false);
});
```

```javascript
// apps-script/tests/Week.test.js
const { weekStart, fetchWindow } = require('../src/Week');

test('Monday week start from Wednesday', () => {
  const wed = new Date('2026-09-23T12:00:00+01:00');
  const start = weekStart(wed, 'Monday');
  expect(start.getDay()).toBe(1);
  expect(start.getHours()).toBe(0);
});

test('fetch window starts at week start not now', () => {
  const now = new Date('2026-09-23T12:00:00Z');
  const w = fetchWindow(now, 90, 'Monday');
  expect(w.timeMin.getTime()).toBeLessThan(now.getTime());
  expect(w.timeMax.getTime()).toBeGreaterThan(now.getTime());
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `cd apps-script && npm test`

- [ ] **Step 3: Implement**

```javascript
// apps-script/src/ParseDescription.js
function parseDescription(body) {
  if (body == null || String(body).trim() === '') {
    return { ok: false, error: 'empty description' };
  }
  var parts = String(body).split('|');
  if (parts.length !== 4) {
    return { ok: false, error: 'expected 4 pipe segments' };
  }
  var company = parts[0].trim();
  var meetingTitle = parts[1].trim();
  var milestone = parts[2].trim();
  var projectId = parts[3].trim();
  if (!projectId) return { ok: false, error: 'empty project id' };
  return { ok: true, company: company, meetingTitle: meetingTitle, milestone: milestone, projectId: projectId };
}
if (typeof module !== 'undefined') module.exports = { parseDescription };
```

```javascript
// apps-script/src/Canonical.js
function canonicalize(value, allowedList) {
  if (value == null) return null;
  var needle = String(value).trim().toLowerCase();
  if (!needle) return null;
  for (var i = 0; i < allowedList.length; i++) {
    var c = String(allowedList[i]).trim();
    if (c.toLowerCase() === needle) return c;
  }
  return null;
}
if (typeof module !== 'undefined') module.exports = { canonicalize };
```

```javascript
// apps-script/src/Duration.js
function durationHours(start, end, isAllDay) {
  if (isAllDay) return { ok: false, error: 'all-day events are skipped' };
  if (!(start instanceof Date) || !(end instanceof Date) || isNaN(start) || isNaN(end)) {
    return { ok: false, error: 'invalid start/end' };
  }
  var ms = end.getTime() - start.getTime();
  if (ms <= 0) return { ok: false, error: 'non-positive duration' };
  return { ok: true, hours: ms / 3600000 };
}
if (typeof module !== 'undefined') module.exports = { durationHours };
```

```javascript
// apps-script/src/Week.js
function weekStart(date, weekStartDay) {
  var d = new Date(date.getTime());
  d.setHours(0, 0, 0, 0);
  var want = weekStartDay === 'Sunday' ? 0 : 1;
  var day = d.getDay();
  var diff = (day - want + 7) % 7;
  d.setDate(d.getDate() - diff);
  return d;
}

function fetchWindow(now, horizonDays, weekStartDay) {
  var timeMin = weekStart(now, weekStartDay || 'Monday');
  var timeMax = new Date(now.getTime() + horizonDays * 86400000);
  return { timeMin: timeMin, timeMax: timeMax };
}
if (typeof module !== 'undefined') module.exports = { weekStart, fetchWindow };
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `cd apps-script && npm test`

- [ ] **Step 5: Commit**

```bash
git add apps-script
git commit -m "feat: parse calendar pipe body, canonical lists, duration and week window"
```

---

### Task 3: Resource email matching (To vs From)

**Files:**
- Create: `apps-script/src/Resources.js`
- Test: `apps-script/tests/Resources.test.js`

**Interfaces:**
- Consumes: resource rows `{ email, name, certiniaId }`
- Produces:
  - `indexResources(rows) → Map lowercase email → row`
  - `matchTo(attendeeEmails, index) → sorted matched rows` (customers dropped)
  - `matchFrom(organizerEmail, index) → row|null`
  - `resourceLabel(matchedRows) → comma-separated names, stable sort by email`

- [ ] **Step 1: Failing tests**

```javascript
const { indexResources, matchTo, matchFrom, resourceLabel } = require('../src/Resources');

const rows = [
  { email: 'amy@co.com', name: 'Amy', certiniaId: 'R1' },
  { email: 'ben@co.com', name: 'Ben', certiniaId: 'R2' }
];

test('To keeps only listed emails, drops customers, sorts by email', () => {
  const idx = indexResources(rows);
  const m = matchTo(['customer@x.com', 'Ben@co.com', 'amy@co.com'], idx);
  expect(m.map(function (r) { return r.email; })).toEqual(['amy@co.com', 'ben@co.com']);
  expect(resourceLabel(m)).toBe('Amy, Ben');
});

test('From looks up organizer; missing is null', () => {
  const idx = indexResources(rows);
  expect(matchFrom('AMY@co.com', idx).certiniaId).toBe('R1');
  expect(matchFrom('pm@elsewhere.com', idx)).toBeNull();
});

test('organizer is not added to To unless also an attendee', () => {
  const idx = indexResources(rows);
  const m = matchTo(['customer@x.com'], idx);
  expect(m).toEqual([]);
});
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement**

```javascript
function indexResources(rows) {
  var map = {};
  for (var i = 0; i < rows.length; i++) {
    var e = String(rows[i].email || '').trim().toLowerCase();
    if (e) map[e] = {
      email: e,
      name: rows[i].name,
      certiniaId: rows[i].certiniaId
    };
  }
  return map;
}

function matchTo(attendeeEmails, index) {
  var out = [];
  var seen = {};
  for (var i = 0; i < attendeeEmails.length; i++) {
    var e = String(attendeeEmails[i] || '').trim().toLowerCase();
    if (!e || seen[e] || !index[e]) continue;
    seen[e] = true;
    out.push(index[e]);
  }
  out.sort(function (a, b) { return a.email < b.email ? -1 : 1; });
  return out;
}

function matchFrom(organizerEmail, index) {
  var e = String(organizerEmail || '').trim().toLowerCase();
  return index[e] || null;
}

function resourceLabel(matchedRows) {
  return matchedRows.map(function (r) { return r.name || r.email; }).join(', ');
}

if (typeof module !== 'undefined') {
  module.exports = { indexResources: indexResources, matchTo: matchTo, matchFrom: matchFrom, resourceLabel: resourceLabel };
}
```

- [ ] **Step 4: PASS** `npm test -- tests/Resources.test.js`

- [ ] **Step 5: Commit** `feat: match calendar To and From against Resource emails sheet`

---

### Task 4: Consultation row diff

**Files:**
- Create: `apps-script/src/ConsultationDiff.js`
- Test: `apps-script/tests/ConsultationDiff.test.js`

**Interfaces:**
- Consumes: existing rows keyed by Event ID; incoming events with `{ eventId, title, body, start, end, milestone, resourceLabel, hours, status }`
- Produces: `{ inserts, fieldUpdates, cancellations, unchangedIds }`
- Rules from spec §6: no rewrite if start/end/To/milestone unchanged; update date/time/duration and/or resource and/or milestone; cancel only if Start Date ≥ today, previously synced, missing from incoming non-cancelled set; **do not** cancel if start is before fetch window or beyond horizon.

- [ ] **Step 1: Failing tests**

```javascript
const { consultationDiff } = require('../src/ConsultationDiff');

const now = new Date('2026-09-23T12:00:00Z');
const future = new Date('2026-10-01T09:00:00Z');
const futureEnd = new Date('2026-10-01T10:00:00Z');

function incoming(over) {
  return Object.assign({
    eventId: 'e1',
    title: 'Consult',
    body: 'Acme|Consult|Kickoff|P1',
    start: future,
    end: futureEnd,
    milestone: 'Kickoff',
    resourceLabel: 'Amy',
    hours: 1,
    cancelledOnCalendar: false
  }, over);
}

test('unknown event id inserts', () => {
  const d = consultationDiff({}, [incoming()], now, { timeMin: now, timeMax: new Date('2026-12-31') });
  expect(d.inserts).toHaveLength(1);
  expect(d.inserts[0].eventId).toBe('e1');
});

test('unchanged event is not rewritten', () => {
  const exist = { e1: { eventId: 'e1', start: future, end: futureEnd, milestone: 'Kickoff', resourceLabel: 'Amy', status: '' } };
  const d = consultationDiff(exist, [incoming()], now, { timeMin: now, timeMax: new Date('2026-12-31') });
  expect(d.fieldUpdates).toHaveLength(0);
  expect(d.unchangedIds).toContain('e1');
});

test('start change updates date time duration only', () => {
  const exist = { e1: { eventId: 'e1', start: future, end: futureEnd, milestone: 'Kickoff', resourceLabel: 'Amy', status: '' } };
  const newStart = new Date('2026-10-02T09:00:00Z');
  const newEnd = new Date('2026-10-02T10:00:00Z');
  const d = consultationDiff(exist, [incoming({ start: newStart, end: newEnd })], now, { timeMin: now, timeMax: new Date('2026-12-31') });
  expect(d.fieldUpdates[0].fields).toEqual(['Start Date', 'Start Time', 'Duration']);
});

test('To change updates Resource', () => {
  const exist = { e1: { eventId: 'e1', start: future, end: futureEnd, milestone: 'Kickoff', resourceLabel: 'Amy', status: '' } };
  const d = consultationDiff(exist, [incoming({ resourceLabel: 'Amy, Ben' })], now, { timeMin: now, timeMax: new Date('2026-12-31') });
  expect(d.fieldUpdates[0].fields).toContain('Resource');
});

test('missing future event is cancelled not deleted', () => {
  const exist = { e1: { eventId: 'e1', start: future, end: futureEnd, milestone: 'Kickoff', resourceLabel: 'Amy', status: '' } };
  const d = consultationDiff(exist, [], now, { timeMin: now, timeMax: new Date('2026-12-31') });
  expect(d.cancellations).toEqual(['e1']);
});

test('past row outside window is not cancelled', () => {
  const past = new Date('2026-09-01T09:00:00Z');
  const exist = { e1: { eventId: 'e1', start: past, end: new Date('2026-09-01T10:00:00Z'), milestone: 'Kickoff', resourceLabel: 'Amy', status: '' } };
  const d = consultationDiff(exist, [], now, { timeMin: new Date('2026-09-21'), timeMax: new Date('2026-12-31') });
  expect(d.cancellations).toEqual([]);
});
```

- [ ] **Step 2: FAIL** `npm test -- tests/ConsultationDiff.test.js`

- [ ] **Step 3: Implement**

```javascript
// apps-script/src/ConsultationDiff.js
function startOfToday(now) {
  var d = new Date(now.getTime());
  d.setHours(0, 0, 0, 0);
  return d;
}

function sameInstant(a, b) {
  return a && b && a.getTime() === b.getTime();
}

function consultationDiff(existingByEventId, incoming, now, window) {
  var inserts = [];
  var fieldUpdates = [];
  var cancellations = [];
  var unchangedIds = [];
  var incomingIds = {};

  for (var i = 0; i < incoming.length; i++) {
    var ev = incoming[i];
    if (ev.cancelledOnCalendar) continue;
    incomingIds[ev.eventId] = ev;
    var prev = existingByEventId[ev.eventId];
    if (!prev) {
      inserts.push(ev);
      continue;
    }
    var fields = [];
    if (!sameInstant(prev.start, ev.start) || !sameInstant(prev.end, ev.end)) {
      fields.push('Start Date', 'Start Time', 'Duration');
    }
    if ((prev.resourceLabel || '') !== (ev.resourceLabel || '')) fields.push('Resource');
    if ((prev.milestone || '') !== (ev.milestone || '')) fields.push('Milestone');
    if (fields.length === 0) unchangedIds.push(ev.eventId);
    else fieldUpdates.push({ eventId: ev.eventId, fields: fields, incoming: ev });
  }

  var today = startOfToday(now);
  var ids = Object.keys(existingByEventId);
  for (var j = 0; j < ids.length; j++) {
    var id = ids[j];
    var row = existingByEventId[id];
    if (row.status === 'Cancelled') continue;
    if (incomingIds[id]) continue;
    if (row.start < today) continue;
    if (window && (row.start < window.timeMin || row.start > window.timeMax)) continue;
    cancellations.push(id);
  }

  return {
    inserts: inserts,
    fieldUpdates: fieldUpdates,
    cancellations: cancellations,
    unchangedIds: unchangedIds
  };
}

if (typeof module !== 'undefined') module.exports = { consultationDiff: consultationDiff };
```

- [ ] **Step 4: PASS**

- [ ] **Step 5: Commit** `feat: consultation schedule insert/update/cancel diff`

---

### Task 5: API Inspector capture

**Files:**
- Create: `apps-script/src/Inspector.js`
- Test: `apps-script/tests/Inspector.test.js`

**Interfaces:**
- Produces: `createInspector() → { calls, record(call), asRows() }`
- Call shape: `{ timestamp, job, dryRun, system, operation, method, path, requestJson, fakeResponseJson, notes }`

- [ ] **Step 1: Failing test** — record Smartsheet and Salesforce calls; `asRows()` column order matches spec §14.2; JSON is stringified pretty.

- [ ] **Step 2: FAIL**

- [ ] **Step 3: Implement**

```javascript
function createInspector() {
  var calls = [];
  return {
    calls: calls,
    record: function (call) {
      calls.push({
        timestamp: call.timestamp || new Date().toISOString(),
        job: call.job,
        dryRun: !!call.dryRun,
        system: call.system,
        operation: call.operation,
        method: call.method,
        path: call.path,
        requestJson: typeof call.request === 'string' ? call.request : JSON.stringify(call.request, null, 2),
        fakeResponseJson: typeof call.fakeResponse === 'string' ? call.fakeResponse : JSON.stringify(call.fakeResponse || { success: true, id: 'harness_' + calls.length }, null, 2),
        notes: call.notes || ''
      });
    },
    asRows: function () {
      return calls.map(function (c) {
        return [c.timestamp, c.job, c.dryRun, c.system, c.operation, c.method, c.path, c.requestJson, c.fakeResponseJson, c.notes];
      });
    }
  };
}
if (typeof module !== 'undefined') module.exports = { createInspector: createInspector };
```

- [ ] **Step 4: PASS**

- [ ] **Step 5: Commit** `feat: API Inspector call log`

---

### Task 6: In-memory workbook + Harness Smartsheet client

**Files:**
- Create: `apps-script/src/SheetIO.js` (memory workbook for tests; GAS implementation in same file behind `typeof SpreadsheetApp`)
- Create: `apps-script/src/SmartsheetClient.js`
- Test: `apps-script/tests/SmartsheetHarness.test.js`

**Interfaces:**
- `MemoryWorkbook` with `getTab(name)`, `ensureTab(name, headers)`, `readObjects(name)`, `writeRow`, `upsertByKey`
- `HarnessSmartsheetClient({ workbook, inspector, job, dryRun })`
  - `resolveProject(projectId) → { sheetId, tabName } | null` via `Harness_ProjectIndex`
  - `loadConsultation(projectId) → rows by eventId`
  - `applyDiff(projectId, diff)` writes `CS_*` unless `dryRun`
  - Every would-be HTTP: `inspector.record({ system: 'Smartsheet', path: '/2.0/sheets/' + sheetId + '/rows', ... })`

**Index columns:** `Project ID | Tab name | Fake Smartsheet ID`

- [ ] **Step 1: Tests**
  - unknown project → null
  - first applyDiff insert creates consultation row on `CS_P1`
  - second identical applyDiff does not duplicate
  - dryRun records inspector row but `CS_P1` row count unchanged
  - TEST_MODE client never exposes a `urlFetch` function

- [ ] **Step 2: FAIL**

- [ ] **Step 3: Implement harness client** using consultation headers from `Config`. Fake response `{ success: true, id: fakeSheetId }`.

- [ ] **Step 4: PASS**

- [ ] **Step 5: Commit** `feat: harness Smartsheet client upserts CS_ emulator tabs`

---

### Task 7: Salesforce payload builders + harness client

**Files:**
- Create: `apps-script/src/SalesforceClient.js` (builders + `HarnessSalesforceClient`)
- Test: `apps-script/tests/SalesforcePayloads.test.js`

**Interfaces:**
- `isFuture(event, now)` — `event.end > now`
- `buildAssignmentUpserts(events, now)` — one record per (projectId, resourceCertiniaId) for **future** events only; each attendee gets **full** duration; path `/services/data/v60.0/sobjects/pse__Assignment__c`; body includes `pse__Project__c`, `pse__Resource__c`, hours-on-date map keyed by Event ID (custom field `Google_Event_Id__c` on a schedule-exception shaped object `{ date, hours, googleEventId }`)
- `buildTimecardDeltas(events, fromResource, mapRows, now)` — only `end <= now`, From mapped, not cancelled; weekday Mon–Fri; skip if From null
- `buildResourceRequest(row)` — `{ Name optional, pse__Project__c, pse__Resource_Role__c, pse__SOW_Hours__c or Hours, pse__Status__c: 'Draft' }`
- `hourRules(staffingRows)` — request hours ≤ milestone hours; sum of request hours per Project+Milestone ≤ milestone hours; sum of milestone hours ≤ purchased total
- `HarnessSalesforceClient` logs composite PATCH/POST of those bodies; returns fake ids; updates in-memory `Harness_Assignments` / `Harness_Timecards` when not dryRun
- Completed event: assignment payloads **omit** that Event ID (hours removed)

Do not implement live login. Paths must be the live REST paths so the Inspector shows the real format.

- [ ] **Step 1: Tests covering:** two future meetings same person same week sum hours; completed meeting produces timecard not assignment; missing From produces no timecard; hourRules blocks over-allocation; dryRun still records inspector; chunk arrays length ≤ 50.

- [ ] **Step 2: FAIL**

- [ ] **Step 3: Implement builders + harness client.** Persist Event ID on schedule slice as `Google_Event_Id__c` (document in comment: sandbox may rename). Timecard weekday: `['Monday','Tuesday','Wednesday','Thursday','Friday'][getDay() mapped with Sunday=0 → skip weekend + error]`.

- [ ] **Step 4: PASS**

- [ ] **Step 5: Commit** `feat: Certinia assignment, timecard and RR payload builders with harness client`

---

### Task 7b: Harness_Forecast (Certinia planner preview)

**Files:**
- Create: `apps-script/src/PlannerPreview.js`
- Test: `apps-script/tests/PlannerPreview.test.js`
- Modify: `apps-script/src/CalendarGet.js` (Task 8 will call this; add the export now)

**Interfaces:**
- Consumes: assignment slices `{ projectId, company, resourceName, date, hours }` (future only)
- Produces: `renderForecastGrid(slices, now, weekStartDay) → { banner, headers, rows }`
- `writeForecastTab(workbook, grid)` overwrites `Harness_Forecast`
- Project rollup row then resource rows (expanded chevron). Week headers are Mondays (`d MMM yyyy`). Empty weeks omitted after last used week; max 16 columns. Blank cells not `0`. Two meetings same resource same week **sum**.

- [ ] **Step 1: Failing tests**

```javascript
const { renderForecastGrid } = require('../src/PlannerPreview');

test('project rollup then resource rows with summed week hours', () => {
  const now = new Date('2026-09-23T12:00:00Z');
  const mon = new Date('2026-09-28T10:00:00Z');
  const tue = new Date('2026-09-29T10:00:00Z');
  const grid = renderForecastGrid([
    { projectId: 'P-DEMO', company: 'Acme Ltd', resourceName: 'Mike', date: mon, hours: 1 },
    { projectId: 'P-DEMO', company: 'Acme Ltd', resourceName: 'Mike', date: tue, hours: 1 }
  ], now, 'Monday');
  expect(grid.banner).toMatch(/Project Planner \(PM\)/);
  expect(grid.banner).toMatch(/In Progress/);
  expect(grid.headers[0]).toBe('▾ Project ID');
  expect(grid.headers[1]).toBe('Customer');
  expect(grid.headers[2]).toBe('Resource');
  expect(grid.headers[3]).toBe('Total hrs');
  const weekCol = grid.headers.indexOf('28 Sep 2026');
  expect(weekCol).toBeGreaterThan(3);
  expect(grid.rows[0][0]).toBe('P-DEMO');
  expect(grid.rows[0][2]).toBe('(all)');
  expect(grid.rows[0][3]).toBe(2);
  expect(grid.rows[0][weekCol]).toBe(2);
  expect(grid.rows[1][2]).toBe('Mike');
  expect(grid.rows[1][weekCol]).toBe(2);
});

test('two resources appear as chevron children', () => {
  const now = new Date('2026-09-23T12:00:00Z');
  const d = new Date('2026-09-28T10:00:00Z');
  const grid = renderForecastGrid([
    { projectId: 'P-DEMO', company: 'Acme Ltd', resourceName: 'Amy', date: d, hours: 1 },
    { projectId: 'P-DEMO', company: 'Acme Ltd', resourceName: 'Mike', date: d, hours: 1 }
  ], now, 'Monday');
  expect(grid.rows.map(function (r) { return r[2]; })).toEqual(['(all)', 'Amy', 'Mike']);
  expect(grid.rows[0][3]).toBe(2);
});

test('empty week cell is empty string not zero', () => {
  const now = new Date('2026-09-23T12:00:00Z');
  const d = new Date('2026-10-05T10:00:00Z');
  const grid = renderForecastGrid([
    { projectId: 'P-DEMO', company: 'Acme Ltd', resourceName: 'Mike', date: d, hours: 1 }
  ], now, 'Monday');
  const firstWeek = grid.headers[4];
  expect(firstWeek).toBe('21 Sep 2026');
  expect(grid.rows[1][4]).toBe('');
});
```

Note: `21 Sep 2026` is a Monday; if `weekStart(now)` for 23 Sep 2026 (Wednesday) is 21 Sep, the first header is that Monday even if hours land later.

- [ ] **Step 2: FAIL** `npm test -- tests/PlannerPreview.test.js`

- [ ] **Step 3: Implement** `renderForecastGrid` using `weekStart` from `Week.js`. Group by projectId, then resourceName (sort). Format week headers with UTC or local date: `d + ' ' + ['Jan','Feb',...][m] + ' ' + y`. Cap 16 weeks from weekStart(now).

```javascript
function formatWeekHead(d) {
  var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
}

function weekKey(d, weekStartDay) {
  return weekStart(d, weekStartDay).getTime();
}

function renderForecastGrid(slices, now, weekStartDay) {
  var start = weekStart(now, weekStartDay || 'Monday');
  var used = {};
  slices.forEach(function (s) {
    used[weekKey(s.date, weekStartDay)] = true;
  });
  var last = start;
  Object.keys(used).forEach(function (k) {
    var wk = new Date(Number(k));
    if (wk > last) last = wk;
  });
  var headers = ['▾ Project ID', 'Customer', 'Resource', 'Total hrs'];
  var weeks = [];
  var cursor = new Date(start.getTime());
  var n = 0;
  while (cursor.getTime() <= last.getTime() && n < 16) {
    weeks.push(new Date(cursor.getTime()));
    headers.push(formatWeekHead(cursor));
    cursor.setDate(cursor.getDate() + 7);
    n++;
  }
  var byProj = {};
  slices.forEach(function (s) {
    if (!byProj[s.projectId]) byProj[s.projectId] = { company: s.company, resources: {} };
    var res = byProj[s.projectId].resources;
    if (!res[s.resourceName]) res[s.resourceName] = {};
    var wk = weekKey(s.date, weekStartDay);
    res[s.resourceName][wk] = (res[s.resourceName][wk] || 0) + s.hours;
  });
  var rows = [];
  Object.keys(byProj).sort().forEach(function (pid) {
    var proj = byProj[pid];
    var names = Object.keys(proj.resources).sort();
    var rollup = {};
    var totalAll = 0;
    names.forEach(function (name) {
      Object.keys(proj.resources[name]).forEach(function (wk) {
        rollup[wk] = (rollup[wk] || 0) + proj.resources[name][wk];
        totalAll += proj.resources[name][wk];
      });
    });
    function weekCells(map) {
      return weeks.map(function (w) {
        var v = map[w.getTime()];
        return v ? v : '';
      });
    }
    rows.push([pid, proj.company, '(all)', totalAll].concat(weekCells(rollup)));
    names.forEach(function (name) {
      var map = proj.resources[name];
      var tot = 0;
      Object.keys(map).forEach(function (k) { tot += map[k]; });
      rows.push([pid, proj.company, name, tot].concat(weekCells(map)));
    });
  });
  return {
    banner: 'Certinia forecasting preview — Project Planner (PM) — Filter: In Progress — Zoom: Weeks — not live Salesforce',
    headers: headers,
    rows: rows
  };
}

if (typeof module !== 'undefined') module.exports = { renderForecastGrid: renderForecastGrid, formatWeekHead: formatWeekHead };
```

- [ ] **Step 4: PASS** (adjust the empty-week test if `weekStart` timezone makes the first header differ; lock tests to the function’s actual first Monday)

- [ ] **Step 5: Commit** `feat: Harness_Forecast tab previews Certinia Project Planner week grid`

---

### Task 8: Calendar GET orchestrator

**Files:**
- Create: `apps-script/src/CalendarGet.js`
- Test: `apps-script/tests/CalendarGet.test.js`

**Interfaces:**
- `runCalendarGet({ now, events, companies, milestones, resources, smartsheet, salesforce, inspector, errorLog, dryRun, job: 'CalendarGET', remainingMs })`
- For each event: parse → canonicalize company & milestone → duration → match To/From → resolve project sheet → skip+errorLog on failure → collect incoming → `consultationDiff` → apply (unless dryRun) → always run Salesforce builders (future vs completed) via salesforce client → if not dryRun, `writeForecastTab` from assignment slices
- Test: after GET, `Harness_Forecast` has a `P-DEMO` rollup and a Mike (or resource) row; dryRun leaves the forecast tab untouched
- Partial success: one bad event does not abort
- If `remainingMs < Config.SAFETY_MS` stop and return `{ cursor, errorLog }`

Inject `events` as already-fetched calendar items so tests do not call CalendarApp:

```javascript
{
  id, title, body, start, end, isAllDay,
  organizerEmail, attendeeEmails
}
```

- [ ] **Step 1: Tests**
  1. Valid event → CS insert + Smartsheet inspector + Salesforce assignment inspector
  2. Bad company → Error Log, no CS row
  3. Unknown project id → Error Log
  4. All-day → Error Log
  5. Completed event + From on list → timecard inspector, no assignment for that Event ID
  6. Completed + From missing → Error Log, CS row still inserted, no timecard
  7. dryRun → inspector dryRun true, CS unchanged
  8. Two events same Event ID not duplicated on second run (pass existing CS rows)

- [ ] **Step 2: FAIL**

- [ ] **Step 3: Implement orchestrator only** (no GAS). `errorLog.append({ timestamp, job, eventId, projectId, reason, snippet })`.

- [ ] **Step 4: PASS**

- [ ] **Step 5: Commit** `feat: Calendar GET orchestrator with skip-and-continue error log`

---

### Task 9: Import project and Create resource requests

**Files:**
- Create: `apps-script/src/ImportProject.js`
- Create: `apps-script/src/CreateResourceRequests.js`
- Test: `apps-script/tests/ImportProject.test.js`, `CreateResourceRequests.test.js`

**Interfaces:**
- `importProject({ projectId, salesforce, lookup, staffingTab, inspector, dryRun: false })` — harness GET from `Harness_Projects` + `Harness_Milestones`; inspector logs SOQL `SELECT Id, Name, ... FROM pse__Proj__c WHERE Id = '...'`; upsert staffing rows keyed by Project ID + Milestone + default Resource type from lookup; default request hours = milestone hours
- `createResourceRequests({ staffingRows, salesforce, inspector, dryRun })` — only `confirmed === true`; run `hourRules`; create or update by existing RR id

- [ ] **Step 1: Tests**
  - Import fills two milestone rows with default types
  - PM override of resource type is preserved on re-import if you only fill empty Resource type (do not clobber override: if staffing cell already has a type, keep it)
  - Create without confirmed → no Salesforce payload
  - Create with confirmed → inspector RR JSON + fake id written back
  - Over-hours → error, no create
  - dryRun Create → inspector only, no fake id

- [ ] **Step 2: FAIL**

- [ ] **Step 3: Implement**

- [ ] **Step 4: PASS**

- [ ] **Step 5: Commit** `feat: Import project and Draft resource request create with hour rules`

---

### Task 10: GAS menus, TEST_MODE, trigger no-op, Inspector sidebar

**Files:**
- Create: `apps-script/src/Menu.js`
- Create: `apps-script/src/InspectorSidebar.html`
- Create: `apps-script/src/GasAdapters.js` (CalendarApp fetch → orchestrator event shape; ScriptProperties `TEST_MODE`; SpreadsheetApp SheetIO)
- Test: `apps-script/tests/TestModeGuard.test.js` (pure: `assertNoLiveFetch(TEST_MODE, client)`)

**Interfaces:**
- `onOpen()` menus exactly:
  - Calendar → Get consultations / Get consultations (dry-run)
  - Certinia → Import project / Create resource requests / Create resource requests (dry-run)
  - Test → Open API Inspector / TEST_MODE / Import dummy data / Import seed calendar events
- `onCalendarGet(dryRun)` reads properties, builds harness clients if TEST_MODE else throws `Live clients not installed` until Task 12
- `onDailyTrigger()` returns immediately if TEST_MODE true
- `openInspector()` `HtmlService.createHtmlOutputFromFile('InspectorSidebar').setTitle('API Inspector')`
- Sidebar HTML: filter Smartsheet/Salesforce, show last run JSON from `API_Inspector` tab via `google.script.run.getInspectorRows()`

- [ ] **Step 1: Test** `chooseClients(true, harness, live)` returns harness; `chooseClients(false, harness, live)` returns live; `dailyTriggerAllowed(true)` is false.

- [ ] **Step 2: FAIL**

- [ ] **Step 3: Implement Menu.js, GasAdapters.js, InspectorSidebar.html.** Calendar fetch:

```javascript
function fetchCalendarEvents(calendarIds, timeMin, timeMax) {
  var out = [];
  for (var i = 0; i < calendarIds.length; i++) {
    var cal = CalendarApp.getCalendarById(calendarIds[i]);
    var evs = cal.getEvents(timeMin, timeMax);
    for (var j = 0; j < evs.length; j++) {
      var e = evs[j];
      out.push({
        id: e.getId(),
        title: e.getTitle(),
        body: e.getDescription(),
        start: e.getStartTime(),
        end: e.getEndTime(),
        isAllDay: e.isAllDayEvent(),
        organizerEmail: e.getCreators()[0] || '',
        attendeeEmails: e.getGuestList(true).map(function (g) { return g.getEmail(); })
      });
    }
  }
  return out;
}
```

Note: Apps Script `getCreators()` is the closest to Calendar **From**/organizer; document in README that live Calendar API `organizer.email` should be used if creators is empty. Prefer Calendar advanced service `event.organizer.email` if enabled in `appsscript.json` (`calendar` advanced service). **Enable Calendar advanced service in this task** and prefer `organizer.email`.

Add to `appsscript.json`:

```json
"enabledAdvancedServices": [{
  "userSymbol": "Calendar",
  "serviceId": "calendar",
  "version": "v3"
}]
```

Fetch via `Calendar.Events.list(id, { timeMin, timeMax, singleEvents: true, orderBy: 'startTime' })` and map `organizer.email`, `attendees[].email`, `start.dateTime`.

- [ ] **Step 4: PASS unit tests; manual note in README: clasp push, reload sheet, confirm menus**

- [ ] **Step 5: Commit** `feat: spreadsheet menus, TEST_MODE guard, API Inspector sidebar`

---

### Task 11: Import dummy data (workbook bootstrap)

**Files:**
- Create: `apps-script/src/Bootstrap.js`
- Test: `apps-script/tests/Bootstrap.test.js`
- Modify: `README.md` (one-liner pointing at the runsheet)

**Prerequisite for the operator:** a **blank** Google Spreadsheet only. No hand-built tabs.

**Interfaces:**
- `importDummyData(wb)` (same as bootstrap, menu **Test → Import dummy data**): create tabs if missing; upsert fixture rows below; **do not** call Calendar. Idempotent.
- Dummy rows **must** include:

| Tab | Rows |
|---|---|
| Resource emails | `mikemwp@gmail.com`, Mike, `R_MIKE` |
| Canonical companies | `Acme Ltd` |
| Canonical milestones | Kickoff, Discovery, Build, UAT, Go-Live |
| Milestone resource type | Kickoff→Consultant, Discovery→Consultant, Build→Developer, UAT→Consultant, Go-Live→Consultant |
| Harness_ProjectIndex | `P-DEMO`, `CS_P-DEMO`, `ss_demo` |
| Harness_Projects | `P-DEMO`, Acme Ltd, 40 purchased hours |
| Harness_Milestones | P-DEMO: Kickoff 8, Discovery 8, Build 12, UAT 8, Go-Live 4 (sum 40) |
| Harness_CalendarSeed | 10 future rows from `defaultSeedRows` (Task 12), From/To `mikemwp@gmail.com` |
| CS_P-DEMO, Staffing board, Error Log, Dry-run results, TimecardEventMap, API_Inspector, Harness_Forecast | headers / banner only |

- [ ] **Step 1: Test** `importDummyData` on empty MemoryWorkbook creates every `Config.tabs` entry plus `CS_P-DEMO`, 10 calendar-seed rows, and Resource emails containing `mikemwp@gmail.com`. Second call does not duplicate companies or seed rows.

- [ ] **Step 2: FAIL**

- [ ] **Step 3: Implement + README** “Before you test, follow `docs/superpowers/plans/2026-09-23-certinia-forecast-sync-runsheet.md`. Do not pre-create sheet tabs.”

- [ ] **Step 4: PASS**

- [ ] **Step 5: Commit** `feat: Test menu imports dummy harness data into a blank spreadsheet`

---

### Task 12: Import 10 seed calendar events

**Files:**
- Create: `apps-script/src/CalendarSeed.js`
- Test: `apps-script/tests/CalendarSeed.test.js`
- Modify: `apps-script/src/Bootstrap.js` (default 10 rows)
- Modify: `apps-script/src/Menu.js` (Test → Import seed calendar events)
- Modify: `apps-script/appsscript.json` add `https://www.googleapis.com/auth/calendar` (write; replace readonly)
- Modify: `README.md`

**Interfaces:**
- Consumes: `Harness_CalendarSeed` rows
- Produces: `defaultSeedRows(now) → 10 rows`; `buildCalendarInsert(row) → { summary, description, start, end, organizerEmail, attendees }`; `importSeedEvents(rows, calendarApi, calendarId) → { created, skipped, errors }`
- Description **must** be `Company|Meeting Title|Milestone|ProjectId` (four segments). Default From and To: `mikemwp@gmail.com`. User edits those columns on the sheet, then runs import.
- If `Google Event ID` is already set, **skip** that row (no duplicate).
- GAS adapter: `Calendar.Events.insert` on first `CALENDAR_IDS` calendar; write returned `id` back to the seed row. Inject `calendarApi` in tests (do not call Google from Jest).

**Seed tab columns:** `Calendar Title | Company | Meeting Title | Milestone | Project ID | Start | Duration hours | From | To | Google Event ID`

**Default 10 rows** (`defaultSeedRows`): `Start` = next weekday 10:00 in `Europe/London`, then +1 working day each; duration `1`; company `Acme Ltd`; project `P-DEMO`; From and To `mikemwp@gmail.com`.

| # | Calendar Title | Meeting Title | Milestone |
|---|---|---|---|
| 1 | Acme Kickoff | Kickoff workshop | Kickoff |
| 2 | Acme Discovery | Discovery call | Discovery |
| 3 | Acme Build planning | Build planning | Build |
| 4 | Acme Build review | Build review | Build |
| 5 | Acme UAT intro | UAT intro | UAT |
| 6 | Acme UAT session | UAT session | UAT |
| 7 | Acme Go-Live dry run | Go-Live dry run | Go-Live |
| 8 | Acme Go-Live | Go-Live | Go-Live |
| 9 | Acme hypercare | Hypercare check-in | Go-Live |
| 10 | Acme wrap-up | Wrap-up | Kickoff |

Two **Build** meetings in the same week so planner hours **sum**. Body examples: `Acme Ltd|Kickoff workshop|Kickoff|P-DEMO`.

- [ ] **Step 1: Write failing tests**

```javascript
// apps-script/tests/CalendarSeed.test.js
const { defaultSeedRows, buildCalendarInsert, importSeedEvents } = require('../src/CalendarSeed');

test('defaultSeedRows is 10 future timed events with mike as from and to', () => {
  const now = new Date('2026-09-23T12:00:00+01:00');
  const rows = defaultSeedRows(now);
  expect(rows).toHaveLength(10);
  rows.forEach(function (r) {
    expect(r.from).toBe('mikemwp@gmail.com');
    expect(r.to).toBe('mikemwp@gmail.com');
    expect(r.projectId).toBe('P-DEMO');
    expect(r.company).toBe('Acme Ltd');
    expect(r.durationHours).toBe(1);
    expect(new Date(r.start).getTime()).toBeGreaterThan(now.getTime());
  });
  expect(rows.filter(function (r) { return r.milestone === 'Build'; }).length).toBe(2);
});

test('buildCalendarInsert uses pipe description and attendees from To', () => {
  const payload = buildCalendarInsert({
    calendarTitle: 'Acme Kickoff',
    company: 'Acme Ltd',
    meetingTitle: 'Kickoff workshop',
    milestone: 'Kickoff',
    projectId: 'P-DEMO',
    start: new Date('2026-09-24T09:00:00Z'),
    durationHours: 1,
    from: 'mikemwp@gmail.com',
    to: 'other@co.com'
  });
  expect(payload.summary).toBe('Acme Kickoff');
  expect(payload.description).toBe('Acme Ltd|Kickoff workshop|Kickoff|P-DEMO');
  expect(payload.attendees).toEqual([{ email: 'other@co.com' }]);
  expect(payload.end.getTime() - payload.start.getTime()).toBe(3600000);
});

test('import skips rows that already have Google Event ID', () => {
  const created = [];
  const api = {
    insert: function (calId, body) {
      created.push(body);
      return { id: 'evt_' + created.length };
    }
  };
  const rows = defaultSeedRows(new Date('2026-09-23T12:00:00Z'));
  rows[0].googleEventId = 'already';
  const result = importSeedEvents(rows, api, 'primary');
  expect(result.created).toBe(9);
  expect(result.skipped).toBe(1);
  expect(created).toHaveLength(9);
  expect(rows[1].googleEventId).toBe('evt_1');
});

test('edited From/To on the row are what get sent', () => {
  const row = defaultSeedRows(new Date('2026-09-23T12:00:00Z'))[0];
  row.from = 'pm2@co.com';
  row.to = 'consultant@co.com';
  const payload = buildCalendarInsert(row);
  expect(payload.attendees[0].email).toBe('consultant@co.com');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps-script && npm test -- tests/CalendarSeed.test.js`
Expected: FAIL (module not found)

- [ ] **Step 3: Write minimal implementation**

```javascript
// apps-script/src/CalendarSeed.js
var SEED_FROM = 'mikemwp@gmail.com';
var SEED_MILESTONES = [
  { title: 'Acme Kickoff', meeting: 'Kickoff workshop', milestone: 'Kickoff' },
  { title: 'Acme Discovery', meeting: 'Discovery call', milestone: 'Discovery' },
  { title: 'Acme Build planning', meeting: 'Build planning', milestone: 'Build' },
  { title: 'Acme Build review', meeting: 'Build review', milestone: 'Build' },
  { title: 'Acme UAT intro', meeting: 'UAT intro', milestone: 'UAT' },
  { title: 'Acme UAT session', meeting: 'UAT session', milestone: 'UAT' },
  { title: 'Acme Go-Live dry run', meeting: 'Go-Live dry run', milestone: 'Go-Live' },
  { title: 'Acme Go-Live', meeting: 'Go-Live', milestone: 'Go-Live' },
  { title: 'Acme hypercare', meeting: 'Hypercare check-in', milestone: 'Go-Live' },
  { title: 'Acme wrap-up', meeting: 'Wrap-up', milestone: 'Kickoff' }
];

function addWorkingDays(date, n) {
  var d = new Date(date.getTime());
  var added = 0;
  while (added < n) {
    d.setDate(d.getDate() + 1);
    var day = d.getDay();
    if (day !== 0 && day !== 6) added++;
  }
  return d;
}

function nextWeekdayTen(now) {
  var d = new Date(now.getTime());
  d.setHours(10, 0, 0, 0);
  if (d.getTime() <= now.getTime()) {
    d.setDate(d.getDate() + 1);
    d.setHours(10, 0, 0, 0);
  }
  while (d.getDay() === 0 || d.getDay() === 6) {
    d.setDate(d.getDate() + 1);
    d.setHours(10, 0, 0, 0);
  }
  return d;
}

function defaultSeedRows(now) {
  var start0 = nextWeekdayTen(now);
  return SEED_MILESTONES.map(function (m, i) {
    var start = i === 0 ? start0 : addWorkingDays(start0, i);
    start.setHours(10, 0, 0, 0);
    return {
      calendarTitle: m.title,
      company: 'Acme Ltd',
      meetingTitle: m.meeting,
      milestone: m.milestone,
      projectId: 'P-DEMO',
      start: start,
      durationHours: 1,
      from: SEED_FROM,
      to: SEED_FROM,
      googleEventId: ''
    };
  });
}

function buildCalendarInsert(row) {
  var start = row.start instanceof Date ? row.start : new Date(row.start);
  var end = new Date(start.getTime() + Number(row.durationHours) * 3600000);
  var toList = String(row.to || '').split(',').map(function (e) { return e.trim(); }).filter(Boolean);
  return {
    summary: row.calendarTitle,
    description: [row.company, row.meetingTitle, row.milestone, row.projectId].join('|'),
    start: start,
    end: end,
    attendees: toList.map(function (email) { return { email: email }; })
  };
}

function importSeedEvents(rows, calendarApi, calendarId) {
  var created = 0;
  var skipped = 0;
  var errors = [];
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    if (row.googleEventId) {
      skipped++;
      continue;
    }
    try {
      var body = buildCalendarInsert(row);
      var res = calendarApi.insert(calendarId, body);
      row.googleEventId = res.id;
      created++;
    } catch (e) {
      errors.push({ index: i, message: String(e.message || e) });
    }
  }
  return { created: created, skipped: skipped, errors: errors };
}

if (typeof module !== 'undefined') {
  module.exports = {
    defaultSeedRows: defaultSeedRows,
    buildCalendarInsert: buildCalendarInsert,
    importSeedEvents: importSeedEvents
  };
}
```

GAS wrapper in `Menu.js` / `GasAdapters.js`: read `Harness_CalendarSeed`, call `importSeedEvents`, write Event IDs back, toast `Created N, skipped M`.

- [ ] **Step 4: Run tests — expect PASS**

Run: `cd apps-script && npm test -- tests/CalendarSeed.test.js`

- [ ] **Step 5: Commit**

```bash
git add apps-script
git commit -m "feat: import 10 pipe-formatted future calendar events from Harness_CalendarSeed"
```

---

### Task 13: Live clients (gated) — no calls in TEST_MODE

**Files:**
- Create: `apps-script/src/LiveSmartsheetClient.js`
- Create: `apps-script/src/LiveSalesforceClient.js`
- Modify: `apps-script/appsscript.json` add `https://www.googleapis.com/auth/script.external_request`
- Modify: `apps-script/src/Menu.js` `chooseClients`
- Test: `apps-script/tests/TestModeGuard.test.js` (extend)

**Interfaces:**
- Live clients use `UrlFetchApp.fetch`. They are only constructed when `TEST_MODE=false` **and** tokens exist; otherwise menu shows error `Set TEST_MODE false and Script Properties before live run`.
- `LiveSmartsheetClient` workspace scan + cache Project ID column; upsert rows by Event ID column
- `LiveSalesforceClient` OAuth refresh → composite sobjects chunk 50
- **Sandbox check (manual, documented in README, not coded as guess):** create one assignment with hours on a date; confirm Project Planner (PM) week column. If schedule exceptions differ, change only `Config.objects` / field maps.
- Tests: `chooseClients(true)` never instantiates live class (pass a factory that throws if called).

Do not implement Gmail or FastAPI.

- [ ] **Step 1: Factory test that live factory is not invoked in TEST_MODE**

- [ ] **Step 2: FAIL**

- [ ] **Step 3: Implement live clients + wiring**

- [ ] **Step 4: PASS unit tests** (no network)

- [ ] **Step 5: Commit** `feat: live Smartsheet and Salesforce clients gated behind TEST_MODE`

---

## Self-review (spec coverage)

| Spec section | Task |
|---|---|
| §4 pipe + canonical | 2, 8 |
| §5 calendars, From/To, duration, window | 2, 3, 8, 10 |
| §6 Consultation rules | 4, 6, 8 |
| §7 tabs | 1, 11 |
| §8.1 assignments future / complete / cancel | 7, 7b, 8 |
| §8.1.1 Harness_Forecast planner preview | 7b, 8, 11 |
| §8.2 PM timesheet From only | 7, 8 |
| §8.3 Draft RR + hour rules | 9 |
| §9 menus | 10 |
| §10 errors, 6 min cursor | 8 |
| §11 no tokens in source; no UrlFetch in TEST_MODE | 1, 10, 12 |
| §12 Gmail | omitted (non-goal) |
| §13 FastAPI | omitted (non-goal) |
| §14 harness + Inspector | 5, 6, 7, 10, 11, 12 |
| §14.5 must-pass | Tasks 8–12; README Phase A |
| §15 Phase B sandbox | Task 13 + README manual |
| Daily trigger no-op in TEST_MODE | 10 |
| Calendar seed 10 events | 12 |

No TBD in task code. Live field names are `Config.objects` with a README sandbox check. Placeholder `Google_Event_Id__c` is an explicit custom-field name to create in sandbox or remap.

---

## Phase A verification (human)

Follow the checklist in `docs/superpowers/plans/2026-09-23-certinia-forecast-sync-runsheet.md` (import dummy data → calendar seed → dry-run GET → live harness GET → Forecast tab → Import project). Do not type fixture rows by hand.
