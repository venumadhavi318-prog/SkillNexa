const fs = require('fs');
const path = require('path');
const assert = require('assert');

const appSource = fs.readFileSync(path.join(__dirname, 'public/js/app.js'), 'utf8');
const serverSource = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');

assert(appSource.includes('Mark as Completed'), 'frontend must render an explicit Mark as Completed topic action');
assert(appSource.includes('Not Started') && appSource.includes('In Progress') && appSource.includes('Completed'), 'frontend must render topic status labels');
assert(serverSource.includes('/api/topic/complete'), 'backend must expose explicit topic completion route');
assert(serverSource.includes('courseProgress') || serverSource.includes('topicProgress'), 'backend must persist progress structures');

console.log('completion-flow smoke test passed');
