# Certinia Forecast Sync

Google Apps Script bound to a staffing spreadsheet: Calendar GET → Smartsheet Consultation Schedule + Certinia planner/timesheet payloads.

## Local tests

```bash
cd apps-script
npm install
npm test
```

## Deploy

Use [clasp](https://github.com/google/clasp) to push `apps-script/` to a bound spreadsheet project later.

## TEST_MODE

`TEST_MODE` defaults to **true**. In test mode the script never UrlFetchs Smartsheet or Salesforce; harness tabs and the API Inspector capture payloads instead.

Before operator testing, follow [`docs/superpowers/plans/2026-09-23-certinia-forecast-sync-runsheet.md`](docs/superpowers/plans/2026-09-23-certinia-forecast-sync-runsheet.md). Do not pre-create sheet tabs.

## Calendar seed

**Test → Import seed calendar events** creates 10 future pipe-formatted meetings from `Harness_CalendarSeed`. Requires `CALENDAR_IDS` Script Property and calendar write scope.

## Live mode (Phase B)

Set Script Properties (`TEST_MODE=false`, Smartsheet token, Salesforce OAuth) before live runs. In sandbox, confirm assignment hours appear in Project Planner (PM) week columns; remap `Config.objects` if field names differ.
