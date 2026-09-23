function durationHours(start, end, isAllDay) {
  if (isAllDay) return { ok: false, error: 'all-day events are skipped' };
  if (!(start instanceof Date) || !(end instanceof Date) || isNaN(start) || isNaN(end)) {
    return { ok: false, error: 'invalid start/end' };
  }
  var ms = end.getTime() - start.getTime();
  if (ms <= 0) return { ok: false, error: 'non-positive duration' };
  return { ok: true, hours: ms / 3600000 };
}
if (typeof module !== 'undefined') module.exports = { durationHours };
