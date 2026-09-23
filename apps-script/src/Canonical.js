function canonicalize(value, allowedList) {
  if (value == null) return null;
  var needle = String(value).trim().toLowerCase();
  if (!needle) return null;
  for (var i = 0; i < allowedList.length; i++) {
    var c = String(allowedList[i]).trim();
    if (c.toLowerCase() === needle) return c;
  }
  return null;
}
if (typeof module !== 'undefined') module.exports = { canonicalize };
