var Config = typeof require !== 'undefined' ? require('./Config').Config : Config;

function chooseClients(testMode, harness, liveOrFactory) {
  if (testMode) return harness;
  if (typeof liveOrFactory === 'function') return liveOrFactory();
  return liveOrFactory;
}

function dailyTriggerAllowed(testMode) {
  return !testMode;
}

function assertNoLiveFetch(testMode, client) {
  if (testMode && client && typeof client.urlFetch === 'function') {
    throw new Error('UrlFetch not allowed when TEST_MODE is true');
  }
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Calendar')
    .addItem('Get consultations', 'onCalendarGet')
    .addItem('Get consultations (dry-run)', 'onCalendarGetDryRun')
    .addToUi();
  SpreadsheetApp.getUi()
    .createMenu('Certinia')
    .addItem('Import project', 'onImportProject')
    .addItem('Create resource requests', 'onCreateResourceRequests')
    .addItem('Create resource requests (dry-run)', 'onCreateResourceRequestsDryRun')
    .addToUi();
  SpreadsheetApp.getUi()
    .createMenu('Test')
    .addItem('Open API Inspector', 'openInspector')
    .addItem('TEST_MODE', 'showTestMode')
    .addItem('Import dummy data', 'onImportDummyData')
    .addItem('Import seed calendar events', 'onImportSeedCalendarEvents')
    .addToUi();
}

function getTestMode() {
  var props = PropertiesService.getScriptProperties();
  var v = props.getProperty('TEST_MODE');
  if (v == null) return Config.TEST_MODE_DEFAULT;
  return v === 'true' || v === true;
}

function onDailyTrigger() {
  if (!dailyTriggerAllowed(getTestMode())) return;
  onCalendarGet(false);
}

function openInspector() {
  var html = HtmlService.createHtmlOutputFromFile('InspectorSidebar').setTitle('API Inspector');
  SpreadsheetApp.getUi().showSidebar(html);
}

function showTestMode() {
  var mode = getTestMode();
  SpreadsheetApp.getUi().alert('TEST_MODE is ' + mode);
}

function onCalendarGetDryRun() {
  onCalendarGet(true);
}

function onCalendarGet(dryRun) {
  if (typeof dryRun !== 'boolean') dryRun = false;
  var testMode = getTestMode();
  if (!testMode) {
    throw new Error('Live clients not installed');
  }
  runHarnessCalendarGet(!!dryRun);
}

function onImportProject() {
  var ui = SpreadsheetApp.getUi();
  var resp = ui.prompt('Import project', 'Enter Certinia Project ID:', ui.ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton() !== ui.Button.OK) return;
  runHarnessImport(resp.getResponseText(), false);
}

function onCreateResourceRequestsDryRun() {
  runHarnessCreateRR(true);
}

function onCreateResourceRequests() {
  runHarnessCreateRR(false);
}

function onImportDummyData() {
  importDummyDataGas();
}

function onImportSeedCalendarEvents() {
  importSeedCalendarEventsGas();
}

function getInspectorRows() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(Config.tabs.apiInspector);
  if (!sheet) return [];
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  return data.slice(1);
}

if (typeof module !== 'undefined') {
  module.exports = {
    chooseClients: chooseClients,
    dailyTriggerAllowed: dailyTriggerAllowed,
    assertNoLiveFetch: assertNoLiveFetch,
    getTestMode: getTestMode
  };
}
