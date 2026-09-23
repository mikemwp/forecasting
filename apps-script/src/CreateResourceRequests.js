var hourRulesFn = typeof require !== 'undefined' ? require('./SalesforceClient').hourRules : hourRules;
var Config = typeof require !== 'undefined' ? require('./Config').Config : Config;

function createResourceRequests(opts) {
  var confirmed = opts.staffingRows.filter(function (r) { return r.confirmed === true || r.confirmed === 'TRUE' || r.confirmed === true; });
  if (!confirmed.length) return { created: 0, ids: [] };

  var ruleInput = confirmed.map(function (r) {
    return {
      projectId: r.projectId || r['Project ID'],
      milestone: r.milestone || r['Milestone'],
      milestoneHours: Number(r.milestoneHours || r['Milestone hours']),
      requestHours: Number(r.requestHours || r['Request hours']),
      confirmed: true
    };
  });

  var rules = hourRulesFn(ruleInput);
  if (!rules.ok) {
    rules.errors.forEach(function (msg) {
      opts.errorLog.append({ timestamp: new Date().toISOString(), job: 'CreateRR', projectId: ruleInput[0].projectId, reason: msg, snippet: '' });
    });
    return { created: 0, ids: [], errors: rules.errors };
  }

  var toCreate = confirmed.map(function (r) {
    return {
      projectId: r.projectId || r['Project ID'],
      milestone: r.milestone || r['Milestone'],
      resourceType: r.resourceType || r['Resource type'],
      requestHours: Number(r.requestHours || r['Request hours']),
      certiniaResourceRequestId: r.certiniaResourceRequestId || r['Certinia Resource Request Id'],
      onCreated: function (id) {
        if (r.certiniaResourceRequestId !== undefined) r.certiniaResourceRequestId = id;
        if (r['Certinia Resource Request Id'] !== undefined) r['Certinia Resource Request Id'] = id;
      }
    };
  });

  var ids = opts.salesforce.createResourceRequests(toCreate);
  return { created: ids.length, ids: ids };
}

if (typeof module !== 'undefined') module.exports = { createResourceRequests: createResourceRequests };
