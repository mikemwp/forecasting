function weekStart(date, weekStartDay) {
  var d = new Date(date.getTime());
  d.setHours(0, 0, 0, 0);
  var want = weekStartDay === 'Sunday' ? 0 : 1;
  var day = d.getDay();
  var diff = (day - want + 7) % 7;
  d.setDate(d.getDate() - diff);
  return d;
}

function fetchWindow(now, horizonDays, weekStartDay) {
  var timeMin = weekStart(now, weekStartDay || 'Monday');
  var timeMax = new Date(now.getTime() + horizonDays * 86400000);
  return { timeMin: timeMin, timeMax: timeMax };
}
if (typeof module !== 'undefined') module.exports = { weekStart, fetchWindow };
