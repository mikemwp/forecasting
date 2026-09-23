var weekStartFn = typeof require !== 'undefined' ? require('./Week').weekStart : weekStart;
var Config = typeof require !== 'undefined' ? require('./Config').Config : Config;

function formatWeekHead(d) {
  var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
}

function weekKey(d, weekStartDay) {
  return weekStartFn(d, weekStartDay).getTime();
}

function renderForecastGrid(slices, now, weekStartDay) {
  var start = weekStartFn(now, weekStartDay || 'Monday');
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

function writeForecastTab(workbook, grid) {
  var tabRows = [[grid.banner], grid.headers].concat(grid.rows);
  workbook.overwriteTab(Config.tabs.forecast, [], tabRows);
}

if (typeof module !== 'undefined') {
  module.exports = { renderForecastGrid: renderForecastGrid, formatWeekHead: formatWeekHead, writeForecastTab: writeForecastTab };
}
