var Config = typeof require !== 'undefined' ? require('./Config').Config : Config;

function MemoryWorkbook() {
  this.tabs = {};
}

MemoryWorkbook.prototype.getTab = function (name) {
  return this.tabs[name] || { headers: [], rows: [] };
};

MemoryWorkbook.prototype.ensureTab = function (name, headers) {
  if (!this.tabs[name]) {
    this.tabs[name] = { headers: headers.slice(), rows: [] };
  } else if (headers && this.tabs[name].headers.length === 0) {
    this.tabs[name].headers = headers.slice();
  }
  return this.tabs[name];
};

MemoryWorkbook.prototype.writeRow = function (tabName, values) {
  var tab = this.ensureTab(tabName, values.map(function () { return ''; }));
  if (tab.headers.length === 0 && values.length > 0) {
    tab.headers = values.map(function (_, i) { return 'Col' + i; });
  }
  tab.rows.push(values.slice());
};

MemoryWorkbook.prototype._rowToObject = function (headers, row) {
  var obj = {};
  for (var i = 0; i < headers.length; i++) {
    obj[headers[i]] = row[i] != null ? row[i] : '';
  }
  return obj;
};

MemoryWorkbook.prototype.readObjects = function (tabName, keyField) {
  var tab = this.getTab(tabName);
  var out = {};
  for (var i = 0; i < tab.rows.length; i++) {
    var obj = this._rowToObject(tab.headers, tab.rows[i]);
    var key = obj[keyField];
    if (key) out[key] = obj;
  }
  return out;
};

MemoryWorkbook.prototype.readRows = function (tabName) {
  var tab = this.getTab(tabName);
  return tab.rows.map(function (row) {
    return this._rowToObject(tab.headers, row);
  }, this);
};

MemoryWorkbook.prototype.upsertByKey = function (tabName, keyField, keyValue, valuesByHeader) {
  var tab = this.ensureTab(tabName, Object.keys(valuesByHeader));
  var keyIdx = tab.headers.indexOf(keyField);
  if (keyIdx < 0) {
    tab.headers.push(keyField);
    keyIdx = tab.headers.length - 1;
  }
  for (var i = 0; i < tab.rows.length; i++) {
    if (tab.rows[i][keyIdx] === keyValue) {
      for (var h = 0; h < tab.headers.length; h++) {
        var hdr = tab.headers[h];
        if (valuesByHeader.hasOwnProperty(hdr)) tab.rows[i][h] = valuesByHeader[hdr];
      }
      return i;
    }
  }
  var row = tab.headers.map(function (hdr) {
    return valuesByHeader.hasOwnProperty(hdr) ? valuesByHeader[hdr] : '';
  });
  tab.rows.push(row);
  return tab.rows.length - 1;
};

MemoryWorkbook.prototype.overwriteTab = function (tabName, headers, rows) {
  this.tabs[tabName] = { headers: headers.slice(), rows: rows.map(function (r) { return r.slice(); }) };
};

MemoryWorkbook.prototype.getColumnValues = function (tabName, columnName) {
  var tab = this.getTab(tabName);
  var idx = tab.headers.indexOf(columnName);
  if (idx < 0) return [];
  return tab.rows.map(function (r) { return r[idx]; }).filter(function (v) { return v !== '' && v != null; });
};

if (typeof module !== 'undefined') {
  module.exports = { MemoryWorkbook: MemoryWorkbook };
}
