var Config = typeof require !== 'undefined' ? require('./Config').Config : Config;

var STAFFING_HEADERS = [
  'Project ID', 'Company Name', 'Total purchased hours', 'Milestone', 'Milestone hours',
  'Resource type', 'Request hours', 'Confirmed', 'Certinia Resource Request Id'
];

function lookupResourceType(milestone, lookupRows) {
  for (var i = 0; i < lookupRows.length; i++) {
    if (lookupRows[i]['Milestone'] === milestone) return lookupRows[i]['Default Resource Type'];
  }
  return '';
}

function findStaffingRow(tab, projectId, milestone) {
  var pidIdx = tab.headers.indexOf('Project ID');
  var mIdx = tab.headers.indexOf('Milestone');
  for (var i = 0; i < tab.rows.length; i++) {
    if (tab.rows[i][pidIdx] === projectId && tab.rows[i][mIdx] === milestone) return tab.rows[i];
  }
  return null;
}

function importProject(opts) {
  var wb = opts.workbook;
  var staffingTab = opts.staffingTab || Config.tabs.staffing;
  var projectId = opts.projectId;
  opts.salesforce.queryProject(projectId);

  var projects = wb.readRows(Config.tabs.harnessProjects).filter(function (r) { return r['Project ID'] === projectId; });
  if (!projects.length) return { ok: false, error: 'project not found' };
  var project = projects[0];

  wb.ensureTab(staffingTab, STAFFING_HEADERS);
  var tab = wb.getTab(staffingTab);
  var milestones = wb.readRows(Config.tabs.harnessMilestones).filter(function (r) { return r['Project ID'] === projectId; });

  milestones.forEach(function (m) {
    var existing = findStaffingRow(tab, projectId, m['Milestone']);
    var resourceType = existing && existing[tab.headers.indexOf('Resource type')]
      ? existing[tab.headers.indexOf('Resource type')]
      : lookupResourceType(m['Milestone'], opts.lookup);

    if (existing) {
      existing[tab.headers.indexOf('Milestone hours')] = m['Hours'];
      if (!existing[tab.headers.indexOf('Request hours')]) {
        existing[tab.headers.indexOf('Request hours')] = m['Hours'];
      }
    } else {
      wb.writeRow(staffingTab, [
        projectId,
        project['Company'],
        project['Purchased hours'],
        m['Milestone'],
        m['Hours'],
        resourceType,
        m['Hours'],
        false,
        ''
      ]);
    }
  });

  return { ok: true, milestoneCount: milestones.length };
}

if (typeof module !== 'undefined') module.exports = { importProject: importProject };
