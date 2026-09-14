const fs = require('fs');
const path = require('path');
const assert = require('assert');

const appSource = fs.readFileSync(path.join(__dirname, 'public/js/app.js'), 'utf8');
const serverSource = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');

assert(!appSource.includes('Mark as Completed'), 'frontend must NOT render a manual Mark as Completed button');
assert(appSource.includes('Not Started') && appSource.includes('In Progress') && appSource.includes('Completed'), 'frontend must render topic status labels');
assert(serverSource.includes('/api/topic/video-progress'), 'backend must expose video progress route for automatic completion');
assert(serverSource.includes('Boolean(b.ended)'), 'backend must only mark completed when video ended flag is true');
assert(serverSource.includes('courseProgress') || serverSource.includes('topicProgress'), 'backend must persist progress structures');

console.log('completion-flow smoke test passed');
