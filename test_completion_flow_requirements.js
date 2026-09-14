const fs = require('fs');
const path = require('path');
const assert = require('assert');

const appSource = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
const serverSource = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');

// Automatic watch-based topic completion (no manual "Mark as Completed" click).
// Current spec: the completion area is hidden/empty until the video is fully watched,
// then shows only "✓ Completed". No button, no live percentage, no early completion.
assert(!appSource.includes('Mark as Completed'), 'frontend must NOT require a manual Mark as Completed action');
assert(!appSource.includes('mark-topic-btn'), 'frontend must NOT render a completion button before the video is watched');
assert(!appSource.includes('Watching…'), 'frontend must NOT show a live watch-percentage "Watching…" label in the completion area');
assert(appSource.includes('lesson-document-completion-area'), 'frontend must render a (hidden-until-done) completion area');
assert(appSource.includes('topic-completion-badge') && appSource.includes('✓ Completed'), 'frontend must show only the ✓ Completed badge at completion');
assert(appSource.includes('startWatchTracker') && appSource.includes('/api/topic/video-progress'), 'frontend must track watch time and report it via the video-progress endpoint');
assert(appSource.includes('status === "Completed"') , 'frontend must only render ✓ Completed once the saved progress is Completed');
assert(serverSource.includes('/api/topic/video-progress'), 'backend must expose the video-progress route');
assert(!serverSource.includes("watchedPercent >= 90") && serverSource.includes('finalPercent >= 100'), 'completion must only happen at the genuine 100% watched state');
assert(serverSource.includes('courseProgress') || serverSource.includes('topicProgress'), 'backend must persist progress structures');

console.log('completion-flow smoke test passed');
