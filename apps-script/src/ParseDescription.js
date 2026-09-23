function parseDescription(body) {
  if (body == null || String(body).trim() === '') {
    return { ok: false, error: 'empty description' };
  }
  var parts = String(body).split('|');
  if (parts.length !== 4) {
    return { ok: false, error: 'expected 4 pipe segments' };
  }
  var company = parts[0].trim();
  var meetingTitle = parts[1].trim();
  var milestone = parts[2].trim();
  var projectId = parts[3].trim();
  if (!projectId) return { ok: false, error: 'empty project id' };
  return { ok: true, company: company, meetingTitle: meetingTitle, milestone: milestone, projectId: projectId };
}
if (typeof module !== 'undefined') module.exports = { parseDescription };
