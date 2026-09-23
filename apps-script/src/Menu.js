var Config = typeof require !== 'undefined' ? require('./Config').Config : Config;

function chooseClients(testMode, harness, liveOrFactory) {
  if (testMode) return harness;
  if (typeof liveOrFactory === 'function') return liveOrFactory();
  return liveOrFactory;
}

function resolveImportRunner(testMode, harnessRunner, liveRunner) {
  return testMode ? harnessRunner : liveRunner;
}

function resolveCreateRRRunner(testMode, harnessRunner, liveRunner) {
  return testMode ? harnessRunner : liveRunner;
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
    var props = PropertiesService.getScriptProperties();
    if (!props.getProperty('SMARTSHEET_TOKEN') || !props.getProperty('SF_ACCESS_TOKEN')) {
      throw new Error('Set TEST_MODE false and Script Properties before live run');
    }
    runLiveCalendarGet(!!dryRun);
    return;
  }
  runHarnessCalendarGet(!!dryRun);
}

function buildHarnessClients(wb, inspector, dryRun) {
  return {
    smartsheet: new HarnessSmartsheetClient({ workbook: wb, inspector: inspector, job: 'CalendarGET', dryRun: dryRun }),
    salesforce: new HarnessSalesforceClient({ workbook: wb, inspector: inspector, job: 'CalendarGET', dryRun: dryRun })
  };
}

function buildLiveClients(wb, inspector, dryRun) {
  var props = PropertiesService.getScriptProperties();
  return {
    smartsheet: new LiveSmartsheetClient({
      token: props.getProperty('SMARTSHEET_TOKEN'),
      workspaceId: props.getProperty('SMARTSHEET_WORKSPACE_ID'),
      inspector: inspector,
      job: 'CalendarGET',
      dryRun: dryRun
    }),
    salesforce: new LiveSalesforceClient({
      accessToken: props.getProperty('SF_ACCESS_TOKEN'),
      instanceUrl: props.getProperty('SF_INSTANCE_URL'),
      inspector: inspector,
      job: 'CalendarGET',
      dryRun: dryRun
    })
  };
}

function onImportProject() {
  var ui = SpreadsheetApp.getUi();
  var resp = ui.prompt('Import project', 'Enter Certinia Project ID:', ui.ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton() !== ui.Button.OK) return;
  var projectId = resp.getResponseText();
  var testMode = getTestMode();
  var runner = resolveImportRunner(
    testMode,
    function () { runHarnessImport(projectId, false); },
    function () { runLiveImport(projectId, false); }
  );
  runner();
}

function onCreateResourceRequestsDryRun() {
  var testMode = getTestMode();
  var runner = resolveCreateRRRunner(
    testMode,
    function () { runHarnessCreateRR(true); },
    function () { runLiveCreateRR(true); }
  );
  runner();
}

function onCreateResourceRequests() {
  var testMode = getTestMode();
  var runner = resolveCreateRRRunner(
    testMode,
    function () { runHarnessCreateRR(false); },
    function () { runLiveCreateRR(false); }
  );
  runner();
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
    resolveImportRunner: resolveImportRunner,
    resolveCreateRRRunner: resolveCreateRRRunner,
    dailyTriggerAllowed: dailyTriggerAllowed,
    assertNoLiveFetch: assertNoLiveFetch,
    getTestMode: getTestMode,
  };
}
