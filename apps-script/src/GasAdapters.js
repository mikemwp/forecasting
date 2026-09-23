function createGasWorkbook() {
  return {
    _ss: SpreadsheetApp.getActiveSpreadsheet(),
    getTab: function (name) {
      var sheet = this._ss.getSheetByName(name);
      if (!sheet) return { headers: [], rows: [] };
      var data = sheet.getDataRange().getValues();
      if (!data.length) return { headers: [], rows: [] };
      return { headers: data[0], rows: data.slice(1) };
    },
    ensureTab: function (name, headers) {
      var sheet = this._ss.getSheetByName(name);
      if (!sheet) sheet = this._ss.insertSheet(name);
      if (headers && headers.length && sheet.getLastRow() === 0) {
        sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      }
      return sheet;
    },
    writeRow: function (tabName, values) {
      var sheet = this.ensureTab(tabName, []);
      sheet.appendRow(values);
    },
    readRows: function (tabName) {
      var tab = this.getTab(tabName);
      return tab.rows.map(function (row) {
        var obj = {};
        for (var i = 0; i < tab.headers.length; i++) obj[tab.headers[i]] = row[i];
        return obj;
      });
    },
    readObjects: function (tabName, keyField) {
      var rows = this.readRows(tabName);
      var out = {};
      rows.forEach(function (r) { if (r[keyField]) out[r[keyField]] = r; });
      return out;
    },
    upsertByKey: function () {},
    overwriteTab: function () {},
    getColumnValues: function (tabName, col) {
      return this.readRows(tabName).map(function (r) { return r[col]; }).filter(Boolean);
    }
  };
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
  importProject({
    projectId: projectId,
    salesforce: salesforce,
    lookup: wb.readRows(Config.tabs.lookup),
    staffingTab: Config.tabs.staffing,
    workbook: wb,
    inspector: inspector,
    dryRun: dryRun
  });
}

function runHarnessCreateRR(dryRun) {
  var wb = createGasWorkbook();
  var inspector = createInspector();
  var salesforce = new HarnessSalesforceClient({ workbook: wb, inspector: inspector, job: 'CreateRR', dryRun: dryRun });
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
  createResourceRequests({
    staffingRows: rows,
    salesforce: salesforce,
    inspector: inspector,
    dryRun: dryRun,
    errorLog: { append: function (e) { wb.writeRow(Config.tabs.errorLog, [e.timestamp, e.job, '', e.projectId, e.reason, e.snippet]); } }
  });
}

function importDummyDataGas() {
  importDummyData(createGasWorkbook());
  SpreadsheetApp.getActiveSpreadsheet().toast('Dummy harness data imported');
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
  SpreadsheetApp.getActiveSpreadsheet().toast('Created ' + result.created + ', skipped ' + result.skipped);
}
