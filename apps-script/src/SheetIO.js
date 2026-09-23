var Config = typeof require !== 'undefined' ? require('./Config').Config : Config;

function upsertTabByKey(tab, keyField, keyValue, valuesByHeader) {
  var keyIdx = tab.headers.indexOf(keyField);
  if (keyIdx < 0) {
    tab.headers.push(keyField);
    keyIdx = tab.headers.length - 1;
  }
  Object.keys(valuesByHeader).forEach(function (hdr) {
    if (tab.headers.indexOf(hdr) < 0) tab.headers.push(hdr);
  });
  for (var i = 0; i < tab.rows.length; i++) {
    if (tab.rows[i][keyIdx] === keyValue) {
      for (var h = 0; h < tab.headers.length; h++) {
        var header = tab.headers[h];
        if (valuesByHeader.hasOwnProperty(header)) tab.rows[i][h] = valuesByHeader[header];
      }
      return i;
    }
  }
  var row = tab.headers.map(function (hdr) {
    return valuesByHeader.hasOwnProperty(hdr) ? valuesByHeader[hdr] : '';
  });
  tab.rows.push(row);
  return tab.rows.length - 1;
}

function overwriteTabData(tab, headers, rows) {
  tab.headers = headers.slice();
  tab.rows = rows.map(function (r) { return r.slice(); });
}

function tabToSheetValues(tab) {
  if (!tab.headers.length && !tab.rows.length) return [[]];
  if (!tab.headers.length) return tab.rows.slice();
  return [tab.headers.slice()].concat(tab.rows.map(function (r) { return r.slice(); }));
}

function sheetValuesToTab(data) {
  if (!data || !data.length) return { headers: [], rows: [] };
  return { headers: data[0].slice(), rows: data.slice(1).map(function (r) { return r.slice(); }) };
}

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
  return upsertTabByKey(tab, keyField, keyValue, valuesByHeader);
};

MemoryWorkbook.prototype.overwriteTab = function (tabName, headers, rows) {
  if (!this.tabs[tabName]) this.tabs[tabName] = { headers: [], rows: [] };
  overwriteTabData(this.tabs[tabName], headers, rows);
};

MemoryWorkbook.prototype.getColumnValues = function (tabName, columnName) {
  var tab = this.getTab(tabName);
  var idx = tab.headers.indexOf(columnName);
  if (idx < 0) return [];
  return tab.rows.map(function (r) { return r[idx]; }).filter(function (v) { return v !== '' && v != null; });
};

function FakeSheet(dataStore) {
  this._data = dataStore;
}

FakeSheet.prototype.getLastRow = function () {
  return this._data.length;
};

FakeSheet.prototype.getLastColumn = function () {
  if (!this._data.length) return 0;
  return Math.max.apply(null, this._data.map(function (r) { return r.length; }));
};

FakeSheet.prototype.getDataRange = function () {
  var self = this;
  return {
    getValues: function () { return self._data.map(function (r) { return r.slice(); }); }
  };
};

FakeSheet.prototype.getRange = function (row, col, numRows, numCols) {
  var self = this;
  return {
    setValues: function (values) {
      for (var r = 0; r < numRows; r++) {
        var targetRow = row - 1 + r;
        if (!self._data[targetRow]) self._data[targetRow] = [];
        for (var c = 0; c < numCols; c++) {
          self._data[targetRow][col - 1 + c] = values[r][c];
        }
      }
    },
    clearContent: function () {
      self._data.splice(row - 1, numRows);
    }
  };
};

FakeSheet.prototype.appendRow = function (values) {
  this._data.push(values.slice());
};

function FakeSpreadsheetAdapter() {
  this.sheets = {};
}

FakeSpreadsheetAdapter.prototype.getSheetByName = function (name) {
  if (!this.sheets[name]) return null;
  return new FakeSheet(this.sheets[name]);
};

FakeSpreadsheetAdapter.prototype.insertSheet = function (name) {
  this.sheets[name] = [];
  return new FakeSheet(this.sheets[name]);
};

function createSpreadsheetWorkbook(spreadsheet) {
  var ss = spreadsheet;
  var tabCache = {};

  function readTabFromSheet(sheet, name) {
    if (!sheet) return { headers: [], rows: [] };
    var data = sheet.getDataRange().getValues();
    if (!data.length) return { headers: [], rows: [] };
    return sheetValuesToTab(data);
  }

  function writeTabToSheet(sheet, tab) {
    var values = tabToSheetValues(tab);
    var numRows = values.length;
    var numCols = values.reduce(function (max, row) { return Math.max(max, row.length); }, 0);
    if (sheet.getLastRow() > 0) {
      sheet.getRange(1, 1, sheet.getLastRow(), Math.max(sheet.getLastColumn(), 1)).clearContent();
    }
    if (numRows > 0 && numCols > 0) {
      var padded = values.map(function (row) {
        var copy = row.slice();
        while (copy.length < numCols) copy.push('');
        return copy;
      });
      sheet.getRange(1, 1, numRows, numCols).setValues(padded);
    }
  }

  function getOrReadTab(name) {
    if (tabCache[name]) return tabCache[name];
    var sheet = ss.getSheetByName(name);
    tabCache[name] = readTabFromSheet(sheet, name);
    return tabCache[name];
  }

  function flushTab(name) {
    var sheet = ss.getSheetByName(name);
    if (!sheet || !tabCache[name]) return;
    writeTabToSheet(sheet, tabCache[name]);
  }

  return {
    getTab: function (name) {
      return getOrReadTab(name);
    },
    ensureTab: function (name, headers) {
      var sheet = ss.getSheetByName(name);
      if (!sheet) sheet = ss.insertSheet(name);
      var tab = getOrReadTab(name);
      if (headers && headers.length && tab.headers.length === 0 && tab.rows.length === 0) {
        tab.headers = headers.slice();
        writeTabToSheet(sheet, tab);
      }
      return tab;
    },
    writeRow: function (tabName, values) {
      var tab = this.ensureTab(tabName, []);
      if (tab.headers.length === 0 && values.length > 0) {
        tab.headers = values.map(function (_, i) { return 'Col' + i; });
      }
      tab.rows.push(values.slice());
      flushTab(tabName);
    },
    readRows: function (tabName) {
      var tab = getOrReadTab(tabName);
      var self = this;
      return tab.rows.map(function (row) {
        var obj = {};
        for (var i = 0; i < tab.headers.length; i++) obj[tab.headers[i]] = row[i];
        return obj;
      });
    },
    readObjects: function (tabName, keyField) {
      var rows = this.readRows(tabName);
      var out = {};
      rows.forEach(function (r) { if (r[keyField]) out[r[keyField]] = r; });
      return out;
    },
    upsertByKey: function (tabName, keyField, keyValue, valuesByHeader) {
      var tab = this.ensureTab(tabName, Object.keys(valuesByHeader));
      upsertTabByKey(tab, keyField, keyValue, valuesByHeader);
      flushTab(tabName);
    },
    overwriteTab: function (tabName, headers, rows) {
      tabCache[tabName] = { headers: headers.slice(), rows: rows.map(function (r) { return r.slice(); }) };
      var sheet = ss.getSheetByName(tabName);
      if (!sheet) sheet = ss.insertSheet(tabName);
      writeTabToSheet(sheet, tabCache[tabName]);
    },
    getColumnValues: function (tabName, col) {
      return this.readRows(tabName).map(function (r) { return r[col]; }).filter(Boolean);
    }
  };
}

var INSPECTOR_HEADERS = [
  'Timestamp', 'Job', 'Dry-run', 'System', 'Operation', 'Method', 'Path', 'Request JSON', 'Fake response JSON', 'Notes'
];

function flushInspectorToWorkbook(wb, inspector) {
  if (!inspector || !wb) return;
  var rows = inspector.asRows();
  if (!rows.length) return;
  wb.ensureTab(Config.tabs.apiInspector, INSPECTOR_HEADERS);
  rows.forEach(function (r) { wb.writeRow(Config.tabs.apiInspector, r); });
}

if (typeof module !== 'undefined') {
  module.exports = {
    MemoryWorkbook: MemoryWorkbook,
    createSpreadsheetWorkbook: createSpreadsheetWorkbook,
    FakeSpreadsheetAdapter: FakeSpreadsheetAdapter,
    flushInspectorToWorkbook: flushInspectorToWorkbook,
    upsertTabByKey: upsertTabByKey,
    overwriteTabData: overwriteTabData
  };
}
