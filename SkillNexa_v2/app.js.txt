import { api, setToken, getToken } from "./api.js";
import { educationBranches, levelInfo } from "./data.js";
import { loadCourses, branchCourses, selectCourse, currentCourse, completeLevel, youtubeUrl } from "./courses.js";
import { speak, stopVoice, setVoiceEnabled, waitForVoices } from "./voice.js";

const $ = s => document.querySelector(s); const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
let user = null; let testId = null; let testQuestions = []; let assignmentId = null;
const state = { page:"login", aiLanguage:"Auto", aiVoice:"Female" };

function page(id) { document.querySelectorAll(".page").forEach(x => x.classList.remove("active")); const p = document.getElementById(id); if (p) p.classList.add("active"); state.page=id; }
function toast(msg) { const t = $("#toast"); t.textContent=msg; t.classList.add("show"); setTimeout(()=>t.classList.remove("show"),2800); }
function level(points) { let l=1; levelInfo.forEach(x=>{ if(points>=x.points) l=x.level; }); return l; }
function nextLevel(points) { const l=level(points); return levelInfo[l] || null; }

async function boot() {
  // Bind the authentication controls first. Do not let optional API/course
  // loading prevent Create Account or Login from working.
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
  branch.innerHTML = `<option value="">Select Branch</option>` +
    branches.map(b => `<option value="${esc(b)}">${esc(b)}</option>`).join("");
}
async function login(e){ e.preventDefault(); try { const d=await api("/api/auth/login",{method:"POST",body:JSON.stringify({email:$("#loginEmail").value,password:$("#loginPassword").value})}); setToken(d.token); user=d.user; renderApp(); toast("Welcome to SkillNexa!"); } catch(err){toast(err.message);} }
async function register(e){ e.preventDefault(); try { const d=await api("/api/auth/register",{method:"POST",body:JSON.stringify({name:$("#regName").value,email:$("#regEmail").value,password:$("#regPassword").value,education:$("#registerEducation").value,branch:$("#registerBranch").value})}); setToken(d.token); user=d.user; renderApp(); toast("Account created!"); } catch(err){toast(err.message);} }
function renderApp(){ $("#appShell").classList.add("ready"); $("#userName").textContent=user.name; $("#userBranch").textContent=user.branch; $("#points").textContent=user.totalPoints; $("#level").textContent=user.currentLevel; showDashboard(); }
async function refresh(){ user=(await api("/api/me")).user; $("#userName").textContent=user.name; $("#points").textContent=user.totalPoints; $("#level").textContent=user.currentLevel; }
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

  const n=nextLevel(user.totalPoints); const currentLevelIndex=Math.max(0, Math.min(levelInfo.length - 1, (user.currentLevel || 1) - 1)); const currentLevelInfo=levelInfo[currentLevelIndex] || levelInfo[0]; const startPoints=currentLevelInfo.points || 0; const nextPoints=n ? n.points : levelInfo[levelInfo.length - 1].points; const denominator = Math.max(1, nextPoints - startPoints); const numerator = Math.max(0, user.totalPoints - startPoints); const pct=n ? Math.min(100, Math.max(0, Math.round((numerator / denominator) * 100))) : 100; $("#dashboardContent").innerHTML=`<div class="hero"><div><p class="eyebrow">WELCOME BACK</p><h1>${esc(user.name)} 👋</h1><p>${esc(user.branch)} • Keep learning, keep building.</p></div><div class="hero-badge">🏆 Level ${user.currentLevel}</div></div><div class="stats"><div><b>${user.totalPoints}</b><span>Points</span></div><div><b>${user.currentLevel}</b><span>Current Level</span></div><div><b>${user.completedCourses.length}</b><span>Courses Completed</span></div></div><div class="card"><h2>Progress to next level</h2><div class="progress"><i style="width:${pct}%"></i></div><p>${n?`${n.points-user.totalPoints} points remaining for Level ${n.level}.`:`You reached the highest level!`}</p></div><div class="card"><h2>Your selected course</h2><p>${user.selectedCourse?esc(user.selectedCourse.replace(/-/g," ")):"No course selected yet."}</p><button class="primary" id="dashCourses">Explore Courses</button></div>`; $("#dashCourses").onclick=showCourses; }
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
        <button class="primary mark-topic-btn" data-topic-title="${esc(title)}">Mark as Completed</button>
      </div>
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
      document.querySelectorAll(".mark-topic-btn").forEach(btn => btn.onclick = async () => {
        try {
          const d = await api("/api/topic/complete", { method: "POST", body: JSON.stringify({ courseId: c.id, level: n, topicTitle: btn.dataset.topicTitle }) });
          user = d.user;
          refresh();
          renderCourse(c, { completed: [], unlocked: c.levels.map((_, i) => i === 0 || (user.completedLevels?.[c.id] || []).includes(i)), courseId: c.id });
          toast(d.message || "Topic marked completed.");
          openLesson(c, n);
        } catch (e) {
          toast(e.message);
        }
      });
    };
  });

  document.querySelectorAll("[data-speak]").forEach(b => b.onclick = () => speak(b.dataset.speak, $("#aiLanguage").value, $("#aiVoice").value));
  document.querySelectorAll("[data-youtube]").forEach(y => y.onclick = () => openYoutubeSearch(y.dataset.youtube));
  document.querySelectorAll(".mark-topic-btn").forEach(btn => btn.onclick = async () => {
    try {
      const d = await api("/api/topic/complete", { method: "POST", body: JSON.stringify({ courseId: c.id, level: n, topicTitle: btn.dataset.topicTitle }) });
      user = d.user;
      refresh();
      toast(d.message || "Topic marked completed.");
      renderCourse(c, { completed: user.completedLevels?.[c.id] || [], unlocked: c.levels.map((_, i) => i === 0 || (user.completedLevels?.[c.id] || []).includes(i)), courseId: c.id });
      openLesson(c, n);
    } catch (e) {
      toast(e.message);
    }
  });
}
async function showAI(){ page("ai"); if(!user.selectedCourse) toast("Select a course first for better AI context."); }
async function askAI(e){ e.preventDefault(); const q=$("#aiInput").value.trim(); if(!q)return; $("#aiAnswer").innerHTML=`<div class="typing">NEXA is thinking…</div>`; try{const d=await api("/api/ai",{method:"POST",body:JSON.stringify({question:q})}); $("#aiAnswer").innerHTML=`<div class="answer">${esc(d.answer).replace(/\n/g,"<br>")}${d.liveSource?`<p><a target="_blank" href="${esc(d.liveUrl)}">Verified source: ${esc(d.liveSource)}</a></p>`:""}</div>`; if($("#voiceEnabled").checked)speak(d.answer,$("#aiLanguage").value,$("#aiVoice").value); }catch(e){toast(e.message);} }
async function showTest(){ page("test"); $("#testArea").innerHTML=`<div class="card"><h2>Daily Test</h2><p>10 questions • 100 marks • earn 10 points for every correct answer.</p><button class="primary" id="startTestInner">Start Personalized Test</button></div>`; $("#startTestInner").onclick=startTest; }
async function startTest(){ try{const d=await api("/api/test/generate",{method:"POST",body:"{}"}); testId=d.testId; testQuestions=d.questions; $("#testArea").innerHTML=testQuestions.map((q,i)=>`<div class="card question"><b>${i+1}. ${esc(q.question)}</b>${q.options.map((o,j)=>`<label><input type="radio" name="q${i}" value="${j}"> ${esc(o)}</label>`).join("")}</div>`).join("")+`<button class="primary" id="submitTestInner">Submit Test</button>`; $("#submitTestInner").onclick=submitTest;}catch(e){toast(e.message);} }
async function submitTest(){ if(!testId)return; const answers=testQuestions.map((_,i)=>Number(document.querySelector(`input[name="q${i}"]:checked`)?.value ?? -1)); try{const d=await api("/api/test/submit",{method:"POST",body:JSON.stringify({testId,answers})}); await refresh(); $("#testArea").innerHTML=`<div class="result"><h2>🎉 Test Complete</h2><p>Score: <b>${d.score}/100</b></p><p>Points earned: <b>+${d.points}</b></p><p>Total points: <b>${d.totalPoints}</b></p><p>Current level: <b>${d.level}</b></p></div>`; testId=null;}catch(e){toast(e.message);} }
async function showAssignment(){ page("assignment"); $("#assignmentArea").innerHTML=`<div class="card"><h2>Assignment</h2><p>Complete a practical task from your selected course. A successful submission gives <b>50 points</b>.</p><button class="primary" id="startAssignmentInner">Start Assignment</button></div>`; $("#startAssignmentInner").onclick=startAssignment; }
async function startAssignment(){try{const d=await api("/api/assignment/start",{method:"POST",body:"{}"});assignmentId=d.task.id;$("#assignmentArea").innerHTML=`<div class="card"><h2>${esc(d.task.title)}</h2><p>${esc(d.task.prompt)}</p><textarea id="assignmentAnswer" placeholder="Write your solution, steps, explanation or code here..."></textarea><button class="primary" id="submitAssignmentInner">Submit +50 Points</button></div>`;$("#submitAssignmentInner").onclick=submitAssignment;}catch(e){toast(e.message);}}
async function submitAssignment(){try{const d=await api("/api/assignment/submit",{method:"POST",body:JSON.stringify({assignmentId,answer:$("#assignmentAnswer").value})});await refresh();$("#assignmentArea").innerHTML=`<div class="result"><h2>✅ Assignment Submitted</h2><p>Points earned: <b>+${d.points}</b></p><p>Total points: <b>${d.totalPoints}</b></p></div>`;assignmentId=null;}catch(e){toast(e.message);}}
function showProfile(){page("profile");$("#profileArea").innerHTML=`<div class="card profile"><div class="avatar">${esc(user.name[0]||"S").toUpperCase()}</div><h2>${esc(user.name)}</h2><p>${esc(user.email)}</p><p>${esc(user.education)} • ${esc(user.branch)}</p><div class="stats"><div><b>${user.totalPoints}</b><span>Points</span></div><div><b>${user.currentLevel}</b><span>Level</span></div></div></div>`;}
async function showCertificate(){try{const d=await api("/api/certificate");page("certificate");$("#certificateArea").innerHTML=`<div class="certificate"><div class="cert-brand">SKILLNEXA</div><div class="cert-title">CERTIFICATE OF COMPLETION</div><p>This certificate is proudly presented to</p><h1>${esc(d.name)}</h1><p>for successfully completing the course</p><h2>${esc(d.course)}</h2><div class="appreciation">Your dedication, consistency, and commitment to learning are truly appreciated.<br>Keep learning, keep building, and keep growing.</div><div class="cert-footer"><span>SkillNexa Learning Platform</span><span>${new Date(d.completedAt).toLocaleDateString()}</span></div></div><div class="cert-buttons"><button class="primary" onclick="window.print()">🖨️ Print / Save PDF</button><button class="secondary" id="backCourse">Back to Course</button></div>`;$("#backCourse").onclick=()=>showCourses();}catch(e){toast(e.message);}}

window.addEventListener("load",boot);
