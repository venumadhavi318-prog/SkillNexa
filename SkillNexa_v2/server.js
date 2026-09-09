const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { URL } = require("url");

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, "public");
const ENV_FILE = path.join(PUBLIC, ".env");

if (fs.existsSync(ENV_FILE)) {
  require("dotenv").config({ path: ENV_FILE });
} else {
  require("dotenv").config();
}

const PORT = Number(process.env.PORT || 3000);
const STUDENTS_FILE = path.join(ROOT, "students.json");
const JWT_SECRET = process.env.JWT_SECRET || "dev-only-change-me";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";
const ADMIN_EMAIL_1 = process.env.ADMIN_EMAIL_1 || "";
const ADMIN_PASSWORD_1 = process.env.ADMIN_PASSWORD_1 || "";
const ADMIN_EMAIL_2 = process.env.ADMIN_EMAIL_2 || "";
const ADMIN_PASSWORD_2 = process.env.ADMIN_PASSWORD_2 || "";

function adminAccounts() {
  return [
    { id: "admin-1", name: "Admin One", email: ADMIN_EMAIL_1, password: ADMIN_PASSWORD_1, role: "admin", education: "Admin", branch: "Admin" },
    { id: "admin-2", name: "Admin Two", email: ADMIN_EMAIL_2, password: ADMIN_PASSWORD_2, role: "admin", education: "Admin", branch: "Admin" }
  ].filter(a => a.email && a.password);
}

function builtInAdminFromLogin(email, password) {
  const admin = adminAccounts().find(a => a.email.toLowerCase() === String(email || "").trim().toLowerCase() && a.password === String(password || ""));
  if (!admin) return null;
  return {
    id: admin.id,
    name: admin.name,
    email: admin.email,
    education: admin.education,
    branch: admin.branch,
    role: admin.role,
    selectedCourse: null,
    totalPoints: 0,
    currentLevel: 1,
    completedCourses: [],
    completedLevels: {},
    assignmentHistory: [],
    testHistory: [],
    createdAt: new Date().toISOString()
  };
}

const COURSES = {
  CSE: [
    course("Python", "🐍", "Programming", ["Python Basics", "Core Python", "Intermediate Python", "Advanced Python", "Python Pro"]),
    course("C Programming", "©️", "Programming", ["C Basics", "Core C", "Pointers & Memory", "Data Structures in C", "C Pro"]),
    course("C++", "⚙️", "Programming", ["C++ Basics", "OOP", "STL", "Advanced C++", "C++ Pro"]),
    course("Java", "☕", "Programming", ["Java Basics", "OOP", "Collections", "Advanced Java", "Java Pro"]),
    course("Web Development", "🌐", "Web", ["HTML & CSS", "JavaScript Basics", "DOM & APIs", "Frontend Projects", "Web Pro"]),
    course("SQL", "🗄️", "Database", ["SQL Basics", "Queries", "Joins", "Database Design", "SQL Pro"])
  ],
  CSM: [
    course("Python", "🐍", "AI/Data", ["Python Basics", "Core Python", "NumPy & Pandas", "Data Analysis", "Python Pro"]),
    course("Data Science", "📊", "AI/Data", ["Data Basics", "Statistics", "Pandas", "ML Basics", "Data Science Pro"]),
    course("Machine Learning", "🤖", "AI", ["ML Basics", "Data Preparation", "Models", "Evaluation", "ML Pro"]),
    course("SQL", "🗄️", "Database", ["SQL Basics", "Queries", "Joins", "Database Design", "SQL Pro"]),
    course("Python Projects", "🚀", "Projects", ["Project Basics", "APIs", "Automation", "Portfolio Project", "Project Pro"])
  ],
  "Data Science": [
    course("Python", "🐍", "Programming", ["Python Basics", "Core Python", "NumPy & Pandas", "Advanced Python", "Python Pro"]),
    course("SQL", "🗄️", "Database", ["SQL Basics", "Queries", "Joins", "Database Design", "SQL Pro"]),
    course("Data Analysis", "📊", "Data", ["Data Basics", "Cleaning", "Visualization", "Analytics", "Data Pro"]),
    course("Machine Learning", "🤖", "AI", ["ML Basics", "Data Preparation", "Models", "Evaluation", "ML Pro"])
  ],
  ECE: [
    course("C Programming", "©️", "Programming", ["C Basics", "Core C", "Pointers", "Embedded C", "C Pro"]),
    course("Python", "🐍", "Programming", ["Python Basics", "Core Python", "Automation", "Data Handling", "Python Pro"]),
    course("Embedded Systems", "🔌", "Electronics", ["Embedded Basics", "Microcontrollers", "GPIO & Timers", "Communication", "Embedded Pro"]),
    course("MATLAB", "📐", "Engineering", ["MATLAB Basics", "Arrays", "Plots", "Simulation", "MATLAB Pro"]),
    course("IoT", "🌐", "Electronics", ["IoT Basics", "Sensors", "Connectivity", "Cloud IoT", "IoT Pro"])
  ],
  EEE: [
    course("C Programming", "©️", "Programming", ["C Basics", "Core C", "Pointers", "Embedded C", "C Pro"]),
    course("Python", "🐍", "Programming", ["Python Basics", "Core Python", "Automation", "Data Handling", "Python Pro"]),
    course("MATLAB", "📐", "Engineering", ["MATLAB Basics", "Arrays", "Plots", "Simulation", "MATLAB Pro"]),
    course("AutoCAD Electrical", "⚡", "Electrical", ["Basics", "Schematics", "Panels", "Advanced Drawings", "Pro"]),
    course("PLC Programming", "🏭", "Automation", ["PLC Basics", "Ladder Logic", "Timers", "Industrial Control", "PLC Pro"])
  ],
  "Civil Engineering": [
    course("AutoCAD for Civil Engineering", "🏗️", "Civil", ["AutoCAD Basics", "Drawing Fundamentals", "2D Civil Drawings", "Advanced AutoCAD", "Professional AutoCAD"]),
    course("MS Excel for Civil Engineering", "📊", "Civil", ["Excel Basics", "Formulas", "Estimation Sheets", "Quantity Analysis", "Excel Pro"]),
    course("Revit Architecture", "🏢", "Civil", ["Revit Basics", "Walls & Floors", "Families", "Documentation", "Revit Pro"]),
    course("STAAD.Pro", "🏗️", "Civil", ["STAAD Basics", "Modeling", "Loads", "Analysis & Design", "STAAD Pro"]),
    course("Civil 3D", "🌐", "Civil", ["Civil 3D Basics", "Surfaces", "Alignments", "Profiles", "Civil 3D Pro"]),
    course("Primavera P6", "📅", "Civil", ["P6 Basics", "Projects", "Scheduling", "Resources", "P6 Pro"]),
    course("Quantity Surveying & Estimation", "📐", "Civil", ["QS Basics", "Measurements", "BOQ", "Rate Analysis", "Estimation Pro"]),
    course("BIM for Civil Engineering", "🏢", "Civil", ["BIM Basics", "Coordination", "Models", "Documentation", "BIM Pro"])
  ],
  Mechanical: [
    course("AutoCAD Mechanical", "⚙️", "Mechanical", ["CAD Basics", "2D Drawings", "Dimensions", "Advanced CAD", "CAD Pro"]),
    course("SolidWorks", "🧩", "Mechanical", ["Basics", "Part Design", "Assemblies", "Drawings", "SolidWorks Pro"]),
    course("MATLAB", "📐", "Engineering", ["MATLAB Basics", "Arrays", "Plots", "Simulation", "MATLAB Pro"]),
    course("Python for Engineers", "🐍", "Programming", ["Python Basics", "Engineering Calculations", "Automation", "Data", "Python Pro"])
  ],
  BCA: [
    course("Python", "🐍", "Programming", ["Python Basics", "Core Python", "Intermediate Python", "Advanced Python", "Python Pro"]),
    course("C", "©️", "Programming", ["C Basics", "Core C", "Pointers", "DSA", "C Pro"]),
    course("Java", "☕", "Programming", ["Java Basics", "OOP", "Collections", "Advanced Java", "Java Pro"]),
    course("Web Development", "🌐", "Web", ["HTML & CSS", "JavaScript", "DOM & APIs", "Projects", "Web Pro"]),
    course("SQL", "🗄️", "Database", ["SQL Basics", "Queries", "Joins", "Design", "SQL Pro"])
  ],
  "B.Sc Computer Science": [
    course("Python", "🐍", "Programming", ["Python Basics", "Core Python", "Intermediate Python", "Advanced Python", "Python Pro"]),
    course("C", "©️", "Programming", ["C Basics", "Core C", "Pointers", "DSA", "C Pro"]),
    course("Java", "☕", "Programming", ["Java Basics", "OOP", "Collections", "Advanced Java", "Java Pro"]),
    course("Web Development", "🌐", "Web", ["HTML & CSS", "JavaScript", "DOM & APIs", "Projects", "Web Pro"])
  ],
  "B.Sc Data Science": [
    course("Python", "🐍", "Programming", ["Python Basics", "Core Python", "Pandas", "Data Analysis", "Python Pro"]),
    course("SQL", "🗄️", "Database", ["SQL Basics", "Queries", "Joins", "Design", "SQL Pro"]),
    course("Data Analysis", "📊", "Data", ["Basics", "Cleaning", "Visualization", "Analytics", "Pro"]),
    course("Machine Learning", "🤖", "AI", ["Basics", "Preparation", "Models", "Evaluation", "Pro"])
  ],
  BBA: [
    course("MS Excel", "📊", "Business", ["Excel Basics", "Formulas", "Charts", "Analysis", "Excel Pro"]),
    course("Power BI", "📈", "Business", ["Basics", "Data", "Dashboards", "DAX", "Power BI Pro"]),
    course("SQL for Business", "🗄️", "Business", ["SQL Basics", "Queries", "Joins", "Reports", "SQL Pro"])
  ],
  "B.Com": [
    course("MS Excel", "📊", "Commerce", ["Excel Basics", "Formulas", "Accounting Sheets", "Analysis", "Excel Pro"]),
    course("Tally Basics", "🧾", "Commerce", ["Basics", "Ledgers", "GST", "Reports", "Tally Pro"]),
    course("Power BI", "📈", "Business", ["Basics", "Data", "Dashboards", "DAX", "Power BI Pro"])
  ]
};

function course(name, icon, category, levels) {
  return { id: slug(name), name, icon, category, levels: levels.map((title, i) => ({ level: i + 1, title, topics: makeTopics(name, title) })) };
}
function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
function makeTopics(courseName, levelTitle) {
  const courseLower = courseName.toLowerCase();
  const levelLower = levelTitle.toLowerCase();
  return [
    {
      title: `Introduction to ${levelTitle}`,
      definition: `${levelTitle} introduces the main idea of the ${courseName} level and explains why it matters in real learning and work.` ,
      explanation: `Learners start by understanding the purpose of ${levelTitle}, the surrounding terminology, and how the topic connects with ${courseName}.`,
      example: `Example: for ${courseName}, a student can write a simple use case such as “Create a short ${levelTitle} activity, list the steps, and explain the result.”`
    },
    {
      title: `Core concepts of ${courseName}`,
      definition: `Core concepts are the important ideas, rules, and building blocks that define ${courseName}.`,
      explanation: `This topic focuses on the essential mental model behind ${levelLower}, including what it controls, what it changes, and how it is used in practice.`,
      example: `Example: in ${courseName}, a learner can compare one item, one process, and one output to see how the concept works in a small task.`
    },
    {
      title: `Step-by-step examples`,
      definition: `A step-by-step example is a worked activity that shows how to move from a problem to a practical solution.`,
      explanation: `The learner sees each action clearly, understands the order of operations, and checks the result before moving to the next idea.`,
      example: `Example: Start with the problem statement, identify the input, perform one operation, and explain the final output using a short example.`
    },
    {
      title: `Practice exercise`,
      definition: `A practice exercise is a small task designed to test whether the concept can be applied with a learner’s own reasoning.`,
      explanation: `Practice turns the topic into action. Students solve a small scenario, identify key details, and evaluate whether their answer follows the concept correctly.`,
      example: `Example: Write 3 lines that explain the process of ${levelTitle} in ${courseName} and then solve a short question based on that process.`
    },
    {
      title: `Mini project / real-world task`,
      definition: `A mini project is a small real-world task that uses the lesson topic in a practical and measurable way.`,
      explanation: `The goal is to connect classroom learning with a relatable output such as a chart, design, calculation, workflow, or data report.`,
      example: `Example: Build a tiny ${courseName} activity that includes one input, one output, and one measurable result from ${levelTitle}.`
    },
    {
      title: `Level quiz`,
      definition: `A level quiz checks if the learner understands the main terms, workflow, idea, and examples from the current level.`,
      explanation: `The quiz helps review the lesson by asking short questions that confirm whether the learner can recognize, explain, and apply the concept.`,
      example: `Example: Answer one question on the meaning of the topic, one on the steps, and one practical question from ${courseName}.`
    }
  ];
}

const LEVEL_POINTS = [0, 100, 250, 500, 900, 1400, 2000, 2800, 3800, 5200];
const sessions = new Map();
const tests = new Map();
const assignments = new Map();

function readStudents() {
  try { return JSON.parse(fs.readFileSync(STUDENTS_FILE, "utf8")); } catch { return []; }
}
function writeStudents(students) { fs.writeFileSync(STUDENTS_FILE, JSON.stringify(students, null, 2)); }
function id() { return crypto.randomUUID(); }
function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  return { salt, hash: crypto.scryptSync(password, salt, 64).toString("hex") };
}
function verifyPassword(password, user) {
  if (!user?.passwordHash || !user?.passwordSalt) return false;
  const actual = crypto.scryptSync(password, user.passwordSalt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(user.passwordHash, "hex"));
}
function encode(obj) { return Buffer.from(JSON.stringify(obj)).toString("base64url"); }
function sign(payload) {
  const body = encode(payload);
  const sig = crypto.createHmac("sha256", JWT_SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}
function verify(token) {
  try {
    const [body, sig] = String(token || "").split(".");
    if (!body || !sig) return null;
    const expected = crypto.createHmac("sha256", JWT_SECRET).update(body).digest("base64url");
    if (sig !== expected) return null;
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (payload.exp && payload.exp < Date.now()) return null;
    return payload;
  } catch { return null; }
}
function authUser(req) {
  const h = String(req.headers.authorization || "");
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  const payload = verify(token);
  if (!payload) return null;

  const student = readStudents().find(s => s.id === payload.id);
  if (student) return student;

  const admin = adminAccounts().find(a => a.id === payload.id);
  if (!admin) return null;

  return {
    id: admin.id,
    name: admin.name,
    email: admin.email,
    education: admin.education,
    branch: admin.branch,
    role: admin.role,
    selectedCourse: null,
    totalPoints: 0,
    currentLevel: 1,
    completedCourses: [],
    completedLevels: {},
    assignmentHistory: [],
    testHistory: [],
    createdAt: new Date().toISOString()
  };
}
function publicUser(s) {
  if (!s) return null;
  return {
    id: s.id, name: s.name, email: s.email, education: s.education, branch: s.branch,
    role: s.role || "student",
    selectedCourse: s.selectedCourse || null, totalPoints: Number(s.totalPoints || 0),
    currentLevel: calculateLevel(s.totalPoints || 0), completedCourses: s.completedCourses || [],
    completedLevels: s.completedLevels || {}, assignmentHistory: s.assignmentHistory || [],
    testHistory: s.testHistory || [], createdAt: s.createdAt
  };
}
function calculateLevel(points) {
  let level = 1;
  for (let i = 0; i < LEVEL_POINTS.length; i++) if (points >= LEVEL_POINTS[i]) level = i + 1;
  return Math.min(level, LEVEL_POINTS.length);
}
function courseFor(branch, courseId) { return (COURSES[branch] || []).find(c => c.id === courseId); }
function courseState(student, course) {
  if (!course) return null;
  const completed = student.completedLevels?.[course.id] || [];
  return { courseId: course.id, completed, unlocked: course.levels.map((_, i) => i < 2 || completed.includes(i)) };
}
function ensureStudentFields(s) {
  s.totalPoints = Number(s.totalPoints || s.xp || 0);
  s.completedCourses ||= [];
  s.completedLevels ||= {};
  s.assignmentHistory ||= [];
  s.testHistory ||= [];
  return s;
}

async function gemini(prompt) {
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not configured. Add it to .env.");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) });
  const data = await r.json();
  if (!r.ok) throw new Error(data?.error?.message || `Gemini request failed (${r.status})`);
  return data?.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("\n").trim() || "No AI answer returned.";
}

function isCurrentInfo(q) {
  return /\b(current|present|now|today|latest|who is the|who's the|present pm|present cm|current pm|current cm|prime minister|chief minister|president|ceo)\b/i.test(q);
}
async function liveLookup(question) {
  const wiki = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(question.replace(/[?]/g, ""))}`, { headers: { "User-Agent": "SkillNexa/2.0" } }).catch(() => null);
  if (wiki?.ok) {
    const d = await wiki.json().catch(() => null);
    if (d?.extract) return { source: "Wikipedia", answer: d.extract, url: d.content_urls?.desktop?.page || "https://www.wikipedia.org/" };
  }
  const ddg = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(question)}&format=json&no_html=1&skip_disambig=1`).catch(() => null);
  if (ddg?.ok) {
    const d = await ddg.json().catch(() => null);
    if (d?.AbstractText) return { source: "DuckDuckGo", answer: d.AbstractText, url: d.AbstractURL || "https://duckduckgo.com/" };
  }
  return null;
}

const testBank = {
  programming: [
    ["Which keyword defines a function in Python?", ["def", "func", "function", "define"], 0],
    ["Which data structure stores key-value pairs in Python?", ["List", "Tuple", "Dictionary", "Set"], 2],
    ["Which HTML tag creates a hyperlink?", ["<p>", "<a>", "<h1>", "<link>"], 1],
    ["Which CSS property changes text color?", ["font", "background", "color", "text"], 2],
    ["Which protocol is commonly used for secure web traffic?", ["FTP", "HTTP", "HTTPS", "SMTP"], 2],
    ["Which C++ feature allows one interface with different implementations?", ["Compilation", "Polymorphism", "Parsing", "Linking"], 1],
    ["Which Java keyword creates a class?", ["class", "new", "object", "type"], 0],
    ["What does SQL stand for?", ["Structured Query Language", "Simple Query List", "System Query Logic", "Stored Question Language"], 0],
    ["Which JavaScript method converts JSON text into an object?", ["JSON.parse", "JSON.object", "JSON.read", "JSON.toObject"], 0],
    ["Which data structure follows FIFO?", ["Stack", "Queue", "Tree", "Graph"], 1]
  ],
  civil: [
    ["What is the primary purpose of a foundation?", ["Decorate a building", "Transfer loads to soil", "Increase room size", "Reduce windows"], 1],
    ["Which test measures workability of fresh concrete?", ["Slump test", "Impact test", "Hardness test", "Tensile test"], 0],
    ["What does RCC stand for?", ["Reinforced Cement Concrete", "Rapid Construction Concrete", "Road Cement Course", "Reduced Carbon Concrete"], 0],
    ["Which instrument measures horizontal and vertical angles in surveying?", ["Thermometer", "Theodolite", "Ammeter", "Barometer"], 1],
    ["Which software is widely used for technical drafting?", ["AutoCAD", "Notepad", "Paint", "Calculator"], 0],
    ["BOQ commonly means?", ["Bill of Quantities", "Book of Queries", "Base of Quality", "Budget of Quarters"], 0],
    ["BIM stands for?", ["Building Information Modeling", "Basic Industrial Mapping", "Building Internal Method", "Business Information Model"], 0],
    ["Primavera P6 is commonly used for?", ["Project planning and scheduling", "Photo editing", "Word processing", "Audio editing"], 0],
    ["Civil 3D is primarily used for?", ["Civil design and infrastructure modeling", "Music production", "Email", "Video editing"], 0],
    ["A structural beam primarily resists?", ["Bending and shear", "Typing", "Color changes", "Sound"], 0]
  ]
};
function buildTest(student) {
  const civil = String(student.branch || "").toLowerCase().includes("civil");
  const bank = civil ? testBank.civil : testBank.programming;
  return bank.map(([question, options, answer]) => ({ question, options, answer }));
}

function sendJSON(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" });
  res.end(JSON.stringify(data));
}
function body(req) { return new Promise((resolve, reject) => { let raw = ""; req.on("data", c => { raw += c; if (raw.length > 2e6) req.destroy(); }); req.on("end", () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error("Invalid JSON")); } }); req.on("error", reject); }); }
function requireUser(req, res) { const u = authUser(req); if (!u) sendJSON(res, 401, { message: "Please login again." }); return u; }

async function api(req, res, url) {
  if (req.method === "OPTIONS") { res.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type, Authorization", "Access-Control-Allow-Methods": "GET,POST,OPTIONS" }); return res.end(); }
  try {
    if (req.method === "GET" && url.pathname === "/api/courses") return sendJSON(res, 200, { courses: COURSES });

    if (req.method === "GET" && url.pathname === "/api/admin/students") {
      const user = requireUser(req, res);
      if (!user) return;
      if (user.role !== "admin") return sendJSON(res, 403, { message: "Admin access required." });
      const students = readStudents().filter(s => (s.role || "student") !== "admin");
      const publicStudents = students.map(publicUser);
      const branchCount = Object.values(publicStudents.reduce((acc, s) => {
        const branch = String(s.branch || "Unassigned");
        acc[branch] = (acc[branch] || 0) + 1;
        return acc;
      }, {}));
      const totalPoints = publicStudents.reduce((sum, s) => sum + Number(s.totalPoints || 0), 0);
      const totalCompletedCourses = publicStudents.reduce((sum, s) => sum + (Array.isArray(s.completedCourses) ? s.completedCourses.length : 0), 0);
      const averagePoints = publicStudents.length ? Math.round(totalPoints / publicStudents.length) : 0;
      const averageLevel = publicStudents.length ? Math.round(publicStudents.reduce((sum, s) => sum + Number(s.currentLevel || 1), 0) / publicStudents.length) : 1;
      const summary = {
        totalStudents: publicStudents.length,
        totalPoints,
        totalCompletedCourses,
        averagePoints,
        averageLevel,
        branches: Object.entries(publicStudents.reduce((acc, s) => {
          const branch = String(s.branch || "Unassigned");
          acc[branch] = (acc[branch] || 0) + 1;
          return acc;
        }, {})).map(([branch, count]) => ({ branch, count }))
      };
      return sendJSON(res, 200, { students: publicStudents, summary });
    }

    if (req.method === "POST" && url.pathname === "/api/auth/register") {
      const b = await body(req); const name = String(b.name || "").trim(); const email = String(b.email || "").trim().toLowerCase(); const password = String(b.password || ""); const education = String(b.education || "").trim(); const branch = String(b.branch || "").trim();
      if (!name || !email || !password || !education || !branch) return sendJSON(res, 400, { message: "Full name, email, password, education and branch are required." });
      if (password.length < 6) return sendJSON(res, 400, { message: "Password must be at least 6 characters." });
      const students = readStudents(); if (students.some(s => s.email === email)) return sendJSON(res, 409, { message: "An account with this email already exists." });
      const hp = hashPassword(password); const s = ensureStudentFields({ id: id(), name, email, education, branch, role: "student", passwordHash: hp.hash, passwordSalt: hp.salt, createdAt: new Date().toISOString() }); students.push(s); writeStudents(students);
      return sendJSON(res, 201, { token: sign({ id: s.id, exp: Date.now() + 7 * 86400000 }), user: publicUser(s) });
    }

    if (req.method === "POST" && url.pathname === "/api/auth/login") {
      const b = await body(req); const email = String(b.email || "").trim().toLowerCase(); const password = String(b.password || "");

      const admin = builtInAdminFromLogin(email, password);
      if (admin) {
        return sendJSON(res, 200, {
          token: sign({ id: admin.id, exp: Date.now() + 7 * 86400000 }),
          user: publicUser(admin)
        });
      }

      const students = readStudents(); const s = students.find(x => x.email === email);
      if (!s || !verifyPassword(password, s)) return sendJSON(res, 401, { message: "Invalid email or password." });
      ensureStudentFields(s); writeStudents(students); return sendJSON(res, 200, { token: sign({ id: s.id, exp: Date.now() + 7 * 86400000 }), user: publicUser(s) });
    }

    const user = requireUser(req, res); if (!user) return;
    ensureStudentFields(user);

    if (req.method === "GET" && url.pathname === "/api/me") return sendJSON(res, 200, { user: publicUser(user) });

    if (req.method === "POST" && url.pathname === "/api/course/select") {
      const b = await body(req); const courseId = String(b.courseId || ""); const c = courseFor(user.branch, courseId); if (!c) return sendJSON(res, 400, { message: "This course is not available for your branch." });
      const students = readStudents(); const s = students.find(x => x.id === user.id); s.selectedCourse = c.id; ensureStudentFields(s); writeStudents(students); return sendJSON(res, 200, { user: publicUser(s), course: c, state: courseState(s, c) });
    }

    if (req.method === "GET" && url.pathname === "/api/course/current") {
      const c = courseFor(user.branch, user.selectedCourse); if (!c) return sendJSON(res, 200, { course: null, state: null }); return sendJSON(res, 200, { course: c, state: courseState(user, c) });
    }

    if (req.method === "POST" && url.pathname === "/api/course/complete-level") {
      const b = await body(req); const courseId = String(b.courseId || user.selectedCourse || ""); const level = Number(b.level); const c = courseFor(user.branch, courseId); if (!c || !Number.isInteger(level) || level < 1 || level > c.levels.length) return sendJSON(res, 400, { message: "Invalid course or level." });
      const students = readStudents(); const s = students.find(x => x.id === user.id); ensureStudentFields(s); s.completedLevels[c.id] ||= []; if (level > 2 && !s.completedLevels[c.id].includes(level - 1)) return sendJSON(res, 403, { message: "Complete the previous level first." });
      if (!s.completedLevels[c.id].includes(level)) s.completedLevels[c.id].push(level); s.completedLevels[c.id].sort((a,b) => a-b);
      if (s.completedLevels[c.id].length === c.levels.length && !s.completedCourses.includes(c.id)) s.completedCourses.push(c.id);
      s.totalPoints += 50; writeStudents(students); return sendJSON(res, 200, { user: publicUser(s), state: courseState(s, c), completed: s.completedCourses.includes(c.id) });
    }

    if (req.method === "POST" && url.pathname === "/api/ai") {
      const b = await body(req); const question = String(b.question || "").trim(); if (!question) return sendJSON(res, 400, { message: "Question is required." });
      const course = courseFor(user.branch, user.selectedCourse); let answer = ""; let live = null;
      if (isCurrentInfo(question)) live = await liveLookup(question);
      if (live) {
        answer = `${live.answer}\n\nSource: ${live.source}`;
      } else {
        try {
          answer = await gemini(`You are NEXA, the SkillNexa AI Tutor. Student branch: ${user.branch}. Selected course: ${course?.name || "Not selected"}. Answer clearly and step-by-step. Detect the student's language and reply in that language. Do not invent current facts. If the question asks for current/present/latest information and no verified source is available, say that verification is unavailable instead of guessing. Question: ${question}`);
        } catch (e) {
          answer = `I couldn't reach Gemini right now.\n\n${e.message}\n\nYou can still use the course lessons and YouTube resources below.`;
        }
      }
      return sendJSON(res, 200, { answer, liveSource: live?.source || null, liveUrl: live?.url || null });
    }

    if (req.method === "POST" && url.pathname === "/api/test/generate") {
      const questions = buildTest(user); const testId = id(); tests.set(testId, { userId: user.id, questions, createdAt: Date.now() }); return sendJSON(res, 200, { testId, questions: questions.map(({ question, options }) => ({ question, options })) });
    }

    if (req.method === "POST" && url.pathname === "/api/test/submit") {
      const b = await body(req); const t = tests.get(String(b.testId || "")); if (!t || t.userId !== user.id) return sendJSON(res, 404, { message: "Test not found." }); const answers = Array.isArray(b.answers) ? b.answers : []; const correct = t.questions.reduce((n,q,i) => n + (Number(answers[i]) === q.answer ? 1 : 0), 0); const points = correct * 10;
      const students = readStudents(); const s = students.find(x => x.id === user.id); ensureStudentFields(s); s.totalPoints += points; s.testHistory.push({ date: new Date().toISOString(), score: correct * 10, correct, points }); writeStudents(students); tests.delete(String(b.testId)); return sendJSON(res, 200, { correct, totalQuestions: 10, score: correct * 10, points, totalPoints: s.totalPoints, level: calculateLevel(s.totalPoints) });
    }

    if (req.method === "POST" && url.pathname === "/api/assignment/start") {
      const c = courseFor(user.branch, user.selectedCourse); if (!c) return sendJSON(res, 400, { message: "Select a course first." }); const state = courseState(user, c); const level = Math.min(5, Math.max(1, (state.completed.length || 0) + 1)); const task = { id: id(), title: `${c.name} Level ${level} Assignment`, prompt: `Create a small practical task based on ${c.levels[level - 1].title}. Explain your approach and provide your work.` }; assignments.set(task.id, { userId: user.id, courseId: c.id, level, task, createdAt: Date.now() }); return sendJSON(res, 200, { task });
    }

    if (req.method === "POST" && url.pathname === "/api/assignment/submit") {
      const b = await body(req); const a = assignments.get(String(b.assignmentId || "")); if (!a || a.userId !== user.id) return sendJSON(res, 404, { message: "Assignment not found." }); const text = String(b.answer || "").trim(); if (text.length < 20) return sendJSON(res, 400, { message: "Please submit a more complete answer (at least 20 characters)." }); const points = 50;
      const students = readStudents(); const s = students.find(x => x.id === user.id); ensureStudentFields(s); s.totalPoints += points; s.assignmentHistory.push({ date: new Date().toISOString(), title: a.task.title, points }); writeStudents(students); assignments.delete(String(b.assignmentId)); return sendJSON(res, 200, { points, totalPoints: s.totalPoints, level: calculateLevel(s.totalPoints), message: "Assignment submitted successfully." });
    }

    if (req.method === "GET" && url.pathname === "/api/youtube") {
      const q = String(url.searchParams.get("q") || "SkillNexa learning"); const search = `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`; return sendJSON(res, 200, { url: search, query: q });
    }

    if (req.method === "GET" && url.pathname === "/api/certificate") {
      const c = courseFor(user.branch, user.selectedCourse); if (!c || !user.completedCourses.includes(c.id)) return sendJSON(res, 403, { message: "Complete the selected course first." }); return sendJSON(res, 200, { name: user.name, course: c.name, brand: "SkillNexa", completedAt: new Date().toISOString() });
    }

    return sendJSON(res, 404, { message: "API route not found." });
  } catch (e) { console.error(e); return sendJSON(res, 500, { message: e.message || "Server error." }); }
}

const MIME = { ".html":"text/html; charset=utf-8", ".js":"application/javascript; charset=utf-8", ".css":"text/css; charset=utf-8", ".json":"application/json; charset=utf-8", ".png":"image/png", ".jpg":"image/jpeg", ".svg":"image/svg+xml", ".ico":"image/x-icon" };
function serveStatic(req, res, url) {
  let pathname = decodeURIComponent(url.pathname); if (pathname === "/") pathname = "/index.html"; const safe = path.normalize(pathname).replace(/^([.][.][/\\])+/, ""); const file = path.join(PUBLIC, safe); if (!file.startsWith(PUBLIC)) return sendJSON(res, 403, { message: "Forbidden" });
  fs.readFile(file, (err, data) => { if (err) return fs.readFile(path.join(PUBLIC, "index.html"), (e2, d2) => { if (e2) { res.writeHead(404); return res.end("Not found"); } res.writeHead(200, { "Content-Type": MIME[".html"] }); res.end(d2); }); res.writeHead(200, { "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream" }); res.end(data); });
}

http.createServer((req, res) => { const url = new URL(req.url, `http://${req.headers.host || "localhost"}`); if (url.pathname.startsWith("/api/")) return api(req, res, url); serveStatic(req, res, url); }).listen(PORT, () => console.log(`SkillNexa running at http://localhost:${PORT}`));
