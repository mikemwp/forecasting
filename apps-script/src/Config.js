var Config = {
  TEST_MODE_DEFAULT: true,
  CALENDAR_HORIZON_DAYS: 90,
  TIMESHEET_WEEK_START: 'Monday',
  SF_API_VERSION: 'v60.0',
  DML_CHUNK: 50,
  SAFETY_MS: 45000,
  tabs: {
    resourceEmails: 'Resource emails',
    companies: 'Canonical companies',
    milestones: 'Canonical milestones',
    lookup: 'Milestone resource type',
    staffing: 'Staffing board',
    errorLog: 'Error Log',
    dryRun: 'Dry-run results',
    timecardMap: 'TimecardEventMap',
    projectIndex: 'Harness_ProjectIndex',
    harnessProjects: 'Harness_Projects',
    harnessMilestones: 'Harness_Milestones',
    calendarSeed: 'Harness_CalendarSeed',
    forecast: 'Harness_Forecast',
    apiInspector: 'API_Inspector'
  },
  consultationHeaders: [
    'Consultation Name',
    'Description',
    'Start Date',
    'Start Time',
    'Milestone',
    'Resource',
    'Duration',
    'Google Event ID',
    'Status'
  ],
  objects: {
    assignment: 'pse__Assignment__c',
    schedule: 'pse__Schedule__c',
    timecard: 'pse__Timecard_Header__c',
    resourceRequest: 'pse__Resource_Request__c',
    project: 'pse__Proj__c',
    milestone: 'pse__Milestone__c'
  },
  status: { cancelled: 'Cancelled', draft: 'Draft' }
};

if (typeof module !== 'undefined') module.exports = { Config };
