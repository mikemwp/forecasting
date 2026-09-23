const { Config } = require('../src/Config');

test('TEST_MODE defaults true', () => {
  expect(Config.TEST_MODE_DEFAULT).toBe(true);
});

test('object API names are Certinia PSA defaults', () => {
  expect(Config.objects.assignment).toBe('pse__Assignment__c');
  expect(Config.objects.schedule).toBe('pse__Schedule__c');
  expect(Config.objects.timecard).toBe('pse__Timecard_Header__c');
  expect(Config.objects.resourceRequest).toBe('pse__Resource_Request__c');
});
