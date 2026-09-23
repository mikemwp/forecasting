function indexResources(rows) {
  var map = {};
  for (var i = 0; i < rows.length; i++) {
    var e = String(rows[i].email || '').trim().toLowerCase();
    if (e) map[e] = {
      email: e,
      name: rows[i].name,
      certiniaId: rows[i].certiniaId
    };
  }
  return map;
}

function matchTo(attendeeEmails, index) {
  var out = [];
  var seen = {};
  for (var i = 0; i < attendeeEmails.length; i++) {
    var e = String(attendeeEmails[i] || '').trim().toLowerCase();
    if (!e || seen[e] || !index[e]) continue;
    seen[e] = true;
    out.push(index[e]);
  }
  out.sort(function (a, b) { return a.email < b.email ? -1 : 1; });
  return out;
}

function matchFrom(organizerEmail, index) {
  var e = String(organizerEmail || '').trim().toLowerCase();
  return index[e] || null;
}

function resourceLabel(matchedRows) {
  return matchedRows.map(function (r) { return r.name || r.email; }).join(', ');
}

if (typeof module !== 'undefined') {
  module.exports = { indexResources: indexResources, matchTo: matchTo, matchFrom: matchFrom, resourceLabel: resourceLabel };
}
