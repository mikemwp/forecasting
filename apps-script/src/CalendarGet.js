var parseDescriptionFn = typeof require !== 'undefined' ? require('./ParseDescription').parseDescription : parseDescription;
var canonicalizeFn = typeof require !== 'undefined' ? require('./Canonical').canonicalize : canonicalize;
var durationHoursFn = typeof require !== 'undefined' ? require('./Duration').durationHours : durationHours;
var fetchWindowFn = typeof require !== 'undefined' ? require('./Week').fetchWindow : fetchWindow;
var indexResourcesFn = typeof require !== 'undefined' ? require('./Resources').indexResources : indexResources;
var matchToFn = typeof require !== 'undefined' ? require('./Resources').matchTo : matchTo;
var matchFromFn = typeof require !== 'undefined' ? require('./Resources').matchFrom : matchFrom;
var resourceLabelFn = typeof require !== 'undefined' ? require('./Resources').resourceLabel : resourceLabel;
var consultationDiffFn = typeof require !== 'undefined' ? require('./ConsultationDiff').consultationDiff : consultationDiff;
var buildAssignmentUpsertsFn = typeof require !== 'undefined' ? require('./SalesforceClient').buildAssignmentUpserts : buildAssignmentUpserts;
var buildTimecardDeltasFn = typeof require !== 'undefined' ? require('./SalesforceClient').buildTimecardDeltas : buildTimecardDeltas;
var isFutureFn = typeof require !== 'undefined' ? require('./SalesforceClient').isFuture : isFuture;
var renderForecastGridFn = typeof require !== 'undefined' ? require('./PlannerPreview').renderForecastGrid : renderForecastGrid;
var writeForecastTabFn = typeof require !== 'undefined' ? require('./PlannerPreview').writeForecastTab : writeForecastTab;
var Config = typeof require !== 'undefined' ? require('./Config').Config : Config;

function runCalendarGet(opts) {
  if (opts.remainingMs != null && opts.remainingMs < Config.SAFETY_MS) {
    return { cursor: opts.cursor || null, errorLog: opts.errorLog };
  }

  var now = opts.now;
  var window = fetchWindowFn(now, Config.CALENDAR_HORIZON_DAYS, Config.TIMESHEET_WEEK_START);
  var resourceIndex = indexResourcesFn(opts.resources);
  var incoming = [];
  var sfEvents = [];
  var assignmentSlices = [];

  for (var i = 0; i < opts.events.length; i++) {
    if (opts.remainingMs != null && opts.remainingMs < Config.SAFETY_MS) {
      return { cursor: { eventIndex: i }, errorLog: opts.errorLog };
    }

    var ev = opts.events[i];
    var parsed = parseDescriptionFn(ev.body);
    if (!parsed.ok) {
      opts.errorLog.append({ timestamp: now.toISOString(), job: opts.job || 'CalendarGET', eventId: ev.id, projectId: '', reason: parsed.error, snippet: ev.body });
      continue;
    }

    var company = canonicalizeFn(parsed.company, opts.companies);
    if (!company) {
      opts.errorLog.append({ timestamp: now.toISOString(), job: opts.job || 'CalendarGET', eventId: ev.id, projectId: parsed.projectId, reason: 'unknown company', snippet: parsed.company });
      continue;
    }

    var milestone = canonicalizeFn(parsed.milestone, opts.milestones);
    if (!milestone) {
      opts.errorLog.append({ timestamp: now.toISOString(), job: opts.job || 'CalendarGET', eventId: ev.id, projectId: parsed.projectId, reason: 'unknown milestone', snippet: parsed.milestone });
      continue;
    }

    var dur = durationHoursFn(ev.start, ev.end, ev.isAllDay);
    if (!dur.ok) {
      opts.errorLog.append({ timestamp: now.toISOString(), job: opts.job || 'CalendarGET', eventId: ev.id, projectId: parsed.projectId, reason: dur.error, snippet: ev.title });
      continue;
    }

    var resolved = opts.smartsheet.resolveProject(parsed.projectId);
    if (!resolved) {
      opts.errorLog.append({ timestamp: now.toISOString(), job: opts.job || 'CalendarGET', eventId: ev.id, projectId: parsed.projectId, reason: 'unknown project id', snippet: parsed.projectId });
      continue;
    }

    var toMatched = matchToFn(ev.attendeeEmails || [], resourceIndex);
    var label = resourceLabelFn(toMatched);
    var fromResource = matchFromFn(ev.organizerEmail, resourceIndex);

    var incomingEv = {
      eventId: ev.id,
      title: ev.title,
      body: ev.body,
      start: ev.start,
      end: ev.end,
      milestone: milestone,
      resourceLabel: label,
      hours: dur.hours,
      cancelledOnCalendar: !!ev.cancelled
    };
    incoming.push(incomingEv);

    toMatched.forEach(function (res) {
      var sfEv = {
        eventId: ev.id,
        projectId: parsed.projectId,
        resourceCertiniaId: res.certiniaId,
        resourceName: res.name || res.email,
        company: company,
        start: ev.start,
        end: ev.end,
        hours: dur.hours,
        milestone: milestone,
        cancelled: false
      };
      sfEvents.push(sfEv);
      if (isFutureFn(sfEv, now)) {
        assignmentSlices.push({
          projectId: parsed.projectId,
          company: company,
          resourceName: res.name || res.email,
          date: ev.start,
          hours: dur.hours
        });
      }
    });

    if (!isFutureFn({ end: ev.end }, now) && !fromResource) {
      opts.errorLog.append({
        timestamp: now.toISOString(),
        job: opts.job || 'CalendarGET',
        eventId: ev.id,
        projectId: parsed.projectId,
        reason: 'organizer not on Resource emails',
        snippet: ev.organizerEmail || ''
      });
    }
  }

  var byProject = {};
  incoming.forEach(function (inc) {
    var pid = parseDescriptionFn(inc.body).projectId;
    if (!byProject[pid]) byProject[pid] = [];
    byProject[pid].push(inc);
  });

  var projectIds = Object.keys(byProject);
  for (var p = 0; p < projectIds.length; p++) {
    var projectId = projectIds[p];
    var existing = opts.smartsheet.loadConsultation(projectId);
    var diff = consultationDiffFn(existing, byProject[projectId], now, window);
    if (!opts.dryRun) {
      opts.smartsheet.applyDiff(projectId, diff);
    } else {
      opts.smartsheet.applyDiff(projectId, diff);
    }
  }

  var assignments = buildAssignmentUpsertsFn(sfEvents.filter(function (e) { return isFutureFn(e, now); }), now);
  var timecardEvents = sfEvents.map(function (e) { return e; });
  var fromByEvent = {};
  opts.events.forEach(function (ev) {
    fromByEvent[ev.id] = matchFromFn(ev.organizerEmail, resourceIndex);
  });
  var timecardDeltas = [];
  opts.events.forEach(function (ev) {
    var parsed = parseDescriptionFn(ev.body);
    if (!parsed.ok) return;
    var fromResource = fromByEvent[ev.id];
    if (!fromResource) return;
    var dur = durationHoursFn(ev.start, ev.end, ev.isAllDay);
    if (!dur.ok) return;
    if (isFutureFn({ end: ev.end }, now)) return;
    timecardDeltas = timecardDeltas.concat(buildTimecardDeltasFn([{
      eventId: ev.id,
      projectId: parsed.projectId,
      milestone: canonicalizeFn(parsed.milestone, opts.milestones),
      start: ev.start,
      end: ev.end,
      hours: dur.hours,
      cancelled: false
    }], fromResource, [], now));
  });

  opts.salesforce.upsertAssignments(assignments);
  opts.salesforce.upsertTimecards(timecardDeltas);

  if (!opts.dryRun && opts.workbook) {
    var grid = renderForecastGridFn(assignmentSlices, now, Config.TIMESHEET_WEEK_START);
    writeForecastTabFn(opts.workbook, grid);
  }

  if (opts.inspector && opts.workbook) {
    var rows = opts.inspector.asRows();
    if (rows.length) {
      opts.workbook.ensureTab(Config.tabs.apiInspector, ['Timestamp', 'Job', 'Dry-run', 'System', 'Operation', 'Method', 'Path', 'Request JSON', 'Fake response JSON', 'Notes']);
      rows.forEach(function (r) { opts.workbook.writeRow(Config.tabs.apiInspector, r); });
    }
  }

  return { processed: incoming.length, errorLog: opts.errorLog };
}

if (typeof module !== 'undefined') {
  module.exports = { runCalendarGet: runCalendarGet };
}
