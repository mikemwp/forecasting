var SEED_FROM = 'mikemwp@gmail.com';
var SEED_MILESTONES = [
  { title: 'Acme Kickoff', meeting: 'Kickoff workshop', milestone: 'Kickoff' },
  { title: 'Acme Discovery', meeting: 'Discovery call', milestone: 'Discovery' },
  { title: 'Acme Build planning', meeting: 'Build planning', milestone: 'Build' },
  { title: 'Acme Build review', meeting: 'Build review', milestone: 'Build' },
  { title: 'Acme UAT intro', meeting: 'UAT intro', milestone: 'UAT' },
  { title: 'Acme UAT session', meeting: 'UAT session', milestone: 'UAT' },
  { title: 'Acme Go-Live dry run', meeting: 'Go-Live dry run', milestone: 'Go-Live' },
  { title: 'Acme Go-Live', meeting: 'Go-Live', milestone: 'Go-Live' },
  { title: 'Acme hypercare', meeting: 'Hypercare check-in', milestone: 'Go-Live' },
  { title: 'Acme wrap-up', meeting: 'Wrap-up', milestone: 'Kickoff' }
];

var SEED_HEADERS = [
  'Calendar Title', 'Company', 'Meeting Title', 'Milestone', 'Project ID',
  'Start', 'Duration hours', 'From', 'To', 'Google Event ID'
];

function addWorkingDays(date, n) {
  var d = new Date(date.getTime());
  var added = 0;
  while (added < n) {
    d.setDate(d.getDate() + 1);
    var day = d.getDay();
    if (day !== 0 && day !== 6) added++;
  }
  return d;
}

function nextWeekdayTen(now) {
  var d = new Date(now.getTime());
  d.setHours(10, 0, 0, 0);
  if (d.getTime() <= now.getTime()) {
    d.setDate(d.getDate() + 1);
    d.setHours(10, 0, 0, 0);
  }
  while (d.getDay() === 0 || d.getDay() === 6) {
    d.setDate(d.getDate() + 1);
    d.setHours(10, 0, 0, 0);
  }
  return d;
}

function defaultSeedRows(now) {
  var start0 = nextWeekdayTen(now);
  return SEED_MILESTONES.map(function (m, i) {
    var start = i === 0 ? start0 : addWorkingDays(start0, i);
    start.setHours(10, 0, 0, 0);
    return {
      calendarTitle: m.title,
      company: 'Acme Ltd',
      meetingTitle: m.meeting,
      milestone: m.milestone,
      projectId: 'P-DEMO',
      start: start,
      durationHours: 1,
      from: SEED_FROM,
      to: SEED_FROM,
      googleEventId: ''
    };
  });
}

function seedRowToSheet(row) {
  return [
    row.calendarTitle,
    row.company,
    row.meetingTitle,
    row.milestone,
    row.projectId,
    row.start instanceof Date ? row.start.toISOString() : row.start,
    row.durationHours,
    row.from,
    row.to,
    row.googleEventId || ''
  ];
}

function buildCalendarInsert(row) {
  var start = row.start instanceof Date ? row.start : new Date(row.start);
  var end = new Date(start.getTime() + Number(row.durationHours) * 3600000);
  var toList = String(row.to || '').split(',').map(function (e) { return e.trim(); }).filter(Boolean);
  return {
    summary: row.calendarTitle,
    description: [row.company, row.meetingTitle, row.milestone, row.projectId].join('|'),
    start: start,
    end: end,
    attendees: toList.map(function (email) { return { email: email }; })
  };
}

function importSeedEvents(rows, calendarApi, calendarId) {
  var created = 0;
  var skipped = 0;
  var errors = [];
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    if (row.googleEventId) {
      skipped++;
      continue;
    }
    try {
      var body = buildCalendarInsert(row);
      var res = calendarApi.insert(calendarId, body);
      row.googleEventId = res.id;
      created++;
    } catch (e) {
      errors.push({ index: i, message: String(e.message || e) });
    }
  }
  return { created: created, skipped: skipped, errors: errors };
}

if (typeof module !== 'undefined') {
  module.exports = {
    defaultSeedRows: defaultSeedRows,
    buildCalendarInsert: buildCalendarInsert,
    importSeedEvents: importSeedEvents,
    seedRowToSheet: seedRowToSheet,
    SEED_HEADERS: SEED_HEADERS
  };
}
