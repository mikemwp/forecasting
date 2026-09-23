function startOfToday(now) {
  var d = new Date(now.getTime());
  d.setHours(0, 0, 0, 0);
  return d;
}

function sameInstant(a, b) {
  return a && b && a.getTime() === b.getTime();
}

function consultationDiff(existingByEventId, incoming, now, window) {
  var inserts = [];
  var fieldUpdates = [];
  var cancellations = [];
  var unchangedIds = [];
  var incomingIds = {};

  for (var i = 0; i < incoming.length; i++) {
    var ev = incoming[i];
    if (ev.cancelledOnCalendar) continue;
    incomingIds[ev.eventId] = ev;
    var prev = existingByEventId[ev.eventId];
    if (!prev) {
      inserts.push(ev);
      continue;
    }
    var fields = [];
    if (!sameInstant(prev.start, ev.start) || !sameInstant(prev.end, ev.end)) {
      fields.push('Start Date', 'Start Time', 'Duration');
    }
    if ((prev.resourceLabel || '') !== (ev.resourceLabel || '')) fields.push('Resource');
    if ((prev.milestone || '') !== (ev.milestone || '')) fields.push('Milestone');
    if (fields.length === 0) unchangedIds.push(ev.eventId);
    else fieldUpdates.push({ eventId: ev.eventId, fields: fields, incoming: ev });
  }

  var today = startOfToday(now);
  var ids = Object.keys(existingByEventId);
  for (var j = 0; j < ids.length; j++) {
    var id = ids[j];
    var row = existingByEventId[id];
    if (row.status === 'Cancelled') continue;
    if (incomingIds[id]) continue;
    if (row.start < today) continue;
    if (window && (row.start < window.timeMin || row.start > window.timeMax)) continue;
    cancellations.push(id);
  }

  return {
    inserts: inserts,
    fieldUpdates: fieldUpdates,
    cancellations: cancellations,
    unchangedIds: unchangedIds
  };
}

if (typeof module !== 'undefined') module.exports = { consultationDiff: consultationDiff };
