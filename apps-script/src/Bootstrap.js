var Config = typeof require !== 'undefined' ? require('./Config').Config : Config;
var seed = typeof require !== 'undefined' ? require('./CalendarSeed') : null;
var renderForecastGridFn = typeof require !== 'undefined' ? require('./PlannerPreview').renderForecastGrid : renderForecastGrid;

var INSPECTOR_HEADERS = [
  'Timestamp', 'Job', 'Dry-run', 'System', 'Operation', 'Method', 'Path', 'Request JSON', 'Fake response JSON', 'Notes'
];

var STAFFING_HEADERS = [
  'Project ID', 'Company Name', 'Total purchased hours', 'Milestone', 'Milestone hours',
  'Resource type', 'Request hours', 'Confirmed', 'Certinia Resource Request Id'
];

var ERROR_LOG_HEADERS = ['Timestamp', 'Job', 'Event ID', 'Project ID', 'Reason', 'Snippet'];
var TIMECARD_MAP_HEADERS = ['Event ID', 'Resource Id', 'Week start', 'Project ID', 'Milestone', 'Weekday', 'Hours'];
var DRY_RUN_HEADERS = ['Action', 'Target', 'Details'];

function upsertSingleColumn(wb, tabName, header, values) {
  wb.ensureTab(tabName, [header]);
  var tab = wb.getTab(tabName);
  var existing = tab.rows.map(function (r) { return r[0]; });
  values.forEach(function (v) {
    if (existing.indexOf(v) < 0) {
      wb.writeRow(tabName, [v]);
      existing.push(v);
    }
  });
}

function importDummyData(wb) {
  wb.ensureTab(Config.tabs.resourceEmails, ['Email', 'Name', 'Certinia Resource Id']);
  var emails = wb.readRows(Config.tabs.resourceEmails);
  if (!emails.some(function (r) { return r['Email'] === 'mikemwp@gmail.com'; })) {
    wb.writeRow(Config.tabs.resourceEmails, ['mikemwp@gmail.com', 'Mike', 'R_MIKE']);
  }

  upsertSingleColumn(wb, Config.tabs.companies, 'Company', ['Acme Ltd']);
  upsertSingleColumn(wb, Config.tabs.milestones, 'Milestone', ['Kickoff', 'Discovery', 'Build', 'UAT', 'Go-Live']);

  wb.ensureTab(Config.tabs.lookup, ['Milestone', 'Default Resource Type']);
  var lookupRows = [
    ['Kickoff', 'Consultant'],
    ['Discovery', 'Consultant'],
    ['Build', 'Developer'],
    ['UAT', 'Consultant'],
    ['Go-Live', 'Consultant']
  ];
  lookupRows.forEach(function (lr) {
    var existing = wb.readRows(Config.tabs.lookup);
    if (!existing.some(function (r) { return r['Milestone'] === lr[0]; })) {
      wb.writeRow(Config.tabs.lookup, lr);
    }
  });

  wb.ensureTab(Config.tabs.staffing, STAFFING_HEADERS);
  wb.ensureTab(Config.tabs.errorLog, ERROR_LOG_HEADERS);
  wb.ensureTab(Config.tabs.dryRun, DRY_RUN_HEADERS);
  wb.ensureTab(Config.tabs.timecardMap, TIMECARD_MAP_HEADERS);
  wb.ensureTab(Config.tabs.apiInspector, INSPECTOR_HEADERS);

  wb.ensureTab(Config.tabs.projectIndex, ['Project ID', 'Tab name', 'Fake Smartsheet ID']);
  var idx = wb.readRows(Config.tabs.projectIndex);
  if (!idx.some(function (r) { return r['Project ID'] === 'P-DEMO'; })) {
    wb.writeRow(Config.tabs.projectIndex, ['P-DEMO', 'CS_P-DEMO', 'ss_demo']);
  }

  wb.ensureTab('CS_P-DEMO', Config.consultationHeaders);

  wb.ensureTab(Config.tabs.harnessProjects, ['Project ID', 'Company', 'Purchased hours', 'Salesforce Id']);
  if (!wb.readRows(Config.tabs.harnessProjects).some(function (r) { return r['Project ID'] === 'P-DEMO'; })) {
    wb.writeRow(Config.tabs.harnessProjects, ['P-DEMO', 'Acme Ltd', 40, 'sf_p_demo']);
  }

  wb.ensureTab(Config.tabs.harnessMilestones, ['Project ID', 'Milestone', 'Hours']);
  var milestoneFixtures = [
    ['P-DEMO', 'Kickoff', 8],
    ['P-DEMO', 'Discovery', 8],
    ['P-DEMO', 'Build', 12],
    ['P-DEMO', 'UAT', 8],
    ['P-DEMO', 'Go-Live', 4]
  ];
  milestoneFixtures.forEach(function (mf) {
    var existing = wb.readRows(Config.tabs.harnessMilestones);
    if (!existing.some(function (r) { return r['Project ID'] === mf[0] && r['Milestone'] === mf[1]; })) {
      wb.writeRow(Config.tabs.harnessMilestones, mf);
    }
  });

  var seedHeaders = seed ? seed.SEED_HEADERS : [
    'Calendar Title', 'Company', 'Meeting Title', 'Milestone', 'Project ID',
    'Start', 'Duration hours', 'From', 'To', 'Google Event ID'
  ];
  wb.ensureTab(Config.tabs.calendarSeed, seedHeaders);
  if (wb.getTab(Config.tabs.calendarSeed).rows.length === 0) {
    var seedRows = seed.defaultSeedRows(new Date());
    seedRows.forEach(function (r) {
      wb.writeRow(Config.tabs.calendarSeed, seed.seedRowToSheet(r));
    });
  }

  var emptyGrid = renderForecastGridFn([], new Date(), Config.TIMESHEET_WEEK_START);
  wb.overwriteTab(Config.tabs.forecast, [], [[emptyGrid.banner], emptyGrid.headers]);
}

if (typeof module !== 'undefined') {
  module.exports = { importDummyData: importDummyData };
}
