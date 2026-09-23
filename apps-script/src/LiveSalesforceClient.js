var Config = typeof require !== 'undefined' ? require('./Config').Config : Config;
var buildResourceRequestFn = typeof require !== 'undefined' ? require('./SalesforceClient').buildResourceRequest : buildResourceRequest;
var chunkFn = typeof require !== 'undefined' ? require('./SalesforceClient').HarnessSalesforceClient : HarnessSalesforceClient;

function LiveSalesforceClient(opts) {
  this.accessToken = opts.accessToken;
  this.instanceUrl = opts.instanceUrl;
  this.inspector = opts.inspector;
  this.job = opts.job || 'CalendarGET';
  this.dryRun = !!opts.dryRun;
}

LiveSalesforceClient.prototype.urlFetch = function (url, options) {
  return UrlFetchApp.fetch(url, options);
};

LiveSalesforceClient.prototype._authHeaders = function () {
  return { Authorization: 'Bearer ' + this.accessToken, 'Content-Type': 'application/json' };
};

LiveSalesforceClient.prototype.upsertAssignments = function (payloads) {
  var chunks = chunkFn.chunkPayloads(payloads, Config.DML_CHUNK);
  var self = this;
  chunks.forEach(function (chunk, i) {
    self.inspector.record({
      job: self.job,
      dryRun: self.dryRun,
      system: 'Salesforce',
      operation: 'composite/sobjects',
      method: 'POST',
      path: '/services/data/' + Config.SF_API_VERSION + '/composite/sobjects',
      request: { records: chunk }
    });
    if (!self.dryRun) {
      self.urlFetch(self.instanceUrl + '/services/data/' + Config.SF_API_VERSION + '/composite/sobjects', {
        method: 'post',
        headers: self._authHeaders(),
        payload: JSON.stringify({ records: chunk })
      });
    }
  });
  return payloads.map(function (_, i) { return 'live_asg_' + i; });
};

LiveSalesforceClient.prototype.upsertTimecards = function (deltas) {
  var self = this;
  deltas.forEach(function (d) {
    self.inspector.record({
      job: self.job,
      dryRun: self.dryRun,
      system: 'Salesforce',
      operation: 'sobjects/' + Config.objects.timecard,
      method: 'PATCH',
      path: d.path,
      request: d.body
    });
    if (!self.dryRun) {
      self.urlFetch(self.instanceUrl + d.path, {
        method: 'patch',
        headers: self._authHeaders(),
        payload: JSON.stringify(d.body)
      });
    }
  });
  return deltas.map(function (_, i) { return 'live_tc_' + i; });
};

LiveSalesforceClient.prototype.createResourceRequests = function (rows) {
  var self = this;
  return rows.map(function (row, i) {
    var body = buildResourceRequestFn(row);
    var existingId = row.certiniaResourceRequestId;
    if (existingId) {
      var patchPath = '/services/data/' + Config.SF_API_VERSION + '/sobjects/' + Config.objects.resourceRequest + '/' + existingId;
      self.inspector.record({
        job: self.job,
        dryRun: self.dryRun,
        system: 'Salesforce',
        operation: 'sobjects/' + Config.objects.resourceRequest + ' PATCH',
        method: 'PATCH',
        path: patchPath,
        request: body
      });
      if (!self.dryRun) {
        self.urlFetch(self.instanceUrl + patchPath, {
          method: 'patch',
          headers: self._authHeaders(),
          payload: JSON.stringify(body)
        });
      }
      return existingId;
    }
    self.inspector.record({
      job: self.job,
      dryRun: self.dryRun,
      system: 'Salesforce',
      operation: 'sobjects/' + Config.objects.resourceRequest,
      method: 'POST',
      path: '/services/data/' + Config.SF_API_VERSION + '/sobjects/' + Config.objects.resourceRequest,
      request: body
    });
    if (!self.dryRun) {
      self.urlFetch(self.instanceUrl + '/services/data/' + Config.SF_API_VERSION + '/sobjects/' + Config.objects.resourceRequest, {
        method: 'post',
        headers: self._authHeaders(),
        payload: JSON.stringify(body)
      });
    }
    return 'live_rr_' + i;
  });
};

LiveSalesforceClient.prototype.queryProject = function (projectId) {
  var soql = "SELECT Id, Name FROM " + Config.objects.project + " WHERE Id = '" + projectId + "'";
  this.inspector.record({
    job: this.job,
    dryRun: this.dryRun,
    system: 'Salesforce',
    operation: 'query',
    method: 'GET',
    path: '/services/data/' + Config.SF_API_VERSION + '/query',
    request: { soql: soql }
  });
  return { projectId: projectId };
};

if (typeof module !== 'undefined') {
  module.exports = { LiveSalesforceClient: LiveSalesforceClient };
}
