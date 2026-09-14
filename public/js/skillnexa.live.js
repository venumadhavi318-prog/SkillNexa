// skillnexa.js - combined frontend asset

const TOKEN_KEY = "skillnexa_token";
let token = localStorage.getItem(TOKEN_KEY) || "";
function setToken(value) { token = value || ""; if (token) localStorage.setItem(TOKEN_KEY, token); else localStorage.removeItem(TOKEN_KEY); }
function getToken() { return token; }
async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(path, { ...options, headers });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.message || `Request failed (${r.status})`);
  return data;
}

const educationBranches = {
  "B.Tech": ["CSE", "CSM", "Data Science", "EEE", "ECE", "Civil Engineering"],
  "Degree": ["BCA", "B.Sc Computer Science", "B.Sc Data Science", "BBA", "B.Com"],
  "Diploma": ["CSE", "ECE", "EEE", "Civil Engineering", "Mechanical"]
};

const levelInfo = [
  { level: 1, title: "Foundation", points: 0 },
  { level: 2, title: "Beginner", points: 100 },
  { level: 3, title: "Intermediate", points: 250 },
  { level: 4, title: "Advanced", points: 500 },
  { level: 5, title: "Expert", points: 900 },
  { level: 6, title: "Pro", points: 1400 },
  { level: 7, title: "Specialist", points: 2000 },
  { level: 8, title: "Master", points: 2800 },
  { level: 9, title: "Elite", points: 3800 },
  { level: 10, title: "Legend", points: 5200 }
];

let allCourses = {};
async function loadCourses() { if (!Object.keys(allCourses).length) allCourses = (await api("/api/courses")).courses; return allCourses; }
function branchCourses(branch) { return allCourses[branch] || []; }
function youtubeUrl(query) { return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`; }
async function selectCourse(courseId) { return api("/api/course/select", { method:"POST", body:JSON.stringify({ courseId }) }); }
async function currentCourse() { return api("/api/course/current"); }
async function completeLevel(courseId, level) { return api("/api/course/complete-level", { method:"POST", body:JSON.stringify({ courseId, level }) }); }

const LANGS = { Auto:"en-IN", English:"en-IN", Telugu:"te-IN", Hindi:"hi-IN", Tamil:"ta-IN", Kannada:"kn-IN", Malayalam:"ml-IN", Marathi:"mr-IN", Bengali:"bn-IN", Gujarati:"gu-IN", Punjabi:"pa-IN", Urdu:"ur-IN", Odia:"or-IN", Assamese:"as-IN" };

// Exactly three SkillNexa voice choices.
const STYLES = {
  "Male Deep":    { gender: "male",   rate: 0.85, pitch: 0.6  },
  "Male Sweet":   { gender: "male",   rate: 0.92, pitch: 1.05 },
  "Female Sweet": { gender: "female", rate: 0.95, pitch: 1.15 }
};

// Name-based gender classification. The Web Speech API exposes only
// name/lang on a voice, so we build strong token lists for known male /
// female voices across the supported locales. A voice with no matching
// token is treated as "unknown" (never guessed from the label alone).
const MALE_TOKENS = /male|david|mark|daniel|alex|ravi|kiran|arun|vijay|amit|raj|abhilash|rishabh|rishi|arvind|sunil|ashok|ramesh|mahesh|sudhir|govind|prem|kumar|naveen|linux|george|guy|thomas|alexander|james$/i;
const FEMALE_TOKENS = /female|zira|samantha|heera|susan|sonia|priya|sania|nea|jane|moira|tessa|karen|katherine|allison|ava|aria|natasha|ananya|kavya|geetha|swara|shreya|pooja|sneha|meera|neha|ana|virginia|kathy|victoria|kate|ashley|jenny|fiona|serena/i;
// Tone hints used only to order voices of the *same* gender.
const DEEP_TOKENS = /daniel|alex|ravi|deep|\bfull\b|bass|low|baritone|vijay|naveen|arvind|ashok|ramesh|sudhir|george|thomas|alexander/i;
const SOFT_TOKENS = /david|mark|soft|gentle|sweet|light|natural/i;
const FEMALE_SOFT_TOKENS = /sweet|soft|gentle|nea|samantha|heera|zira|kavya|priya|shreya|meera|sneha/i;

const SCRIPT_LANG = [
  ["hi", /[\u0900-\u097F]/],
  ["bn", /[\u0980-\u09FF]/],
  ["pa", /[\u0A00-\u0A7F]/],
  ["gu", /[\u0A80-\u0AFF]/],
  ["or", /[\u0B00-\u0B7F]/],
  ["ta", /[\u0B80-\u0BFF]/],
  ["te", /[\u0C00-\u0C7F]/],
  ["kn", /[\u0C80-\u0CFF]/],
  ["ml", /[\u0D00-\u0D7F]/]
];

// Detect the script of a text and map it to the closest speech locale. Latin
// text (English) returns null so the caller's fallback language is used.
function detectLang(text) {
  const counts = {};
  for (const [code, re] of SCRIPT_LANG) {
    const m = String(text).match(re);
    if (m) counts[code] = m.length;
  }
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return best ? formatLang(best[0]) : null;
}

let enabled = false;
let activeUtterance = null;
let generation = 0;

const speechState = { message: "", position: 0, voiceStyle: "Female Sweet", lang: "en-IN", status: "idle" };

function formatLang(code) {
  const c = String(code || "en").split("-")[0].toLowerCase();
  return LANGS[c] || (c === "en" ? "en-IN" : c + "-IN");
}

function getVoices() {
  try { return (window.speechSynthesis && window.speechSynthesis.getVoices) ? window.speechSynthesis.getVoices() : []; }
  catch (e) { return []; }
}

// Resolve when voices are available. Browser voices load asynchronously, so
// we wait for the voiceschanged event (and re-check it on subsequent calls).
function ensureVoices() {
  if (!("speechSynthesis" in window)) return Promise.resolve([]);
  const v = getVoices();
  if (v.length) return Promise.resolve(v);
  return new Promise(function (resolve) {
    let done = false;
    const finish = function () {
      if (done) return;
      done = true;
      try {
        window.speechSynthesis.removeEventListener("voiceschanged", finish);
        try { window.speechSynthesis.onvoiceschanged = null; } catch (e) {}
      } catch (e) {}
      voiceCache = {};
      resolve(getVoices());
    };
    try {
      window.speechSynthesis.addEventListener("voiceschanged", finish);
      // Also react if the browser uses the legacy onvoiceschanged property.
      if (!("onvoiceschanged" in window.speechSynthesis) || window.speechSynthesis.onvoiceschanged === null) {
        try { window.speechSynthesis.onvoiceschanged = finish; } catch (e) {}
      }
    } catch (e) {
      window.speechSynthesis.onvoiceschanged = finish;
    }
    setTimeout(finish, 2500);
  });
}

let voiceCache = {};
let voiceLogDone = false;

function logVoices() {
  const vs = getVoices();
  console.log("[voice] available voices (" + vs.length + "):");
  vs.forEach(function (v) {
    console.log("  " + v.lang + "  " + v.name + (v.default ? " [default]" : ""));
  });
}

function genderOf(voice) {
  const n = String(voice.name || "");
  if (FEMALE_TOKENS.test(n)) return "female";
  if (MALE_TOKENS.test(n)) return "male";
  return "unknown";
}

// Select the closest available voice for the requested style + locale.
// Female Sweet MUST prefer a real female voice and MUST NOT fall back to a
// male voice while a female/unknown voice for that language exists.
function pickVoice(style, lang, forceRefetch) {
  if (!voiceLogDone) {
    voiceLogDone = true;
    try { logVoices(); } catch (e) {}
  }
  const key = style + "|" + lang;
  if (!forceRefetch && voiceCache[key]) return voiceCache[key];

  const desired = STYLES[style] || STYLES["Female Sweet"];
  let voices = getVoices();
  if (!voices.length) return null;

  const langFull = String(lang || "en-IN").toLowerCase();
  const base = langFull.split("-")[0];
  // Prefer exact locale (te-IN) then same base language (te-*), then any.
  const exact = voices.filter(v => (v.lang || "").toLowerCase() === langFull);
  const sameBase = exact.length ? [] : voices.filter(v => (v.lang || "").toLowerCase().split("-")[0] === base);
  const pool = exact.length ? exact : (sameBase.length ? sameBase : voices);

  const rank = desired.gender === "female" ? { female: 0, unknown: 1, male: 2 } : { male: 0, unknown: 1, female: 2 };
  const scored = pool.map(function (v) {
    return { voice: v, score: rank[genderOf(v)] };
  });
  scored.sort(function (a, b) { return a.score - b.score; });

  // Among the best-score gender group, prefer a fitting tone.
  const bestScore = scored.length ? scored[0].score : 2;
  let best = scored.filter(s => s.score === bestScore).map(s => s.voice);
  if (best.length > 1) {
    const tone = desired.gender === "female" ? FEMALE_SOFT_TOKENS : (style === "Male Deep" ? DEEP_TOKENS : SOFT_TOKENS);
    best.sort(function (a, b) {
      return (tone.test(String(b.name)) ? 1 : 0) - (tone.test(String(a.name)) ? 1 : 0);
    });
  }
  const selected = best[0] || null;
  // Never cache a null result: voices load asynchronously and a "none yet"
  // lookup must not be remembered once the real voice list arrives.
  if (selected) voiceCache[key] = selected;
  try {
    console.log("[voice] picked", style, "/", lang, "->", selected ? (selected.lang + " || " + selected.name) : "NONE");
  } catch (e) {}
  return selected;
}

function speakChunk(text, from, gen) {
  if (!("speechSynthesis" in window)) return;
  if (generation !== gen) return;
  const chunk = String(text).slice(from, from + 8000);
  if (!chunk) {
    if (generation === gen) { speechState.status = speechState.message ? "completed" : "idle"; speechState.position = speechState.message.length; }
    return;
  }
  const u = new SpeechSynthesisUtterance(chunk);
  u.lang = speechState.lang;
  // Some browsers throw when `.voice` is given a non-SpeechSynthesisVoice;
  // never let a bad voice object break playback (speaks with the default
  // voice for u.lang instead).
  try {
    u.voice = pickVoice(speechState.voiceStyle, speechState.lang);
  } catch (e) {
    console.warn("[voice] ignoring invalid voice:", e && e.message);
  }
  const g = STYLES[speechState.voiceStyle] || STYLES["Female Sweet"];
  u.rate = g.rate;
  u.pitch = g.pitch;
  u.onboundary = function (e) {
    if (generation !== gen || e.charIndex == null) return;
    speechState.position = Math.min(String(text).length, from + e.charIndex);
  };
  u.onend = function () {
    if (generation !== gen) return;
    activeUtterance = null;
    const next = from + chunk.length;
    if (next >= String(text).length) {
      speechState.position = String(text).length;
      speechState.status = "completed";
    } else {
      speakChunk(text, next, gen);
    }
  };
  u.onerror = function () { if (generation === gen) activeUtterance = null; };
  activeUtterance = u;
  speechState.status = "speaking";
  window.speechSynthesis.speak(u);
}

function startSpeaking(text, startPos, gen) {
  if (!("speechSynthesis" in window)) return false;
  try { if (activeUtterance) window.speechSynthesis.cancel(); } catch (e) {}
  activeUtterance = null;
  if (String(text).slice(startPos).length === 0) {
    speechState.position = String(text).length;
    speechState.status = "completed";
    return true;
  }
  speakChunk(text, startPos, gen);
  return true;
}

// Restart speaking the current message from `from` once voices are known.
function resumeAfterVoices(from, gen) {
  ensureVoices().then(function () {
    if (gen !== generation) return;
    if (speechState.message && from < speechState.message.length) startSpeaking(speechState.message, from, gen);
  });
}

function setVoiceEnabled(v) {
  const was = enabled;
  enabled = Boolean(v);
  if (!enabled && was) {
    if (speechState.status === "speaking") {
      generation++;
      try { if (activeUtterance) window.speechSynthesis.cancel(); } catch (e) {}
      activeUtterance = null;
      speechState.status = "paused";
    }
  } else if (enabled && !was) {
    if (speechState.status === "paused" && speechState.position < speechState.message.length) {
      resumeAfterVoices(speechState.position, ++generation);
    } else if (speechState.status === "idle" && speechState.message) {
      resumeAfterVoices(0, ++generation);
    }
  }
  return enabled;
}

function isVoiceEnabled() { return enabled; }

function stopVoice() {
  generation++;
  try { window.speechSynthesis.cancel(); } catch (e) {}
  activeUtterance = null;
  speechState.message = "";
  speechState.position = 0;
  speechState.status = "idle";
}

function speak(text, language = "Auto", style = "Female Sweet") {
  const msg = String(text || "");
  speechState.message = msg;
  speechState.position = 0;
  speechState.voiceStyle = STYLES[style] ? style : "Female Sweet";
  const fallback = LANGS[language] || LANGS.Auto || "en-IN";
  speechState.lang = detectLang(msg) || formatLang(fallback);
  speechState.status = msg ? "idle" : "completed";
  generation++;
  if (enabled && msg) resumeAfterVoices(0, generation);
  return true;
}

function setVoiceStyle(style) {
  if (!STYLES[style]) return;
  speechState.voiceStyle = style;
  if (speechState.status === "speaking" && speechState.position < speechState.message.length) {
    resumeAfterVoices(speechState.position, ++generation);
  }
}

function setSpeechLanguage(language) {
  speechState.lang = formatLang(LANGS[language] || LANGS.Auto || "en-IN");
  if (speechState.status === "speaking" && speechState.position < speechState.message.length) {
    resumeAfterVoices(speechState.position, ++generation);
  }
}

function getSpeechState() { return Object.assign({}, speechState, { enabled: enabled }); }
function waitForVoices() { return new Promise(resolve => { if (!("speechSynthesis" in window)) return resolve([]); const v = speechSynthesis.getVoices(); if (v.length) return resolve(v); speechSynthesis.onvoiceschanged = () => resolve(speechSynthesis.getVoices()); setTimeout(() => resolve(speechSynthesis.getVoices()), 800); }); }
const firebaseConfig = {
  apiKey: "AIzaSyAiKTPs5eS8_kbsOZsAMOokrcWT80Jugg4",
  authDomain: "skill-nexa-25a33.firebaseapp.com",
  projectId: "skill-nexa-25a33",
  storageBucket: "skill-nexa-25a33.firebasestorage.app",
  messagingSenderId: "725930827337",
  appId: "1:725930827337:web:162ae9c4c7971621cde998",
  measurementId: "G-B5QQ9Q224P"
};
(function setupFirebase() {
  if (!window.firebase || !firebase.apps || typeof firebase.initializeApp !== "function") {
    return;
  }

  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }

  if (typeof firebase.analytics === "function") {
    try {
      firebase.analytics();
    } catch (e) {
      console.warn("Firebase analytics could not be initialized:", e);
    }
  }
})();

const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>\"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;" ,'"':"&quot;","'":"&#039;"}[c]));
let user = null;
let testId = null;
let testQuestions = [];
let assignmentId = null;
const state = { page:"login", aiLanguage:"Auto", aiVoice:"Female Sweet" };

function page(id) { if (id !== "lesson") stopWatchTracker(); document.querySelectorAll(".page").forEach(x => x.classList.remove("active")); const p = document.getElementById(id); if (p) p.classList.add("active"); state.page=id; }
function toast(msg) { const t = $("#toast"); t.textContent=msg; t.classList.add("show"); setTimeout(()=>t.classList.remove("show"),2800); }
function level(points) { let l=1; levelInfo.forEach(x=>{ if(points>=x.points) l=x.level; }); return l; }
function nextLevel(points) { const l=level(points); return levelInfo[l] || null; }

// Automatic topic-video completion tracking.
// There is no embedded player in this app (the YouTube button opens a search
// tab), so "watching" the topic lesson is measured by active on-page time.
// A topic is only marked Completed once the accumulated active watch reaches
// 100% of the target lesson duration.  Every topic keeps its own keyed record.
const TOPIC_WATCH_SECONDS = 120; // active seconds required to fully watch a topic lesson
let watchTimer = null;
let watchState = null;

function stopWatchTracker() {
  if (watchTimer) { clearInterval(watchTimer); watchTimer = null; }
  if (watchState) { flushWatchProgress(watchState); watchState = null; }
}

function topicCompletionKey(courseId, level, topicTitle) {
  return `${courseId}:${level}:${topicTitle}`;
}

function topicStatus(courseId, level, topicTitle) {
  if (!user) return "Not Started";
  const key = topicCompletionKey(courseId, level, topicTitle);
  const progress = user.topicProgress?.[courseId]?.[key] || {};
  if (progress.completed === true) return "Completed";
  if (progress.started === true || progress.viewed === true || progress.learned === true) return "In Progress";
  return "Not Started";
}

function startWatchTracker(c, level, topicTitle) {
  stopWatchTracker();
  const key = topicCompletionKey(c.id, level, topicTitle);
  const saved = user?.videoProgress?.[c.id]?.[key] || {};
  const status = topicStatus(c.id, level, topicTitle);
  const area = document.querySelector(`.lesson-document-completion-area[data-topic-key="${key}"]`);
  if (!area) return;
  if (status === "Completed") {
    area.innerHTML = '<span class="topic-completion-badge">✓ Completed</span>';
    return;
  }
  area.innerHTML = "";
  watchState = { courseId: c.id, level, topicTitle, key, savedPercent: Number(saved.watchedPercent || 0), savedSeconds: Number(saved.watchedSeconds || 0), duration: Number(saved.duration || TOPIC_WATCH_SECONDS), visibleSince: document.visibilityState === "visible" ? Date.now() : 0, lastSavedAt: Date.now() };
  watchTimer = setInterval(tickWatchTracker, 1500);
}

function updateWatchButton(percent, completed) {
  if (!watchState) return;
  const area = document.querySelector(`.lesson-document-completion-area[data-topic-key="${watchState.key}"]`);
  if (!area) return;
  if (completed) {
    area.innerHTML = '<span class="topic-completion-badge">✓ Completed</span>';
    area.classList.add("watch-complete");
  } else {
    area.classList.remove("watch-complete");
  }
}

function tickWatchTracker() {
  if (!watchState) return;
  if (document.visibilityState !== "visible") { watchState.visibleSince = 0; return; }
  const now = Date.now();
  if (!watchState.visibleSince) watchState.visibleSince = now;
  const activeSeconds = watchState.savedSeconds + Math.round((now - watchState.visibleSince) / 1000);
  const percent = Math.min(100, Math.round((activeSeconds / Math.max(1, watchState.duration)) * 100));
  updateWatchButton(percent, false);
  if (now - watchState.lastSavedAt >= 3000 || percent >= 100) {
    saveWatchProgress(percent, activeSeconds);
    watchState.lastSavedAt = now;
  }
}

async function saveWatchProgress(percent, activeSeconds) {
  const ws = watchState;
  if (!ws) return;
  const payload = { courseId: ws.courseId, level: ws.level, topicTitle: ws.topicTitle, watchedPercent: percent, watchedSeconds: activeSeconds, duration: ws.duration, videoId: ws.key, videoTitle: `${ws.topicTitle} lesson` };
  try {
    const d = await api("/api/topic/video-progress", { method: "POST", body: JSON.stringify(payload) });
    if (!watchState || watchState.key !== ws.key) return;
    const completed = Boolean(d.topic?.completed);
    if (completed) {
      stopWatchTracker();
      updateTopicStatusLabels(ws.courseId, ws.level, ws.topicTitle, "Completed");
      refresh();
      toast("Topic completed! Daily Test unlocked.");
    }
  } catch (e) { /* network hiccup - progress is re-flushed on the next tick */ }
}

function flushWatchProgress(ws) {
  if (!ws || document.visibilityState !== "visible") return;
  const now = Date.now();
  const since = ws.visibleSince || now;
  const activeSeconds = ws.savedSeconds + Math.round((now - since) / 1000);
  const percent = Math.min(100, Math.round((activeSeconds / Math.max(1, ws.duration)) * 100));
  if (activeSeconds > ws.savedSeconds) {
    api("/api/topic/video-progress", { method: "POST", keepalive: true, body: JSON.stringify({ courseId: ws.courseId, level: ws.level, topicTitle: ws.topicTitle, watchedPercent: percent, watchedSeconds: activeSeconds, duration: ws.duration, videoId: ws.key, videoTitle: `${ws.topicTitle} lesson` }) }).catch(() => {});
  }
}

function updateTopicStatusLabels(courseId, level, topicTitle, status) {
  const area = document.querySelector(`.lesson-document-completion-area[data-topic-key="${topicCompletionKey(courseId, level, topicTitle)}"]`);
  if (area) {
    if (status === "Completed") area.innerHTML = '<span class="topic-completion-badge">✓ Completed</span>';
    else area.innerHTML = "";
  }
  const activeBtn = document.querySelector(".lesson-topic-button.active .topic-status-mini");
  if (activeBtn) activeBtn.textContent = status;
}

window.addEventListener("pagehide", () => { if (watchState) { flushWatchProgress(watchState); } });

function bind() {
  const registerEducation = $("#registerEducation");
  const loginForm = $("#loginForm");
  const registerForm = $("#registerForm");
  const logout = $("#logout");
  const navCourses = $("#navCourses");
  const navDashboard = $("#navDashboard");
  const navAI = $("#navAI");
  const navTest = $("#navTest");
  const navAssignment = $("#navAssignment");
  const navProfile = $("#navProfile");
  const toRegister = $("#toRegister");
  const toLogin = $("#toLogin");
  const aiForm = $("#aiForm");
  const aiVoice = $("#aiVoice");
  const aiLanguage = $("#aiLanguage");
  const stopVoiceBtn = $("#stopVoice");
  const voiceEnabled = $("#voiceEnabled");

  if (registerEducation) registerEducation.addEventListener("change", renderBranches);
  if (loginForm) loginForm.addEventListener("submit", login);
  if (registerForm) registerForm.addEventListener("submit", register);
  if (logout) logout.onclick=()=>{ setToken(""); user=null; page("login"); };
  if (navCourses) navCourses.onclick=()=>showCourses();
  if (navDashboard) navDashboard.onclick=()=>showDashboard();
  if (navAI) navAI.onclick=()=>showAI();
  if (navTest) navTest.onclick=()=>showTest();
  if (navAssignment) navAssignment.onclick=()=>showAssignment();
  if (navProfile) navProfile.onclick=()=>showProfile();
  if (toRegister) toRegister.onclick=()=>page("register");
  if (toLogin) toLogin.onclick=()=>page("login");
  if (aiForm) aiForm.addEventListener("submit", askAI);
  if (stopVoiceBtn) stopVoiceBtn.onclick=stopVoice;
  if (voiceEnabled) voiceEnabled.onchange=e=>setVoiceEnabled(e.target.checked);
  if (aiVoice) aiVoice.onchange=e=>{ state.aiVoice=e.target.value; setVoiceStyle(e.target.value); };
  if (aiLanguage) aiLanguage.onchange=e=>{ state.aiLanguage=e.target.value; setSpeechLanguage(e.target.value); };
}

function renderBranches() {
  const education = $("#registerEducation");
  const branch = $("#registerBranch");
  if (!education || !branch) return;

  const branches = educationBranches[education.value] || [];
  branch.innerHTML = `<option value="">Select Branch</option>` + branches.map(b => `<option value="${esc(b)}">${esc(b)}</option>`).join("");
}

async function login(e){ e.preventDefault(); try { const d=await api("/api/auth/login",{method:"POST",body:JSON.stringify({email:$("#loginEmail").value,password:$("#loginPassword").value})}); setToken(d.token); user=d.user; renderApp(); toast("Welcome to SkillNexa!"); } catch(err){toast(err.message);} }
async function register(e){ e.preventDefault(); try { const d=await api("/api/auth/register",{method:"POST",body:JSON.stringify({name:$("#regName").value,email:$("#regEmail").value,password:$("#regPassword").value,education:$("#registerEducation").value,branch:$("#registerBranch").value})}); setToken(d.token); user=d.user; renderApp(); toast("Account created!"); } catch(err){toast(err.message);} }
function renderApp(){ $("#appShell").classList.add("ready"); $("#userName").textContent=user.name; $("#userBranch").textContent=user.branch; $("#points").textContent=user.totalPoints; $("#level").textContent=user.currentLevel; showDashboard(); }
async function refresh(){ user=(await api("/api/me")).user; $("#userName").textContent=user.name; $("#points").textContent=user.totalPoints; $("#level").textContent=user.currentLevel; }

async function boot() {
  bind();
  renderBranches();

  try { await waitForVoices(); }
  catch (err) { console.warn("Voice initialization skipped:", err); }

  try { await loadCourses(); }
  catch (err) { console.warn("Course loading skipped:", err); }

  if (getToken()) {
    try {
      user = (await api("/api/me")).user;
      renderApp();
    } catch {
      setToken("");
      user = null;
      page("login");
    }
  } else {
    $("#appShell").classList.add("ready");
    page("login");
  }
}

async function showDashboard(){ if(!user)return; page("dashboard");
  if(user.role === "admin") {
    try {
      const d = await api("/api/admin/students");
      const students = Array.isArray(d.students) ? d.students : [];
      const summary = d.summary || {};
      const totalPoints = students.reduce((sum, s)=>sum + Number(s.totalPoints || 0), 0);
      const completedTotal = students.reduce((sum, s)=>sum + (Array.isArray(s.completedCourses) ? s.completedCourses.length : 0), 0);
      const branchBreakdown = (summary.branches || []).map(b => `<span class="branch-chip"><b>${esc(b.branch)}</b><small>${b.count}</small></span>`).join("");
      $("#dashboardContent").innerHTML = `<div class="hero"><div><p class="eyebrow">ADMIN DASHBOARD</p><h1>${esc(user.name)} 👋</h1><p>All students • class progress overview</p></div><div class="hero-badge">👑 Admin</div></div>
      <div class="stats"><div><b>${summary.totalStudents ?? students.length}</b><span>Students</span></div><div><b>${summary.totalCompletedCourses ?? completedTotal}</b><span>Courses Completed</span></div><div><b>${summary.totalPoints ?? totalPoints}</b><span>Total Points</span></div></div>
      <div class="card"><h2>Branch Summary</h2><div class="branch-summary">${branchBreakdown || `<span class="branch-chip"><b>All</b><small>0</small></span>`}</div></div>
      <div class="card"><h2>Student Progress</h2><div class="admin-list">
        <div class="admin-list-head"><span>Name</span><span>Branch</span><span>Education</span><span>Level</span><span>Points</span><span>Completed</span></div>
        ${students.map(s => `<div class="admin-student-row"><span><b>${esc(s.name)}</b><small>${esc(s.email)}</small></span><span><b>${esc(s.branch)}</b><small>${esc(s.role || "student")}</small></span><span><b>${esc(s.education)}</b><small>${esc(s.selectedCourse || "No course")}</small></span><span><b>Level ${esc(s.currentLevel)}</b><small>Avg ${esc(summary.averageLevel ?? 1)}</small></span><span><b>${esc(s.totalPoints)}</b><small>points</small></span><span><b>${Array.isArray(s.completedCourses) ? s.completedCourses.length : 0}</b><small>courses</small></span></div>`).join("") || `<p>No students found.</p>`}
      </div></div>`;
      return;
    } catch (e) {
      $("#dashboardContent").innerHTML = `<div class="card"><h2>Admin dashboard</h2><p>${esc(e.message)}</p></div>`;
      return;
    }
  }

  const n=nextLevel(user.totalPoints); const currentLevelIndex=Math.max(0, Math.min(levelInfo.length - 1, (user.currentLevel || 1) - 1)); const currentLevelInfo=levelInfo[currentLevelIndex] || levelInfo[0]; const startPoints=currentLevelInfo.points || 0; const nextPoints=n ? n.points : levelInfo[levelInfo.length - 1].points; const denominator = Math.max(1, nextPoints - startPoints); const numerator = Math.max(0, user.totalPoints - startPoints); const pct=n ? Math.min(100, Math.max(0, Math.round((numerator / denominator) * 100))) : 100; $("#dashboardContent").innerHTML=`<div class="hero"><div><p class="eyebrow">WELCOME BACK</p><h1>${esc(user.name)} 👋</h1><p>${esc(user.branch)} • Keep learning, keep building.</p></div><div class="hero-badge">🏆 Level ${user.currentLevel}</div></div><div class="stats"><div><b>${user.totalPoints}</b><span>Points</span></div><div><b>${user.currentLevel}</b><span>Current Level</span></div><div><b>${user.completedCourses.length}</b><span>Courses Completed</span></div></div><div class="card"><h2>Progress to next level</h2><div class="progress"><i style="width:${pct}%"></i></div><p>${n?`${n.points-user.totalPoints} points remaining for Level ${n.level}.`:`You reached the highest level!`}</p></div><div class="card"><h2>Your selected course</h2><p>${user.selectedCourse?esc(user.selectedCourse.replace(/-/g," ")):"No course selected yet."}</p><button class="primary" id="dashCourses">Explore Courses</button></div>`; $("#dashCourses").onclick=showCourses;
}

async function showCourses(){ page("courses"); const courses=branchCourses(user.branch); $("#coursesTitle").textContent=`Courses for ${user.branch}`; $("#courseGrid").innerHTML=courses.map(c=>`<button class="course-card ${user.selectedCourse===c.id?"selected":""}" data-id="${esc(c.id)}"><span>${c.icon}</span><strong>${esc(c.name)}</strong><small>${esc(c.category)} • 5 levels</small>${user.selectedCourse===c.id?`<em>Selected</em>`:""}</button>`).join(""); document.querySelectorAll(".course-card").forEach(b=>b.onclick=()=>openCourse(b.dataset.id)); }

async function openCourse(id){ try { const d=await selectCourse(id); user=d.user; renderCourse(d.course,d.state); } catch(e){toast(e.message);} }

function openYoutubeSearch(query){
  const url = youtubeUrl(String(query || "SkillNexa learning"));
  try {
    const opened = window.open(url, "_blank", "noopener,noreferrer");
    if (!opened) window.location.href = url;
  } catch {
    window.location.href = url;
  }
}

function renderCourse(c,s){ page("courseDetail"); $("#courseName").textContent=`${c.icon} ${c.name}`; $("#courseMeta").textContent=`${user.branch} • Basics to Pro`; $("#levelList").innerHTML=c.levels.map((x,i)=>{ const unlocked=s.unlocked[i]; const done=s.completed.includes(i+1); return `<div class="level-card ${done?"done":""} ${unlocked?"":"locked"}"><div><span class="level-num">${done?"✓":i+1}</span><div><b>${esc(x.title)}</b><p>${x.topics.length} step-by-step topics</p></div></div><div class="level-actions">${unlocked?`<button class="secondary lessonBtn" data-level="${i+1}">Open</button>`:`<span>🔒 Locked</span>`}${unlocked&&!done?`<button class="primary completeBtn" data-level="${i+1}">Complete +50</button>`:""}</div></div>`}).join(""); document.querySelectorAll(".lessonBtn").forEach(b=>b.onclick=()=>openLesson(c,Number(b.dataset.level))); document.querySelectorAll(".completeBtn").forEach(b=>b.onclick=async()=>{try{const d=await completeLevel(c.id,Number(b.dataset.level));user=d.user;renderCourse(d.course||c,d.state);toast("Level completed! +50 points");}catch(e){toast(e.message);}}); $("#certificateBtn").style.display=user.completedCourses.includes(c.id)?"inline-flex":"none"; $("#certificateBtn").onclick=showCertificate; }

function openLesson(c,n){
  const l=c.levels[n-1];
  page("lesson");
  $("#lessonTitle").textContent=`Level ${n} — ${l.title}`;

  const renderConcept = (topic, index) => {
    const title = topic?.title || `Concept ${index + 1}`;
    const definition = topic?.definition || `Definition for ${title}.`;
    const explanation = topic?.explanation || `Explanation for ${title}.`;
    const example = topic?.example || `Example for ${title}.`;
    const status = topicStatus(c.id, n, title);
    const done = status === "Completed";
    return `<article class="lesson-document-card">
      <div class="lesson-document-head">
        <span class="lesson-document-tag">Course Document</span>
        <h3>${esc(title)}</h3>
      </div>
      <div class="lesson-doc-aligned">
        <section class="lesson-doc-section">
          <span class="lesson-doc-label">Definition</span>
          <p>${esc(definition)}</p>
        </section>
        <section class="lesson-doc-section">
          <span class="lesson-doc-label">Explanation</span>
          <p>${esc(explanation)}</p>
        </section>
        <section class="lesson-doc-section">
          <span class="lesson-doc-label">Example</span>
          <pre class="lesson-example"><code>${esc(example)}</code></pre>
        </section>
      </div>
      <div class="lesson-links">
        <button class="secondary" data-youtube="${esc(c.name + " " + title + " tutorial")}">🎥 YouTube</button>
        <button class="secondary" data-speak="${esc(`Learn ${title} in ${c.name}.`)}">🔊 Listen</button>
      </div>
      <div class="lesson-document-completion-area" data-topic-key="${esc(topicCompletionKey(c.id, n, title))}">${done ? '<span class="topic-completion-badge">✓ Completed</span>' : ''}</div>
    </article>`;
  };

  const topicButtons = l.topics.map((topic, i) => `<button class="lesson-topic-button ${i === 0 ? 'active' : ''}" data-topic-index="${i}">${esc(topic.title)} <span class="topic-status-mini">${topicStatus(c.id, n, topic.title)}</span></button>`).join("");
  $("#lessonBody").innerHTML=`<div class="lesson-document-shell">
    <div class="lesson-topic-buttons">${topicButtons}</div>
    <div class="lesson-document-content">${renderConcept(l.topics[0], 0)}</div>
  </div>`;

  document.querySelectorAll(".lesson-topic-button").forEach(b => {
    b.onclick = () => {
      const idx = Number(b.dataset.topicIndex);
      document.querySelectorAll(".lesson-topic-button").forEach(x => x.classList.toggle("active", x === b));
      $(".lesson-document-content").innerHTML = renderConcept(l.topics[idx], idx);
      document.querySelectorAll("[data-speak]").forEach(s => s.onclick = () => speak(s.dataset.speak, $("#aiLanguage").value, $("#aiVoice").value));
      document.querySelectorAll("[data-youtube]").forEach(y => y.onclick = () => openYoutubeSearch(y.dataset.youtube));
      startWatchTracker(c, n, l.topics[idx].title);
    };
  });

  document.querySelectorAll("[data-speak]").forEach(b => b.onclick = () => speak(b.dataset.speak, $("#aiLanguage").value, $("#aiVoice").value));
  document.querySelectorAll("[data-youtube]").forEach(y => y.onclick = () => openYoutubeSearch(y.dataset.youtube));
  startWatchTracker(c, n, l.topics[0].title);
}

async function showAI(){ page("ai"); if(!user.selectedCourse) toast("Select a course first for better AI context."); }
async function askAI(e){ e.preventDefault(); const q=$("#aiInput").value.trim(); if(!q)return; $("#aiAnswer").innerHTML=`<div class="typing">NEXA is thinking…</div>`; try{const d=await api("/api/ai",{method:"POST",body:JSON.stringify({question:q,language:($("#aiLanguage").value||"Auto")})}); $("#aiAnswer").innerHTML=`<div class="answer">${esc(d.answer).replace(/\n/g,"<br>")}${d.liveSource?`<p><a target="_blank" href="${esc(d.liveUrl)}">Verified source: ${esc(d.liveSource)}</a></p>`:""}</div>`; speak(d.answer,$("#aiLanguage").value,$("#aiVoice").value); }catch(e){toast(e.message);} }
async function showTest(){ page("test"); $("#testArea").innerHTML=`<div class="card"><h2>Daily Test</h2><p>10 questions • 100 marks • earn 10 points for every correct answer.</p><button class="primary" id="startTestInner">Start Personalized Test</button></div>`; $("#startTestInner").onclick=startTest; }
async function startTest(){ try{const d=await api("/api/test/generate",{method:"POST",body:"{}"}); testId=d.testId; testQuestions=d.questions; $("#testArea").innerHTML=testQuestions.map((q,i)=>`<div class="card question"><b>${i+1}. ${esc(q.question)}</b>${q.options.map((o,j)=>`<label><input type="radio" name="q${i}" value="${j}">${esc(o)}</label>`).join("")}</div>`).join("")+`<button class="primary" id="submitTestInner">Submit Test</button>`; $("#submitTestInner").onclick=submitTest;}catch(e){toast(e.message);} }
async function submitTest(){ if(!testId)return; const answers=testQuestions.map((_,i)=>Number(document.querySelector(`input[name="q${i}"]:checked`)?.value ?? -1)); try{const d=await api("/api/test/submit",{method:"POST",body:JSON.stringify({testId,answers})}); await refresh(); $("#testArea").innerHTML=`<div class="result"><h2>🎉 Test Complete</h2><p>Score: <b>${d.score}/100</b></p><p>Points earned: <b>+${d.points}</b></p><p>Total points: <b>${d.totalPoints}</b></p><p>Current level: <b>${d.level}</b></p></div>`; testId=null;}catch(e){toast(e.message);} }
async function showAssignment(){ page("assignment"); $("#assignmentArea").innerHTML=`<div class="card"><h2>Assignment</h2><p>Complete a practical task from your selected course. A successful submission gives <b>50 points</b>.</p><button class="primary" id="startAssignmentInner">Start Assignment</button></div>`; $("#startAssignmentInner").onclick=startAssignment; }
async function startAssignment(){try{const d=await api("/api/assignment/start",{method:"POST",body:"{}"});assignmentId=d.task.id;$("#assignmentArea").innerHTML=`<div class="card"><h2>${esc(d.task.title)}</h2><p>${esc(d.task.prompt)}</p><textarea id="assignmentAnswer" placeholder="Write your solution, steps, explanation or code here..."></textarea><button class="primary" id="submitAssignmentInner">Submit +50 Points</button></div>`;$("#submitAssignmentInner").onclick=submitAssignment;}catch(e){toast(e.message);}}
async function submitAssignment(){try{const d=await api("/api/assignment/submit",{method:"POST",body:JSON.stringify({assignmentId,answer:$("#assignmentAnswer").value})});await refresh();$("#assignmentArea").innerHTML=`<div class="result"><h2>✅ Assignment Submitted</h2><p>Points earned: <b>+${d.points}</b></p><p>Total points: <b>${d.totalPoints}</b></p></div>`;assignmentId=null;}catch(e){toast(e.message);}}
function showProfile(){page("profile");$("#profileArea").innerHTML=`<div class="card profile"><div class="avatar">${esc(user.name[0]||"S").toUpperCase()}</div><h2>${esc(user.name)}</h2><p>${esc(user.email)}</p><p>${esc(user.education)} • ${esc(user.branch)}</p><div class="stats"><div><b>${user.totalPoints}</b><span>Points</span></div><div><b>${user.currentLevel}</b><span>Level</span></div></div></div>`;}
async function showCertificate(){try{const d=await api("/api/certificate");page("certificate");$("#certificateArea").innerHTML=`<div class="certificate"><div class="cert-brand">SKILLNEXA</div><div class="cert-title">CERTIFICATE OF COMPLETION</div><p>This certificate is proudly presented to</p><h1>${esc(d.name)}</h1><p>for successfully completing the course</p><h2>${esc(d.course)}</h2><div class="appreciation">Your dedication, consistency, and commitment to learning are truly appreciated.<br>Keep learning, keep building, and keep growing.</div><div class="cert-footer"><span>SkillNexa Learning Platform</span><span>${new Date(d.completedAt).toLocaleDateString()}</span></div></div><div class="cert-buttons"><button class="primary" onclick="window.print()">🖨️ Print / Save PDF</button><button class="secondary" id="backCourse">Back to Course</button></div>`;$("#backCourse").onclick=()=>showCourses();}catch(e){toast(e.message);}}

window.addEventListener("load", boot);
