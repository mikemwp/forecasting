var Config = typeof require !== 'undefined' ? require('./Config').Config : Config;

var WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function isFuture(event, now) {
  return event.end > now;
}

function formatDate(d) {
  return d.toISOString().slice(0, 10);
}

function buildAssignmentUpserts(events, now) {
  var byKey = {};
  for (var i = 0; i < events.length; i++) {
    var ev = events[i];
    if (!isFuture(ev, now) || ev.cancelled) continue;
    var key = ev.projectId + '|' + ev.resourceCertiniaId;
    if (!byKey[key]) {
      byKey[key] = {
        path: '/services/data/' + Config.SF_API_VERSION + '/sobjects/' + Config.objects.assignment,
        body: {
          pse__Project__c: ev.projectId,
          pse__Resource__c: ev.resourceCertiniaId
        },
        scheduleSlices: []
      };
    }
    // Google_Event_Id__c on schedule slice — sandbox may rename this custom field
    byKey[key].scheduleSlices.push({
      date: formatDate(ev.start),
      hours: ev.hours,
      googleEventId: ev.eventId
    });
  }
  return Object.keys(byKey).map(function (k) { return byKey[k]; });
}

function buildTimecardDeltas(events, fromResource, mapRows, now) {
  if (!fromResource) return [];
  var out = [];
  for (var i = 0; i < events.length; i++) {
    var ev = events[i];
    if (isFuture(ev, now) || ev.cancelled) continue;
    var day = ev.start.getUTCDay();
    if (day === 0 || day === 6) continue;
    out.push({
      path: '/services/data/' + Config.SF_API_VERSION + '/sobjects/' + Config.objects.timecard,
      body: {
        pse__Project__c: ev.projectId,
        pse__Resource__c: fromResource.certiniaId,
        Milestone__c: ev.milestone,
        Google_Event_Id__c: ev.eventId
      },
      weekday: WEEKDAYS[day],
      hours: ev.hours,
      eventId: ev.eventId,
      weekStart: ev.start
    });
  }
  return out;
}

function buildResourceRequest(row) {
  var body = {
    pse__Project__c: row.projectId,
    pse__Resource_Role__c: row.resourceType,
    pse__Status__c: Config.status.draft
  };
  if (row.name) body.Name = row.name;
  if (row.requestHours != null) {
    body.pse__SOW_Hours__c = row.requestHours;
    body.Hours = row.requestHours;
  }
  if (row.milestone) body.Milestone__c = row.milestone;
  return body;
}

function hourRules(staffingRows) {
  var byMilestone = {};
  var errors = [];
  for (var i = 0; i < staffingRows.length; i++) {
    var row = staffingRows[i];
    if (!row.confirmed) continue;
    if (Number(row.requestHours) > Number(row.milestoneHours)) {
      errors.push('request hours exceed milestone hours for ' + row.milestone);
    }
    var mk = row.projectId + '|' + row.milestone;
    byMilestone[mk] = byMilestone[mk] || { total: 0, cap: Number(row.milestoneHours) };
    byMilestone[mk].total += Number(row.requestHours);
  }
  var keys = Object.keys(byMilestone);
  for (var j = 0; j < keys.length; j++) {
    if (byMilestone[keys[j]].total > byMilestone[keys[j]].cap) {
      errors.push('milestone over-allocated: ' + keys[j]);
    }
  }
  return errors.length ? { ok: false, errors: errors } : { ok: true };
}

function HarnessSalesforceClient(opts) {
  this.workbook = opts.workbook;
  this.inspector = opts.inspector;
  this.job = opts.job || 'CalendarGET';
  this.dryRun = !!opts.dryRun;
}

HarnessSalesforceClient.chunkPayloads = function (payloads, size) {
  var chunks = [];
  for (var i = 0; i < payloads.length; i += size) {
    chunks.push(payloads.slice(i, i + size));
  }
  return chunks;
};

HarnessSalesforceClient.prototype._record = function (operation, method, path, request, notes) {
  this.inspector.record({
    job: this.job,
    dryRun: this.dryRun,
    system: 'Salesforce',
    operation: operation,
    method: method,
    path: path,
    request: request,
    notes: notes || ''
  });
};

HarnessSalesforceClient.prototype.upsertAssignments = function (payloads) {
  var self = this;
  var chunks = HarnessSalesforceClient.chunkPayloads(payloads, Config.DML_CHUNK);
  chunks.forEach(function (chunk, ci) {
    self._record(
      'composite/sobjects',
      'POST',
      '/services/data/' + Config.SF_API_VERSION + '/composite/sobjects',
      { records: chunk },
      'chunk ' + ci
    );
    if (!self.dryRun) {
      self.workbook.ensureTab('Harness_Assignments', ['Project ID', 'Resource Id', 'Event ID', 'Date', 'Hours']);
      chunk.forEach(function (p) {
        p.scheduleSlices.forEach(function (s) {
          self.workbook.writeRow('Harness_Assignments', [
            p.body.pse__Project__c,
            p.body.pse__Resource__c,
            s.googleEventId,
            s.date,
            s.hours
          ]);
        });
      });
    }
  });
  return payloads.map(function (_, i) { return 'harness_asg_' + i; });
};

HarnessSalesforceClient.prototype.upsertTimecards = function (deltas) {
  var self = this;
  deltas.forEach(function (d) {
    self._record(
      'sobjects/' + Config.objects.timecard + ' PATCH',
      'PATCH',
      d.path,
      d.body,
      d.weekday
    );
    if (!self.dryRun) {
      self.workbook.ensureTab('Harness_Timecards', ['Event ID', 'Resource Id', 'Weekday', 'Hours']);
      self.workbook.writeRow('Harness_Timecards', [d.eventId, d.body.pse__Resource__c, d.weekday, d.hours]);
    }
  });
  return deltas.map(function (_, i) { return 'harness_tc_' + i; });
};

HarnessSalesforceClient.prototype.createResourceRequests = function (rows) {
  var self = this;
  var ids = [];
  rows.forEach(function (row, i) {
    var body = buildResourceRequest(row);
    self._record(
      'sobjects/' + Config.objects.resourceRequest,
      'POST',
      '/services/data/' + Config.SF_API_VERSION + '/sobjects/' + Config.objects.resourceRequest,
      body,
      row.milestone
    );
    var id = 'harness_rr_' + i;
    ids.push(id);
    if (!self.dryRun && row.onCreated) row.onCreated(id);
  });
  return ids;
};

HarnessSalesforceClient.prototype.queryProject = function (projectId) {
  var soql = "SELECT Id, Name, pse__Account__c, pse__Total_Purchased_Hours__c FROM " + Config.objects.project + " WHERE Id = '" + projectId + "'";
  this._record('query', 'GET', '/services/data/' + Config.SF_API_VERSION + '/query?q=' + encodeURIComponent(soql), { soql: soql }, projectId);
  return { projectId: projectId };
};

if (typeof module !== 'undefined') {
  module.exports = {
    isFuture: isFuture,
    buildAssignmentUpserts: buildAssignmentUpserts,
    buildTimecardDeltas: buildTimecardDeltas,
    buildResourceRequest: buildResourceRequest,
    hourRules: hourRules,
    HarnessSalesforceClient: HarnessSalesforceClient
  };
}
