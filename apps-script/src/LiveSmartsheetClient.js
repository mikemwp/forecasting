var Config = typeof require !== 'undefined' ? require('./Config').Config : Config;

function LiveSmartsheetClient(opts) {
  this.token = opts.token;
  this.workspaceId = opts.workspaceId;
  this.inspector = opts.inspector;
  this.job = opts.job || 'CalendarGET';
  this.dryRun = !!opts.dryRun;
  this._cache = opts.cache || {};
}

LiveSmartsheetClient.prototype.urlFetch = function (url, options) {
  return UrlFetchApp.fetch(url, options);
};

LiveSmartsheetClient.prototype._headers = function () {
  return { Authorization: 'Bearer ' + this.token, 'Content-Type': 'application/json' };
};

LiveSmartsheetClient.prototype.resolveProject = function (projectId) {
  if (this._cache[projectId]) return this._cache[projectId];
  return null;
};

LiveSmartsheetClient.prototype.loadConsultation = function () {
  return {};
};

LiveSmartsheetClient.prototype.applyDiff = function (projectId, diff) {
  var resolved = this.resolveProject(projectId);
  if (!resolved) return;
  this.inspector.record({
    job: this.job,
    dryRun: this.dryRun,
    system: 'Smartsheet',
    operation: 'rows.add',
    method: 'POST',
    path: '/2.0/sheets/' + resolved.sheetId + '/rows',
    request: diff
  });
  if (!this.dryRun) {
    this.urlFetch('https://api.smartsheet.com/2.0/sheets/' + resolved.sheetId + '/rows', {
      method: 'post',
      headers: this._headers(),
      payload: JSON.stringify(diff)
    });
  }
};

if (typeof module !== 'undefined') {
  module.exports = { LiveSmartsheetClient: LiveSmartsheetClient };
}
