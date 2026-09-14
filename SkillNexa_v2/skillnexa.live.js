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

const LANGS = { Auto:"en-IN", English:"en-IN", Telugu:"te-IN", Hindi:"hi-IN", Tamil:"ta-IN", Kannada:"kn-IN", Malayalam:"ml-IN", Marathi:"mr-IN", Bengali:"bn-IN", Gujarati:"gu-IN", Punjabi:"pa-IN"};
let enabled = false;
let current = null;
function setVoiceEnabled(v) { enabled = Boolean(v); if (!enabled) stopVoice(); return enabled; }
function isVoiceEnabled() { return enabled; }
function stopVoice() { if ("speechSynthesis" in window) window.speechSynthesis.cancel(); current = null; }
function speak(text, language = "Auto", style = "Female") {
  if (!("speechSynthesis" in window)) return false;
  stopVoice(); const u = new SpeechSynthesisUtterance(String(text).slice(0, 12000)); const lang = LANGS[language] || LANGS.Auto; u.lang = lang;
  const voices = window.speechSynthesis.getVoices(); const matches = voices.filter(v => v.lang?.toLowerCase().startsWith(lang.split("-")[0].toLowerCase()));
  const male = /male|david|mark|ravi|google uk english male/i; const female = /female|zira|samantha|google uk english female|heera/i;
  if (style === "Male") u.voice = matches.find(v => male.test(v.name)) || matches[0]; else u.voice = matches.find(v => female.test(v.name)) || matches[0];
  if (style === "Sweet") { u.rate = 0.9; u.pitch = 1.15; } else if (style === "Deep") { u.rate = 0.85; u.pitch = 0.7; } else { u.rate = 0.98; u.pitch = 1; }
  u.onend = () => { current = null; }; current = u; window.speechSynthesis.speak(u); return true;
}
function waitForVoices() { return new Promise(resolve => { if (!("speechSynthesis" in window)) return resolve([]); const v = speechSynthesis.getVoices(); if (v.length) return resolve(v); speechSynthesis.onvoiceschanged = () => resolve(speechSynthesis.getVoices()); }); }

const firebaseConfig = {
  apiKey: "AIzaSyAiKTPs5eS8_kbsOZsAMOokrcWT80Jugg4",
  authDomain: "skill-nexa-25a33.firebaseapp.com",
  projectId: "skill-nexa-25a33",
  storageBucket: "skill-nexa-25a33.appspot.com",
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
const state = { page:"login", aiLanguage:"Auto", aiVoice:"Female" };
let currentVideoPlayer = null;

function page(id) { document.querySelectorAll(".page").forEach(x => x.classList.remove("active")); const p = document.getElementById(id); if (p) p.classList.add("active"); state.page=id; }
function toast(msg) { const t = $("#toast"); t.textContent=msg; t.classList.add("show"); setTimeout(()=>t.classList.remove("show"),2800); }
function level(points) { let l=1; levelInfo.forEach(x=>{ if(points>=x.points) l=x.level; }); return l; }
function nextLevel(points) { const l=level(points); return levelInfo[l] || null; }

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
}

function renderBranches() {
  const education = $("#registerEducation");
  const branch = $("#registerBranch");
  if (!education || !branch) return;

  const branches = educationBranches[education.value] || [];
  branch.innerHTML = `<option value="">Select Branch</option>` + branches.map(b => `<option value="${esc(b)}">${esc(b)}</option>`).join("");
}

async function login(e){ e.preventDefault(); try { const d=await api("/api/auth/login",{method:"POST",body:JSON.stringify({email:$("#loginEmail").value,password:$("#loginPassword").value})}); setToken(d.token); user=d.user; renderApp(); page("dashboard"); } catch(e){ toast(e.message); } }
async function register(e){ e.preventDefault(); try { const d=await api("/api/auth/register",{method:"POST",body:JSON.stringify({name:$("#regName").value,email:$("#regEmail").value,password:$("#regPassword").value,education:$("#regEducation").value,branch:$("#regBranch").value})}); setToken(d.token); user=d.user; renderApp(); page("dashboard"); } catch(e){ toast(e.message); } }
function renderApp(){ $("#appShell").classList.add("ready"); $("#userName").textContent=user.name; $("#userBranch").textContent=user.branch; $("#points").textContent=user.totalPoints; $("#level").textContent=user.currentLevel; }
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
      $("#dashboardContent").innerHTML = `<div class="hero"><div><p class="eyebrow">ADMIN DASHBOARD</p><h1>${esc(user.name)} 👋</h1><p>All students • class progress overview</p></div><div class="stats"><div><b>${summary.totalStudents ?? students.length}</b><span>Students</span></div><div><b>${summary.totalCompletedCourses ?? completedTotal}</b><span>Courses Completed</span></div><div><b>${summary.averagePoints ?? 0}</b><span>Avg Points</span></div></div></div><div class="card"><h2>Branch Summary</h2><div class="branch-summary">${branchBreakdown || `<span class="branch-chip"><b>All</b><small>0</small></span>`}</div></div><div class="card"><h2>Student Progress</h2><div class="admin-list"><div class="admin-list-head"><span>Name</span><span>Branch</span><span>Education</span><span>Level</span><span>Points</span><span>Completed</span></div>${students.map(s => `<div class="admin-student-row"><span><b>${esc(s.name)}</b><small>${esc(s.email)}</small></span><span><b>${esc(s.branch)}</b><small>${esc(s.role || "student")}</small></span><span>${esc(s.education)}</span><span><b>${s.currentLevel || 1}</b></span><span><b>${s.totalPoints || 0}</b></span><span>${Array.isArray(s.completedCourses) ? s.completedCourses.length : 0}</span></div>`).join("")}</div></div>`;
      return;
    } catch (e) {
      $("#dashboardContent").innerHTML = `<div class="card"><h2>Admin dashboard</h2><p>${esc(e.message)}</p></div>`;
      return;
    }
  }

  const n=nextLevel(user.totalPoints); const currentLevelIndex=Math.max(0, Math.min(levelInfo.length - 1, (user.currentLevel || 1) - 1)); const currentLevelInfo=levelInfo[currentLevelIndex] || levelInfo[0]; $("#dashboardContent").innerHTML=`<div class="hero"><div><p class="eyebrow">YOUR PROGRESS</p><h1>${esc(user.name)} 👋</h1><p>Level ${user.currentLevel} • ${user.totalPoints} points</p></div><div class="progress-bar"><div class="progress-fill" style="width:${user.totalPoints > n?.points ? 100 : Math.round((user.totalPoints / Math.max(1, n?.points || 100)) * 100)}%"></div></div><p class="progress-text">${user.totalPoints} / ${n?.points || 5200} to Level ${(user.currentLevel || 1) + 1}</p></div><div class="card"><h2>Completed Courses</h2><p>${Array.isArray(user.completedCourses) ? user.completedCourses.length : 0} courses</p></div>`;
}

async function showCourses(){ page("courses"); const courses=branchCourses(user.branch); $("#coursesTitle").textContent=`Courses for ${user.branch}`; $("#courseGrid").innerHTML=courses.map(c=>`<button onclick="openCourse('${c.id}')" class="course-card"><div class="course-icon">${c.icon}</div><div class="course-name">${esc(c.name)}</div><small>${c.category}</small></button>`).join(""); }

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

function renderCourse(c,s){ page("courseDetail"); $("#courseName").textContent=`${c.icon} ${c.name}`; $("#courseMeta").textContent=`${user.branch} • Basics to Pro`; $("#levelList").innerHTML=c.levels.map((l,i)=>`<button class="level-button ${s.unlocked[i] ? "" : "locked"}" onclick="openLesson(${i}, ${c.id})">${s.unlocked[i] ? "✓" : "🔒"} Level ${i+1}: ${esc(l.title)}</button>`).join(""); }

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

function openLesson(levelIndex, courseId){
  const courseIdStr = String(courseId);
  const c = Object.values(allCourses).flat().find(course => course.id === courseIdStr);
  if (!c) { toast("Course not found"); return; }
  
  const n = levelIndex + 1;
  const l = c.levels[levelIndex];
  page("lesson");
  $("#lessonTitle").textContent=`Level ${n} — ${l.title}`;

  const renderConcept = (topic, index) => {
    const title = topic?.title || `Concept ${index + 1}`;
    const definition = topic?.definition || `Definition for ${title}.`;
    const explanation = topic?.explanation || `Explanation for ${title}.`;
    const example = topic?.example || `Example for ${title}.`;
    const status = topicStatus(c.id, n, title);
    const statusClass = status.toLowerCase().replace(/\s+/g, '-');
    return `<article class="lesson-document-card">
      <div class="lesson-document-head">
        <span class="lesson-document-tag">Course Document</span>
        <h3>${esc(title)}</h3>
        <span class="topic-status ${statusClass}">${status}</span>
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
    </article>`;
  };

  const topicButtons = l.topics.map((topic, i) => `<button class="lesson-topic-button ${i === 0 ? 'active' : ''}" data-topic-index="${i}">${esc(topic.title)} <span class="topic-status-mini">${topicStatus(c.id, n, topic.title).toLowerCase().replace(/\s+/g, '-')}</span></button>`).join("");
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
    };
  });

  document.querySelectorAll("[data-speak]").forEach(b => b.onclick = () => speak(b.dataset.speak, $("#aiLanguage").value, $("#aiVoice").value));
  document.querySelectorAll("[data-youtube]").forEach(y => y.onclick = () => openYoutubeSearch(y.dataset.youtube));
}

async function showAI(){ page("ai"); if(!user.selectedCourse) toast("Select a course first for better AI context."); }
async function askAI(e){ e.preventDefault(); const q=$("#aiInput").value.trim(); if(!q)return; $("#aiAnswer").innerHTML=`<div class="typing">NEXA is thinking…</div>`; try{const d=await api("/api/ai",{method:"POST",body:JSON.stringify({question:q})}); $("#aiAnswer").innerHTML=`<div class="ai-answer">${esc(d.answer)}</div>` + (d.liveSource ? `<p class="ai-source">Source: ${d.liveSource}</p>` : ""); $("#aiInput").value=""; } catch(e){ $("#aiAnswer").innerHTML=`<div class="error">${esc(e.message)}</div>`; } }
async function showTest(){ page("test"); $("#testArea").innerHTML=`<div class="card"><h2>Daily Test</h2><p>10 questions • 100 marks • earn 10 points for every correct answer.</p><button class="primary" onclick="startTest()">Generate Test</button></div>`; }
async function startTest(){ try{const d=await api("/api/test/generate",{method:"POST",body:"{}"}); testId=d.testId; testQuestions=d.questions; $("#testArea").innerHTML=testQuestions.map((q,i)=>`<div class="test-question"><p><b>Q${i+1}.</b> ${esc(q.question)}</p><div class="options">${q.options.map((o,j)=>`<label><input type="radio" name="q${i}" value="${j}"> ${esc(o)}</label>`).join("")}</div></div>`).join("") + `<button class="primary" onclick="submitTest()">Submit Test</button>`; } catch(e){toast(e.message);} }
async function submitTest(){ if(!testId)return; const answers=testQuestions.map((_,i)=>Number(document.querySelector(`input[name="q${i}"]:checked`)?.value ?? -1)); try{const d=await api("/api/test/submit",{method:"POST",body:JSON.stringify({testId,answers})}); toast(d.message); refresh(); showTest(); } catch(e){toast(e.message);} }
async function showAssignment(){ page("assignment"); $("#assignmentArea").innerHTML=`<div class="card"><h2>Assignment</h2><p>Complete a practical task from your selected course. A successful submission earns 20 points.</p><button class="primary" onclick="startAssignment()">Start Assignment</button></div>`; }
async function startAssignment(){try{const d=await api("/api/assignment/start",{method:"POST",body:"{}"}); assignmentId=d.task.id; $("#assignmentArea").innerHTML=`<div class="card"><h2>${esc(d.task.title)}</h2><p>${esc(d.task.prompt)}</p><div class="questions">${d.task.questions.map((q,i)=>`<div class="q"><p><b>Q${i+1}.</b> ${esc(q.question)}</p></div>`).join("")}</div><textarea id="assignmentAnswer" placeholder="Type your answer here (minimum 20 characters)…" class="full-width"></textarea><button class="primary" onclick="submitAssignment()">Submit</button></div>`; } catch(e){toast(e.message);} }
async function submitAssignment(){try{const d=await api("/api/assignment/submit",{method:"POST",body:JSON.stringify({assignmentId,answer:$("#assignmentAnswer").value})}); await refresh(); $("#assignmentArea").innerHTML=`<div class="card"><h2>${d.passed ? "✓ Passed" : "✗ Not yet"}</h2><p>${d.message}</p><button class="primary" onclick="showAssignment()">Back</button></div>`; } catch(e){toast(e.message);} }
function showProfile(){page("profile");$("#profileArea").innerHTML=`<div class="card profile"><div class="avatar">${esc(user.name[0]||"S").toUpperCase()}</div><h2>${esc(user.name)}</h2><p>${esc(user.email)}</p><p>Level ${user.currentLevel} • ${user.totalPoints} points</p><p>${user.branch} — ${user.education}</p><button class="primary" onclick="showCertificate()">View Certificate</button></div>`; }
async function showCertificate(){try{const d=await api("/api/certificate");page("certificate");$("#certificateArea").innerHTML=`<div class="certificate"><div class="cert-brand">SKILLNEXA</div><div class="cert-text"><p class="cert-title">Certificate of Completion</p><p class="cert-name">${esc(user.name)}</p><p class="cert-desc">For successfully completing</p><p class="cert-course">${esc(d.courseName || "Course")}</p><p class="cert-date">${new Date().toLocaleDateString()}</p></div></div>`; } catch(e){toast(e.message);} }

window.addEventListener("load", boot);
