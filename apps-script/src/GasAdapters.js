var Config = typeof require !== 'undefined' ? require('./Config').Config : Config;
var flushInspectorFn = typeof require !== 'undefined' ? require('./SheetIO').flushInspectorToWorkbook : flushInspectorToWorkbook;
var createSpreadsheetWorkbookFn = typeof require !== 'undefined' ? require('./SheetIO').createSpreadsheetWorkbook : createSpreadsheetWorkbook;
var seedModule = typeof require !== 'undefined' ? require('./CalendarSeed') : { seedRowToSheet: seedRowToSheet, SEED_HEADERS: SEED_HEADERS };
var importProjectFn = typeof require !== 'undefined' ? require('./ImportProject').importProject : importProject;
var createResourceRequestsFn = typeof require !== 'undefined' ? require('./CreateResourceRequests').createResourceRequests : createResourceRequests;

var STAFFING_HEADERS = [
  'Project ID', 'Company Name', 'Total purchased hours', 'Milestone', 'Milestone hours',
  'Resource type', 'Request hours', 'Confirmed', 'Certinia Resource Request Id'
];

function createGasWorkbook() {
  return createSpreadsheetWorkbookFn(SpreadsheetApp.getActiveSpreadsheet());
}

function persistStaffingRRIds(wb, staffingRows) {
  var tab = wb.getTab(Config.tabs.staffing);
  var pidIdx = tab.headers.indexOf('Project ID');
  var mIdx = tab.headers.indexOf('Milestone');
  var rrIdx = tab.headers.indexOf('Certinia Resource Request Id');
  if (pidIdx < 0 || mIdx < 0 || rrIdx < 0) return;
  var changed = false;
  staffingRows.forEach(function (r) {
    var rrId = r.certiniaResourceRequestId || r['Certinia Resource Request Id'];
    if (!rrId) return;
    var projectId = r.projectId || r['Project ID'];
    var milestone = r.milestone || r['Milestone'];
    for (var i = 0; i < tab.rows.length; i++) {
      if (tab.rows[i][pidIdx] === projectId && tab.rows[i][mIdx] === milestone) {
        tab.rows[i][rrIdx] = rrId;
        changed = true;
        return;
      }
    }
  });
  if (changed) wb.overwriteTab(Config.tabs.staffing, tab.headers, tab.rows);
}

function persistSeedGoogleEventIds(wb, seedRows) {
  var headers = seedModule.SEED_HEADERS;
  wb.ensureTab(Config.tabs.calendarSeed, headers);
  var tab = wb.getTab(Config.tabs.calendarSeed);
  var idIdx = tab.headers.indexOf('Google Event ID');
  if (idIdx < 0) {
    tab.headers.push('Google Event ID');
    idIdx = tab.headers.length - 1;
  }
  seedRows.forEach(function (row, i) {
    if (!row.googleEventId) return;
    if (tab.rows[i]) {
      while (tab.rows[i].length <= idIdx) tab.rows[i].push('');
      tab.rows[i][idIdx] = row.googleEventId;
    }
  });
  wb.overwriteTab(Config.tabs.calendarSeed, tab.headers, tab.rows);
}

function runImportWithFlush(wb, inspector, salesforce, projectId, dryRun) {
  importProjectFn({
    projectId: projectId,
    salesforce: salesforce,
    lookup: wb.readRows(Config.tabs.lookup),
    staffingTab: Config.tabs.staffing,
    workbook: wb,
    inspector: inspector,
    dryRun: dryRun
  });
  flushInspectorFn(wb, inspector);
}

function runCreateRRWithFlush(wb, inspector, salesforce, dryRun) {
  var rows = wb.readRows(Config.tabs.staffing).map(function (r) {
    return {
      projectId: r['Project ID'],
      milestone: r['Milestone'],
      milestoneHours: r['Milestone hours'],
      resourceType: r['Resource type'],
      requestHours: r['Request hours'],
      confirmed: r['Confirmed'],
      certiniaResourceRequestId: r['Certinia Resource Request Id']
    };
  });
  createResourceRequestsFn({
    staffingRows: rows,
    salesforce: salesforce,
    inspector: inspector,
    dryRun: dryRun,
    errorLog: { append: function (e) { wb.writeRow(Config.tabs.errorLog, [e.timestamp, e.job, '', e.projectId, e.reason, e.snippet]); } }
  });
  if (!dryRun) persistStaffingRRIds(wb, rows);
  flushInspectorFn(wb, inspector);
}

function fetchCalendarEventsAdvanced(calendarIds, timeMin, timeMax) {
  var out = [];
  for (var i = 0; i < calendarIds.length; i++) {
    var id = calendarIds[i];
    var res = Calendar.Events.list(id, {
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: true,
      orderBy: 'startTime'
    });
    var items = res.items || [];
    for (var j = 0; j < items.length; j++) {
      var e = items[j];
      out.push({
        id: e.id,
        title: e.summary,
        body: e.description || '',
        start: new Date(e.start.dateTime || e.start.date),
        end: new Date(e.end.dateTime || e.end.date),
        isAllDay: !!e.start.date,
        organizerEmail: e.organizer ? e.organizer.email : '',
        attendeeEmails: (e.attendees || []).map(function (a) { return a.email; })
      });
    }
  }
  return out;
}

function fetchCalendarEvents(calendarIds, timeMin, timeMax) {
  if (typeof Calendar !== 'undefined' && Calendar.Events) {
    return fetchCalendarEventsAdvanced(calendarIds, timeMin, timeMax);
  }
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

function runHarnessCalendarGet(dryRun) {
  var wb = createGasWorkbook();
  var inspector = createInspector();
  var smartsheet = new HarnessSmartsheetClient({ workbook: wb, inspector: inspector, job: 'CalendarGET', dryRun: dryRun });
  var salesforce = new HarnessSalesforceClient({ workbook: wb, inspector: inspector, job: 'CalendarGET', dryRun: dryRun });
  var errorLog = { append: function (e) { wb.writeRow(Config.tabs.errorLog, [e.timestamp, e.job, e.eventId, e.projectId, e.reason, e.snippet]); } };
  var props = PropertiesService.getScriptProperties();
  var calIds = (props.getProperty('CALENDAR_IDS') || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  var now = new Date();
  var window = fetchWindow(now, Config.CALENDAR_HORIZON_DAYS, Config.TIMESHEET_WEEK_START);
  var events = calIds.length ? fetchCalendarEvents(calIds, window.timeMin, window.timeMax) : [];
  runCalendarGet({
    now: now,
    events: events,
    companies: wb.getColumnValues(Config.tabs.companies, 'Company'),
    milestones: wb.getColumnValues(Config.tabs.milestones, 'Milestone'),
    resources: wb.readRows(Config.tabs.resourceEmails).map(function (r) {
      return { email: r['Email'], name: r['Name'], certiniaId: r['Certinia Resource Id'] };
    }),
    smartsheet: smartsheet,
    salesforce: salesforce,
    inspector: inspector,
    errorLog: errorLog,
    dryRun: dryRun,
    workbook: wb,
    remainingMs: 300000
  });
}

function runHarnessImport(projectId, dryRun) {
  var wb = createGasWorkbook();
  var inspector = createInspector();
  var salesforce = new HarnessSalesforceClient({ workbook: wb, inspector: inspector, job: 'Import', dryRun: dryRun });
  runImportWithFlush(wb, inspector, salesforce, projectId, dryRun);
}

function runHarnessCreateRR(dryRun) {
  var wb = createGasWorkbook();
  var inspector = createInspector();
  var salesforce = new HarnessSalesforceClient({ workbook: wb, inspector: inspector, job: 'CreateRR', dryRun: dryRun });
  runCreateRRWithFlush(wb, inspector, salesforce, dryRun);
}

function runLiveImport(projectId, dryRun) {
  var wb = createGasWorkbook();
  var inspector = createInspector();
  var props = PropertiesService.getScriptProperties();
  var salesforce = new LiveSalesforceClient({
    accessToken: props.getProperty('SF_ACCESS_TOKEN'),
    instanceUrl: props.getProperty('SF_INSTANCE_URL'),
    inspector: inspector,
    job: 'Import',
    dryRun: dryRun
  });
  runImportWithFlush(wb, inspector, salesforce, projectId, dryRun);
}

function runLiveCreateRR(dryRun) {
  var wb = createGasWorkbook();
  var inspector = createInspector();
  var props = PropertiesService.getScriptProperties();
  var salesforce = new LiveSalesforceClient({
    accessToken: props.getProperty('SF_ACCESS_TOKEN'),
    instanceUrl: props.getProperty('SF_INSTANCE_URL'),
    inspector: inspector,
    job: 'CreateRR',
    dryRun: dryRun
  });
  runCreateRRWithFlush(wb, inspector, salesforce, dryRun);
}

function importDummyDataGas() {
  importDummyData(createGasWorkbook());
  SpreadsheetApp.getActiveSpreadsheet().toast('Dummy harness data imported');
}

function runLiveCalendarGet(dryRun) {
  var wb = createGasWorkbook();
  var inspector = createInspector();
  var props = PropertiesService.getScriptProperties();
  var smartsheet = new LiveSmartsheetClient({
    token: props.getProperty('SMARTSHEET_TOKEN'),
    workspaceId: props.getProperty('SMARTSHEET_WORKSPACE_ID'),
    inspector: inspector,
    job: 'CalendarGET',
    dryRun: dryRun
  });
  var salesforce = new LiveSalesforceClient({
    accessToken: props.getProperty('SF_ACCESS_TOKEN'),
    instanceUrl: props.getProperty('SF_INSTANCE_URL'),
    inspector: inspector,
    job: 'CalendarGET',
    dryRun: dryRun
  });
  var errorLog = { append: function (e) { wb.writeRow(Config.tabs.errorLog, [e.timestamp, e.job, e.eventId, e.projectId, e.reason, e.snippet]); } };
  var calIds = (props.getProperty('CALENDAR_IDS') || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  var now = new Date();
  var window = fetchWindow(now, Config.CALENDAR_HORIZON_DAYS, Config.TIMESHEET_WEEK_START);
  var events = calIds.length ? fetchCalendarEvents(calIds, window.timeMin, window.timeMax) : [];
  runCalendarGet({
    now: now,
    events: events,
    companies: wb.getColumnValues(Config.tabs.companies, 'Company'),
    milestones: wb.getColumnValues(Config.tabs.milestones, 'Milestone'),
    resources: wb.readRows(Config.tabs.resourceEmails).map(function (r) {
      return { email: r['Email'], name: r['Name'], certiniaId: r['Certinia Resource Id'] };
    }),
    smartsheet: smartsheet,
    salesforce: salesforce,
    inspector: inspector,
    errorLog: errorLog,
    dryRun: dryRun,
    workbook: wb,
    remainingMs: 300000
  });
}

function importSeedCalendarEventsGas() {
  var wb = createGasWorkbook();
  var rows = wb.readRows(Config.tabs.calendarSeed).map(function (r) {
    return {
      calendarTitle: r['Calendar Title'],
      company: r['Company'],
      meetingTitle: r['Meeting Title'],
      milestone: r['Milestone'],
      projectId: r['Project ID'],
      start: new Date(r['Start']),
      durationHours: Number(r['Duration hours']),
      from: r['From'],
      to: r['To'],
      googleEventId: r['Google Event ID'] || ''
    };
  });
  var props = PropertiesService.getScriptProperties();
  var calIds = (props.getProperty('CALENDAR_IDS') || 'primary').split(',');
  var api = {
    insert: function (calId, body) {
      var ev = Calendar.Events.insert({
        summary: body.summary,
        description: body.description,
        start: { dateTime: body.start.toISOString() },
        end: { dateTime: body.end.toISOString() },
        attendees: body.attendees
      }, calId);
      return { id: ev.id };
    }
  };
  var result = importSeedEvents(rows, api, calIds[0].trim());
  persistSeedGoogleEventIds(wb, rows);
  SpreadsheetApp.getActiveSpreadsheet().toast('Created ' + result.created + ', skipped ' + result.skipped);
}

if (typeof module !== 'undefined') {
  module.exports = {
    flushInspectorToWorkbook: flushInspectorFn,
    persistSeedGoogleEventIds: persistSeedGoogleEventIds,
    runImportWithFlush: runImportWithFlush,
    runCreateRRWithFlush: runCreateRRWithFlush,
    persistStaffingRRIds: persistStaffingRRIds
  };
}
