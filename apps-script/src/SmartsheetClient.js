var Config = typeof require !== 'undefined' ? require('./Config').Config : Config;

function formatDate(d) {
  if (!(d instanceof Date)) return d;
  return d.toISOString().slice(0, 10);
}

function formatTime(d) {
  if (!(d instanceof Date)) return d;
  return d.toISOString().slice(11, 16);
}

function incomingToRow(ev) {
  return {
    'Consultation Name': ev.title,
    'Description': ev.body,
    'Start Date': formatDate(ev.start),
    'Start Time': formatTime(ev.start),
    'Milestone': ev.milestone,
    'Resource': ev.resourceLabel,
    'Duration': ev.hours,
    'Google Event ID': ev.eventId,
    'Status': ev.status || ''
  };
}

function HarnessSmartsheetClient(opts) {
  this.workbook = opts.workbook;
  this.inspector = opts.inspector;
  this.job = opts.job || 'CalendarGET';
  this.dryRun = !!opts.dryRun;
}

HarnessSmartsheetClient.prototype.resolveProject = function (projectId) {
  var rows = this.workbook.readRows(Config.tabs.projectIndex);
  for (var i = 0; i < rows.length; i++) {
    if (rows[i]['Project ID'] === projectId) {
      return {
        sheetId: rows[i]['Fake Smartsheet ID'],
        tabName: rows[i]['Tab name']
      };
    }
  }
  return null;
};

HarnessSmartsheetClient.prototype.loadConsultation = function (projectId) {
  var resolved = this.resolveProject(projectId);
  if (!resolved) return {};
  var rows = this.workbook.readObjects(resolved.tabName, 'Google Event ID');
  var byId = {};
  var ids = Object.keys(rows);
  for (var i = 0; i < ids.length; i++) {
    var id = ids[i];
    var r = rows[id];
    byId[id] = {
      eventId: id,
      title: r['Consultation Name'],
      body: r['Description'],
      start: new Date(r['Start Date'] + 'T' + (r['Start Time'] || '00:00') + ':00Z'),
      end: new Date(r['Start Date'] + 'T' + (r['Start Time'] || '00:00') + ':00Z'),
      milestone: r['Milestone'],
      resourceLabel: r['Resource'],
      hours: r['Duration'],
      status: r['Status'] || ''
    };
    if (r['Duration']) {
      byId[id].end = new Date(byId[id].start.getTime() + Number(r['Duration']) * 3600000);
    }
  }
  return byId;
};

HarnessSmartsheetClient.prototype._record = function (sheetId, tabName, operation, request, notes) {
  this.inspector.record({
    job: this.job,
    dryRun: this.dryRun,
    system: 'Smartsheet',
    operation: operation,
    method: operation.indexOf('update') >= 0 ? 'PUT' : 'POST',
    path: '/2.0/sheets/' + sheetId + '/rows',
    request: request,
    notes: notes || tabName
  });
};

HarnessSmartsheetClient.prototype.applyDiff = function (projectId, diff) {
  var resolved = this.resolveProject(projectId);
  if (!resolved) return;
  var tabName = resolved.tabName;
  var sheetId = resolved.sheetId;
  var self = this;

  diff.inserts.forEach(function (ev) {
    var row = incomingToRow(ev);
    self._record(sheetId, tabName, 'rows.add', { toBottom: true, cells: row }, tabName);
    if (!self.dryRun) {
      self.workbook.ensureTab(tabName, Config.consultationHeaders);
      self.workbook.upsertByKey(tabName, 'Google Event ID', ev.eventId, row);
    }
  });

  diff.fieldUpdates.forEach(function (upd) {
    var ev = upd.incoming;
    var row = incomingToRow(ev);
    self._record(sheetId, tabName, 'rows.update', { eventId: ev.eventId, cells: row }, tabName);
    if (!self.dryRun) {
      self.workbook.upsertByKey(tabName, 'Google Event ID', ev.eventId, row);
    }
  });

  diff.cancellations.forEach(function (eventId) {
    self._record(sheetId, tabName, 'rows.update', { eventId: eventId, status: Config.status.cancelled }, tabName);
    if (!self.dryRun) {
      var existing = self.workbook.readObjects(tabName, 'Google Event ID')[eventId];
      if (existing) {
        existing['Status'] = Config.status.cancelled;
        self.workbook.upsertByKey(tabName, 'Google Event ID', eventId, existing);
      }
    }
  });
};

if (typeof module !== 'undefined') {
  module.exports = { HarnessSmartsheetClient: HarnessSmartsheetClient, incomingToRow: incomingToRow };
}
