const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { URL } = require("url");

let adminSDK = null;
try {
  adminSDK = require("firebase-admin");
} catch (e) {
  adminSDK = null;
}

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

let firebaseDb = null;
let firebaseBucket = null;
let firebaseEnabled = false;

function initFirebaseAdmin() {
  if (!adminSDK) return;
  try {
    let serviceAccount = null;
    const credsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(ROOT, "firebase-service-account.json");
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    } else if (fs.existsSync(credsPath)) {
      serviceAccount = JSON.parse(fs.readFileSync(credsPath, "utf8"));
    }

    if (serviceAccount) {
      adminSDK.initializeApp({
        credential: adminSDK.credential.cert(serviceAccount),
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET || `${serviceAccount.project_id}.appspot.com`
      });
    } else if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
      const privateKey = String(process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n");
      adminSDK.initializeApp({
        credential: adminSDK.credential.cert({
          project_id: process.env.FIREBASE_PROJECT_ID,
          client_email: process.env.FIREBASE_CLIENT_EMAIL,
          private_key: privateKey
        }),
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET || `${process.env.FIREBASE_PROJECT_ID}.appspot.com`
      });
    } else {
      return;
    }

    firebaseDb = adminSDK.firestore();
    firebaseBucket = adminSDK.storage().bucket();
    firebaseEnabled = true;
  } catch (e) {
    firebaseEnabled = false;
    console.warn("Firebase Admin disabled:", e.message || e);
  }
}

initFirebaseAdmin();

async function syncStudentsToFirebase(students) {
  if (!firebaseEnabled || !firebaseDb) return;
  try {
    const batch = firebaseDb.batch();
    for (const student of Array.isArray(students) ? students : []) {
      const record = ensureStudentFields({ ...student, points: Number(student.points || student.totalPoints || 0), syncedAt: new Date().toISOString() });
      record.totalPoints = Number(record.totalPoints || record.points || 0);
      record.points = Number(record.totalPoints || record.points || 0);
      const ref = firebaseDb.collection("students").doc(record.id);
      batch.set(ref, record, { merge: true });
    }
    await batch.commit();
  } catch (e) {
    console.warn("Firebase student sync skipped:", e.message || e);
  }
}

async function syncStudentHistoryToFirebase(studentId, historyKind, payload) {
  if (!firebaseEnabled || !firebaseDb) return;
  try {
    const collection = firebaseDb.collection("student_history");
    await collection.doc(`${studentId}_${historyKind}_${Date.now()}`).set({
      studentId,
      historyKind,
      payload,
      createdAt: new Date().toISOString()
    });
  } catch (e) {
    console.warn("Firebase history sync skipped:", e.message || e);
  }
}

async function uploadToFirebaseStorage(studentId, payload) {
  if (!firebaseEnabled || !firebaseBucket) {
    throw new Error("Firebase Storage is not configured.");
  }
  const fileName = `uploads/${studentId}/${Date.now()}-${String(payload.name || "artifact.txt")}`;
  const file = firebaseBucket.file(fileName);
  await file.save(Buffer.from(String(payload.content || ""), "utf8"), {
    metadata: { contentType: payload.contentType || "text/plain; charset=utf-8" }
  });
  const [url] = await file.getSignedUrl({ action: "read", expires: Date.now() + 1000 * 60 * 60 * 24 });
  return { fileName, url };
}

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
    course("C Programming", "©️", "Programming", ["C Fundamentals", "Control Flow", "Arrays & Strings", "Functions & Pointers", "Projects"]),
    course("C++", "⚙️", "Programming", ["C++ Foundations", "OOP Basics", "STL & Data Structures", "Templates & Design", "Project Lab"]),
    course("Python", "🐍", "Programming", ["Python Introduction", "Variables", "Data Types", "Input and Output", "Operators"]),
    course("Java", "☕", "Programming", ["Java Foundations", "OOP", "Collections", "Threads & APIs", "Projects"]),
    course("Data Structures & Algorithms", "🧠", "Core", ["Analysis", "Arrays", "Linked Lists", "Trees & Graphs", "Algorithms"]),
    course("DBMS", "🗄️", "Core", ["Schema Basics", "ER Modeling", "SQL Normalization", "Transactions", "DB Design"]),
    course("SQL", "🗄️", "Database", ["SQL Basics", "Queries", "Joins", "Indexes", "Reports"]),
    course("Operating Systems", "💻", "System", ["OS Basics", "Processes", "Memory", "Filesystems", "Scheduling"]),
    course("Computer Networks", "🌐", "Network", ["Network Basics", "TCP/IP", "Routing", "Security", "Protocols"]),
    course("Web Development", "🌐", "Web", ["HTML & CSS", "JavaScript", "Frontend Development", "APIs", "Projects"]),
    course("Git & GitHub", "🔧", "Development", ["Version Control", "Git Basics", "Branching", "Collaboration", "Repositories"]),
    course("AI/ML Basics", "🤖", "AI", ["AI Foundations", "Machine Learning", "Data", "Model Basics", "Practice"])
  ],
  CSM: [
    course("Python", "🐍", "Programming", ["Python Introduction", "Variables", "Data Types", "Input and Output", "Operators"]),
    course("C Programming", "©️", "Programming", ["C Fundamentals", "Control Flow", "Arrays & Strings", "Functions & Pointers", "Projects"]),
    course("SQL", "🗄️", "Database", ["SQL Basics", "Queries", "Joins", "Indexes", "Reports"]),
    course("Statistics", "📊", "Data", ["Descriptive Stats", "Probability", "Distributions", "Inference", "Data Analysis"]),
    course("Data Analysis", "📊", "Data", ["Data Understanding", "Cleaning", "Visualization", "Insights", "Reporting"]),
    course("Data Visualization", "📈", "Data", ["Charts", "Storytelling", "Dashboards", "Visualization Design", "Reports"]),
    course("Machine Learning", "🤖", "AI", ["Supervised Learning", "Classification", "Regression", "Evaluation", "Projects"]),
    course("Deep Learning", "🧠", "AI", ["Neural Networks", "Training", "Optimization", "CNNs & RNNs", "Projects"]),
    course("Natural Language Processing", "📝", "AI", ["Text Basics", "Tokenization", "Models", "Classification", "Applications"]),
    course("Computer Vision", "📷", "AI", ["Images", "Feature Extraction", "CNNs", "Object Detection", "Applications"]),
    course("Generative AI", "✨", "AI", ["Generative Models", "LLMs", "Prompt Design", "Applications", "Projects"]),
    course("AI/ML Projects", "🚀", "Projects", ["Problem Framing", "Data Pipeline", "Model Development", "Evaluation", "Deployment"])
  ],
  "Data Science": [
    course("Python", "🐍", "Programming", ["Python Introduction", "Variables", "Data Types", "Input and Output", "Operators"]),
    course("SQL", "🗄️", "Database", ["SQL Basics", "Queries", "Joins", "Indexes", "Reports"]),
    course("Statistics", "📊", "Data", ["Descriptive Stats", "Probability", "Distributions", "Inference", "Data Analysis"]),
    course("Data Analysis", "📊", "Data", ["Data Understanding", "Cleaning", "Visualization", "Insights", "Reporting"]),
    course("Data Visualization", "📈", "Data", ["Charts", "Storytelling", "Dashboards", "Visualization Design", "Reports"]),
    course("Machine Learning", "🤖", "AI", ["Supervised Learning", "Classification", "Regression", "Evaluation", "Projects"]),
    course("Deep Learning", "🧠", "AI", ["Neural Networks", "Training", "Optimization", "CNNs & RNNs", "Projects"]),
    course("NLP", "📝", "AI", ["Text Basics", "Tokenization", "Models", "Classification", "Applications"]),
    course("Generative AI", "✨", "AI", ["Generative Models", "LLMs", "Prompt Design", "Applications", "Projects"]),
    course("Data Science Projects", "🚀", "Projects", ["Problem Framing", "Data Pipeline", "Model Development", "Evaluation", "Deployment"])
  ],
  ECE: [
    course("C Programming", "©️", "Programming", ["C Fundamentals", "Control Flow", "Arrays & Strings", "Functions & Pointers", "Projects"]),
    course("Python", "🐍", "Programming", ["Python Introduction", "Variables", "Data Types", "Input and Output", "Operators"]),
    course("Digital Electronics", "🔌", "Electronics", ["Logic Basics", "Gates", "Combinational Logic", "Sequential Logic", "Design"]),
    course("Microcontrollers", "⚙️", "Embedded", ["MCU Basics", "Architecture", "Control Flow", "Timers", "Applications"]),
    course("Embedded Systems", "🔌", "Embedded", ["Embedded Basics", "Peripherals", "Sensors", "RTOS", "Systems"]),
    course("MATLAB", "📐", "Engineering", ["MATLAB Basics", "Signals", "Simulations", "Plots", "Applications"]),
    course("IoT", "🌐", "IoT", ["IoT Basics", "Sensors", "Connectivity", "Protocols", "Applications"]),
    course("Communication Systems", "📡", "Communication", ["Signals", "Modulation", "Networks", "Transmission", "Applications"]),
    course("PCB Design", "🔧", "Hardware", ["Circuit Design", "Layout", "Boards", "Routing", "Manufacturing"]),
    course("Embedded Projects", "🚀", "Projects", ["Problem Design", "Design Flow", "Sensors", "Testing", "Demo"])
  ],
  EEE: [
    course("C Programming", "©️", "Programming", ["C Fundamentals", "Control Flow", "Arrays & Strings", "Functions & Pointers", "Projects"]),
    course("Python", "🐍", "Programming", ["Python Introduction", "Variables", "Data Types", "Input and Output", "Operators"]),
    course("Electrical Circuits", "⚡", "Core", ["Circuit Basics", "Network Laws", "Theorems", "AC DC", "Analysis"]),
    course("MATLAB", "📐", "Engineering", ["MATLAB Basics", "Scripts", "Signals", "Simulations", "Applications"]),
    course("AutoCAD Electrical", "⚡", "CAD", ["Electrical Drafting", "Schematics", "Panels", "Design", "Layouts"]),
    course("PLC Programming", "🏭", "Automation", ["PLC Basics", "Ladder Logic", "Timers", "I/O", "Control"]),
    course("Power Systems", "🔋", "Systems", ["Generation", "Transmission", "Loads", "Protection", "Analysis"]),
    course("Control Systems", "🎛️", "Systems", ["Modeling", "Feedback", "Stability", "Controllers", "Design"]),
    course("Electrical Machines", "⚙️", "Machines", ["Transformers", "Motors", "Generators", "Testing", "Operations"]),
    course("Industrial Automation", "🏭", "Automation", ["Automation Basics", "Sensors", "PLCs", "SCADA", "Projects"])
  ],
  "Civil Engineering": [
    course("Engineering Drawing", "📐", "Civil", ["Drafting Basics", "Orthographic Views", "Sections", "Dimensions", "Drawing Standards"]),
    course("AutoCAD for Civil Engineering", "🏗️", "Civil", ["AutoCAD Basics", "Drawing Fundamentals", "2D Civil Drawings", "Advanced AutoCAD", "Professional AutoCAD"]),
    course("Civil 3D", "🌐", "Civil", ["Civil 3D Basics", "Surfaces", "Alignments", "Profiles", "Civil 3D Pro"]),
    course("Revit Architecture", "🏢", "Civil", ["Revit Basics", "Walls & Floors", "Families", "Documentation", "Revit Pro"]),
    course("STAAD.Pro", "🏗️", "Civil", ["STAAD Basics", "Modeling", "Loads", "Analysis & Design", "STAAD Pro"]),
    course("ETABS", "🏢", "Civil", ["Structural Modeling", "Grid Design", "Loads", "Analysis", "Design"]),
    course("Quantity Surveying & Estimation", "📐", "Civil", ["QS Basics", "Measurements", "BOQ", "Rate Analysis", "Estimation Pro"]),
    course("MS Excel for Civil Engineering", "📊", "Civil", ["Excel Basics", "Formulas", "Estimation Sheets", "Quantity Analysis", "Excel Pro"]),
    course("Primavera P6", "📅", "Civil", ["P6 Basics", "Projects", "Scheduling", "Resources", "P6 Pro"]),
    course("BIM for Civil Engineering", "🏢", "Civil", ["BIM Basics", "Coordination", "Models", "Documentation", "BIM Pro"]),
    course("Construction Management", "🏗️", "Civil", ["Planning", "Cost Control", "Schedules", "Safety", "Management"]),
    course("Civil Engineering Projects", "🚀", "Projects", ["Project Brief", "Planning", "Design", "Estimation", "Documentation"])
  ],
  Mechanical: [
    course("Engineering Drawing", "📐", "Mechanical", ["Drafting Basics", "Orthographic Views", "Sections", "Dimensions", "Drawing Standards"]),
    course("AutoCAD Mechanical", "⚙️", "Mechanical", ["CAD Basics", "2D Drawings", "Dimensions", "Advanced CAD", "CAD Pro"]),
    course("SolidWorks", "🧩", "Mechanical", ["Basics", "Part Design", "Assemblies", "Drawings", "SolidWorks Pro"]),
    course("CATIA", "⚙️", "Mechanical", ["CATIA Basics", "Part Modeling", "Assemblies", "Drafting", "Design"]),
    course("MATLAB", "📐", "Engineering", ["MATLAB Basics", "Arrays", "Plots", "Simulation", "MATLAB Pro"]),
    course("Python for Engineers", "🐍", "Programming", ["Python Basics", "Engineering Calculations", "Automation", "Data", "Python Pro"]),
    course("Manufacturing Basics", "🏭", "Manufacturing", ["Processes", "Materials", "Machine Tools", "Quality", "Operations"]),
    course("CNC", "⚙️", "Manufacturing", ["CNC Basics", "Programming", "Tools", "Operations", "Quality"]),
    course("Mechanical Design", "⚙️", "Mechanical", ["Design Thinking", "CAD", "Load Paths", "Design Rules", "Review"]),
    course("CAD Projects", "🚀", "Projects", ["Problem Design", "Modeling", "Assembly", "Drawing", "Documentation"])
  ],
  BCA: [
    course("C Programming", "©️", "Programming", ["C Fundamentals", "Control Flow", "Arrays & Strings", "Functions & Pointers", "Projects"]),
    course("C++", "⚙️", "Programming", ["C++ Foundations", "OOP Basics", "STL & Data Structures", "Templates & Design", "Project Lab"]),
    course("Python", "🐍", "Programming", ["Python Introduction", "Variables", "Data Types", "Input and Output", "Operators"]),
    course("Java", "☕", "Programming", ["Java Foundations", "OOP", "Collections", "Threads & APIs", "Projects"]),
    course("Data Structures", "🧠", "Core", ["Analysis", "Arrays", "Linked Lists", "Trees & Graphs", "Algorithms"]),
    course("DBMS", "🗄️", "Core", ["Schema Basics", "ER Modeling", "SQL Normalization", "Transactions", "DB Design"]),
    course("SQL", "🗄️", "Database", ["SQL Basics", "Queries", "Joins", "Indexes", "Reports"]),
    course("Web Development", "🌐", "Web", ["HTML & CSS", "JavaScript", "Frontend Development", "APIs", "Projects"]),
    course("Git & GitHub", "🔧", "Development", ["Version Control", "Git Basics", "Branching", "Collaboration", "Repositories"]),
    course("Software Development Basics", "💻", "Development", ["Software Lifecycle", "Requirements", "Design", "Implementation", "Testing"])
  ],
  "B.Sc Computer Science": [
    course("C Programming", "©️", "Programming", ["C Fundamentals", "Control Flow", "Arrays & Strings", "Functions & Pointers", "Projects"]),
    course("C++", "⚙️", "Programming", ["C++ Foundations", "OOP Basics", "STL & Data Structures", "Templates & Design", "Project Lab"]),
    course("Python", "🐍", "Programming", ["Python Introduction", "Variables", "Data Types", "Input and Output", "Operators"]),
    course("Java", "☕", "Programming", ["Java Foundations", "OOP", "Collections", "Threads & APIs", "Projects"]),
    course("Data Structures & Algorithms", "🧠", "Core", ["Analysis", "Arrays", "Linked Lists", "Trees & Graphs", "Algorithms"]),
    course("DBMS", "🗄️", "Core", ["Schema Basics", "ER Modeling", "SQL Normalization", "Transactions", "DB Design"]),
    course("SQL", "🗄️", "Database", ["SQL Basics", "Queries", "Joins", "Indexes", "Reports"]),
    course("Web Development", "🌐", "Web", ["HTML & CSS", "JavaScript", "Frontend Development", "APIs", "Projects"]),
    course("Computer Networks", "🌐", "Network", ["Network Basics", "TCP/IP", "Routing", "Security", "Protocols"]),
    course("Operating Systems", "💻", "System", ["OS Basics", "Processes", "Memory", "Filesystems", "Scheduling"]),
    course("Git & GitHub", "🔧", "Development", ["Version Control", "Git Basics", "Branching", "Collaboration", "Repositories"])
  ],
  "B.Sc Data Science": [
    course("Python", "🐍", "Programming", ["Python Introduction", "Variables", "Data Types", "Input and Output", "Operators"]),
    course("SQL", "🗄️", "Database", ["SQL Basics", "Queries", "Joins", "Indexes", "Reports"]),
    course("Statistics", "📊", "Data", ["Descriptive Stats", "Probability", "Distributions", "Inference", "Data Analysis"]),
    course("Data Analysis", "📊", "Data", ["Data Understanding", "Cleaning", "Visualization", "Insights", "Reporting"]),
    course("Data Visualization", "📈", "Data", ["Charts", "Storytelling", "Dashboards", "Visualization Design", "Reports"]),
    course("Machine Learning", "🤖", "AI", ["Supervised Learning", "Classification", "Regression", "Evaluation", "Projects"]),
    course("Deep Learning", "🧠", "AI", ["Neural Networks", "Training", "Optimization", "CNNs & RNNs", "Projects"]),
    course("NLP", "📝", "AI", ["Text Basics", "Tokenization", "Models", "Classification", "Applications"]),
    course("Generative AI", "✨", "AI", ["Generative Models", "LLMs", "Prompt Design", "Applications", "Projects"]),
    course("Data Science Projects", "🚀", "Projects", ["Problem Framing", "Data Pipeline", "Model Development", "Evaluation", "Deployment"])
  ],
  BBA: [
    course("MS Excel", "📊", "Business", ["Excel Foundations", "Formulas", "Analytics", "Dashboards", "Reports"]),
    course("Advanced Excel", "📊", "Business", ["Advanced formulas", "Pivot tables", "Charts", "Forecasting", "Analysis"]),
    course("Business Analytics", "📈", "Business", ["Analytics Basics", "Data", "Decision Making", "Metrics", "Analysis"]),
    course("Power BI", "📈", "Business", ["Power BI Basics", "Data Modeling", "Dashboards", "DAX", "Reports"]),
    course("SQL for Business", "🗄️", "Business", ["SQL Basics", "Queries", "Reporting", "Dashboards", "Business Data"]),
    course("Digital Marketing", "📣", "Marketing", ["Marketing Basics", "SEO", "Social Media", "Campaigns", "Analytics"]),
    course("Business Communication", "💬", "Communication", ["Presentation", "Writing", "Listening", "Leadership", "Communication"]),
    course("Financial Analysis", "💰", "Finance", ["Finance Basics", "Ratios", "Profitability", "Risk", "Reports"]),
    course("Project Management", "📅", "Management", ["Planning", "Budgeting", "Scheduling", "Risk", "Execution"]),
    course("Business Intelligence", "📊", "Analytics", ["Data Sources", "Dashboards", "Decision Making", "Metrics", "Reports"])
  ],
  "B.Com": [
    course("MS Excel", "📊", "Commerce", ["Excel Foundations", "Formulas", "Accounting Sheets", "Analysis", "Reports"]),
    course("Advanced Excel", "📊", "Commerce", ["Advanced formulas", "Pivot tables", "Charts", "Forecasting", "Analysis"]),
    course("Tally Basics", "🧾", "Commerce", ["Accounting Basics", "Ledgers", "Vouchers", "Accounts", "Reports"]),
    course("Accounting Fundamentals", "🧾", "Finance", ["Accounts", "Ledgers", "Journals", "Balance Sheet", "Cash Flow"]),
    course("GST", "📄", "Finance", ["GST Basics", "Input Tax", "Returns", "Invoices", "Compliance"]),
    course("Financial Analysis", "💰", "Finance", ["Finance Basics", "Ratios", "Profitability", "Risk", "Reports"]),
    course("Power BI", "📈", "Business", ["Power BI Basics", "Data Modeling", "Dashboards", "DAX", "Reports"]),
    course("Business Analytics", "📈", "Analytics", ["Analytics Basics", "Data", "Decision Making", "Metrics", "Analysis"]),
    course("Business Communication", "💬", "Communication", ["Presentation", "Writing", "Listening", "Leadership", "Communication"]),
    course("Banking & Finance", "🏦", "Finance", ["Banking Basics", "Loans", "Credit", "Risk", "Payments"])
  ]
};

function course(name, icon, category, levels) {
  const levelObjects = levels.map((title, i) => ({ level: i + 1, title, topics: makeTopics(name, title) }));
  const firstLevel = levelObjects[0];
  if (firstLevel && firstLevel.topics.length >= 2) {
    firstLevel.topics[0].isFree = true;
    firstLevel.topics[0].pointsRequired = 0;
    firstLevel.topics[0].price = 0;
    firstLevel.topics[1].isFree = true;
    firstLevel.topics[1].pointsRequired = 0;
    firstLevel.topics[1].price = 0;
  }
  return { id: slug(name), name, icon, category, levels: levelObjects };
}
function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
function makeTopics(courseName, levelTitle) {
  const base = [
    { title: `${levelTitle} foundation`, definition: `Understand the main idea, vocabulary and workflow of ${levelTitle} in ${courseName}.`, explanation: `Explain the purpose and reasoning behind ${levelTitle}.`, example: `Example: observe a simple scenario from ${courseName} and connect the idea to a real task.` },
    { title: `${levelTitle} practice`, definition: `Apply ${levelTitle} through a guided practice step in ${courseName}.`, explanation: `Solve a simple exercise that uses the selected concept.`, example: `Example: write one small input-output activity for ${courseName}.` },
    { title: `${levelTitle} evaluation`, definition: `Measure whether the learning can be solved with a proper approach.`, explanation: `Review the concept, compare outputs, and test the answer.`, example: `Example: check the final response by comparing a short worked example.` },
    { title: `${levelTitle} project task`, definition: `Connect ${levelTitle} to a modest project task in ${courseName}.`, explanation: `Turn the concept into a practical implementation.`, example: `Example: define a mini build, an input, and a measurable result.` },
    { title: `${levelTitle} output`, definition: `Explain the expected output from the ${courseName} workflow.`, explanation: `Describe how the task result should look.`, example: `Example: show the completed step and explain the correct result.` },
    { title: `${levelTitle} review`, definition: `Review the ${courseName} level topic in a short learning check.`, explanation: `Validate understanding before moving to the next learning objective.`, example: `Example: answer one recall question and one application question.` }
  ];
  return base;
}

const LEVEL_POINTS = [0, 100, 250, 500, 900, 1400, 2000, 2800, 3800, 5200];
const sessions = new Map();
const tests = new Map();
const assignments = new Map();

function readLocalStudents() {
  try {
    if (!fs.existsSync(STUDENTS_FILE)) return [];
    const raw = fs.readFileSync(STUDENTS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(student => ensureStudentFields(student)) : [];
  } catch (e) {
    console.warn("students.json fallback read failed:", e.message || e);
    return [];
  }
}

function writeLocalStudents(students) {
  try {
    fs.writeFileSync(STUDENTS_FILE, JSON.stringify(Array.isArray(students) ? students : [], null, 2));
  } catch (e) {
    console.warn("students.json fallback write failed:", e.message || e);
    throw e;
  }
}

async function readStudents() {
  if (firebaseEnabled && firebaseDb) {
    try {
      const snapshot = await firebaseDb.collection("students").get();
      return snapshot.docs.map(doc => ensureStudentFields({ id: doc.id, ...doc.data(), points: Number(doc.data().points || doc.data().totalPoints || 0) }));
    } catch (e) {
      console.warn("Firestore read failed, using students.json fallback:", e.message || e);
    }
  }
  return readLocalStudents();
}

async function writeStudents(students) {
  if (firebaseEnabled && firebaseDb) {
    try {
      const batch = firebaseDb.batch();
      for (const student of Array.isArray(students) ? students : []) {
        const record = ensureStudentFields({ ...student, points: Number(student.points || student.totalPoints || 0), updatedAt: new Date().toISOString() });
        record.totalPoints = Number(record.totalPoints || record.points || 0);
        record.points = Number(record.totalPoints || record.points || 0);
        batch.set(firebaseDb.collection("students").doc(record.id), record, { merge: true });
      }
      await batch.commit();
      return;
    } catch (e) {
      console.warn("Firestore write failed, using students.json fallback:", e.message || e);
    }
  }
  writeLocalStudents(students);
}
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
async function authUser(req) {
  const h = String(req.headers.authorization || "");
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  const payload = verify(token);
  if (!payload) return null;

  if (firebaseEnabled && firebaseDb) {
    try {
      const snap = await firebaseDb.collection("students").doc(payload.id).get();
      if (snap.exists) return ensureStudentFields({ id: snap.id, ...snap.data(), points: Number(snap.data().points || snap.data().totalPoints || 0) });
    } catch (e) {
      console.warn("Firestore auth student lookup failed:", e.message || e);
    }
  }

  const localStudents = readLocalStudents();
  const localStudent = localStudents.find(s => s.id === payload.id || s.email?.toLowerCase() === payload.email?.toLowerCase());
  if (localStudent) return ensureStudentFields(localStudent);

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
  const points = Number(s.points || s.totalPoints || 0);
  return {
    id: s.id, name: s.name, email: s.email, education: s.education, branch: s.branch,
    role: s.role || "student",
    selectedCourse: s.selectedCourse || null,
    points,
    totalPoints: points,
    currentLevel: calculateLevel(points),
    completedCourses: s.completedCourses || [],
    completedLevels: s.completedLevels || {},
    assignmentHistory: s.assignmentHistory || [],
    assayHistory: s.assignmentHistory || [],
    testHistory: s.testHistory || [],
    learnedTopics: s.learnedTopics || [],
    topicProgress: s.topicProgress || {},
    lessonProgress: s.lessonProgress || {},
    courseProgress: s.courseProgress || {},
    completedLevels: s.completedLevels || {},
    completedCourses: s.completedCourses || [],
    createdAt: s.createdAt
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
  const completed = Array.isArray(student.completedLevels?.[course.id]) ? student.completedLevels[course.id] : [];
  const unlocked = course.levels.map((_, i) => i === 0 || completed.includes(i));
  const totalTopics = course.levels.reduce((sum, level) => sum + (level.topics || []).length, 0);
  const progress = Math.round((normalizeCourseTopics(student, course).length / Math.max(1, totalTopics)) * 100);
  return {
    courseId: course.id,
    completed,
    unlocked,
    topicsCompleted: normalizeCourseTopics(student, course).length,
    topicsTotal: totalTopics,
    progress,
    courseProgress: student.courseProgress?.[course.id] ?? progress
  };
}
function ensureStudentFields(s) {
  if (!s) return s;
  const points = Number(s.points || s.totalPoints || s.xp || 0);
  s.totalPoints = points;
  s.points = points;
  s.selectedCourse ||= null;
  s.completedCourses ||= [];
  s.completedLevels ||= {};
  s.learnedTopics ||= [];
  s.topicProgress ||= {};
  s.lessonProgress ||= {};
  s.courseProgress ||= {};
  s.assignmentHistory ||= [];
  s.assignmentAttempts ||= {};
  s.assignmentQuestionHistory ||= [];
  s.testHistory ||= [];
  s.testQuestionHistory ||= [];
  s.testAttempts ||= {};
  s.currentLevel = calculateLevel(Number(s.totalPoints || 0));
  return s;
}

function topicTitleOf(item) { return String(item?.topicTitle || item?.title || item?.topic || "").trim(); }
function topicCourseOf(item) { return String(item?.courseId || item?.course || "").trim(); }
function parseGeminiJson(text) {
  const cleaned = String(text || "").replace(/```json|```/gi, "").trim();
  try { return JSON.parse(cleaned); } catch { return JSON.parse(cleaned.match(/\{[\s\S]*\}/)?.[0] || "{}") || null; }
}
function validateDailyTestQuestions(items) {
  if (!Array.isArray(items) || items.length !== 10) return null;
  return items.map((q, idx) => {
    if (!q || !q.question || !Array.isArray(q.options) || q.options.length !== 4 || Number.isNaN(Number(q.answer))) return null;
    return { question: String(q.question), options: q.options.map(String), answer: Number(q.answer) };
  }).filter(Boolean);
}
function validateAssignmentQuestions(items) {
  if (!Array.isArray(items) || items.length !== 5) return null;
  return items.map((q, idx) => {
    if (!q || !q.question || !Array.isArray(q.options) || q.options.length !== 4 || Number.isNaN(Number(q.answer))) return null;
    return { question: String(q.question), options: q.options.map(String), answer: Number(q.answer) };
  }).filter(Boolean);
}
function testReward(correct) { return Math.min(5, Math.floor(correct / 2)); }
function normalizeCourseTopics(student, course) {
  if (!course || !student) return [];
  const progress = student.topicProgress?.[course.id] || {};
  const keys = [];
  for (let i = 0; i < course.levels.length; i++) {
    const level = course.levels[i];
    for (const topic of Array.isArray(level.topics) ? level.topics : []) {
      const key = `${course.id}:${i + 1}:${topic.title}`;
      if (progress[key]?.completed === true || progress[key]?.learned === true) keys.push(key);
    }
  }
  return keys;
}
function courseCompletionPercent(s, c) {
  if (!c) return 0;
  const total = c.levels.reduce((sum, level) => sum + (level.topics || []).length, 0);
  const done = normalizeCourseTopics(s, c).length;
  return Math.min(100, Math.round((done / Math.max(1, total)) * 100));
}
function levelHasAllTopicsCompleted(s, c, level) {
  const levelTopics = (c.levels?.[level - 1]?.topics || []);
  const progress = s.topicProgress?.[c.id] || {};
  return levelTopics.every(topic => Boolean(progress[`${c.id}:${level}:${topic.title}`]?.completed));
}
function passedAssignmentCount(s, c, level) {
  return Array.isArray(s.assignmentHistory)
    ? s.assignmentHistory.filter(item => item?.courseId === c.id && Number(item.level) === Number(level) && item?.passed).length
    : 0;
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
async function requireUser(req, res) { const u = await authUser(req); if (!u) sendJSON(res, 401, { message: "Please login again." }); return u; }

async function api(req, res, url) {
  if (req.method === "OPTIONS") { res.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type, Authorization", "Access-Control-Allow-Methods": "GET,POST,OPTIONS" }); return res.end(); }
  try {
    if (req.method === "GET" && url.pathname === "/api/courses") return sendJSON(res, 200, { courses: COURSES });

    if (req.method === "GET" && url.pathname === "/api/admin/students") {
      const user = await requireUser(req, res);
      if (!user) return;
      if (user.role !== "admin") return sendJSON(res, 403, { message: "Admin access required." });
      const students = await readStudents();
      const studentRows = Array.isArray(students) ? students.filter(s => (s.role || "student") !== "admin") : [];
      const publicStudents = studentRows.map(publicUser);
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
      const students = await readStudents(); if (students.some(s => s.email === email)) return sendJSON(res, 409, { message: "An account with this email already exists." });
      const hp = hashPassword(password); const s = ensureStudentFields({ id: id(), name, email, education, branch, role: "student", passwordHash: hp.hash, passwordSalt: hp.salt, createdAt: new Date().toISOString() }); students.push(s); await writeStudents(students);
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

      const students = await readStudents(); const s = students.find(x => x.email === email);
      if (!s || !verifyPassword(password, s)) return sendJSON(res, 401, { message: "Invalid email or password." });
      ensureStudentFields(s); await writeStudents(students); return sendJSON(res, 200, { token: sign({ id: s.id, exp: Date.now() + 7 * 86400000 }), user: publicUser(s) });
    }

    const user = await requireUser(req, res); if (!user) return;
    ensureStudentFields(user);

    if (req.method === "GET" && url.pathname === "/api/me") return sendJSON(res, 200, { user: publicUser(user) });

    if (req.method === "POST" && url.pathname === "/api/course/select") {
      const b = await body(req); const courseId = String(b.courseId || ""); const c = courseFor(user.branch, courseId); if (!c) return sendJSON(res, 400, { message: "This course is not available for your branch." });
      const students = await readStudents(); const s = students.find(x => x.id === user.id); s.selectedCourse = c.id; ensureStudentFields(s); await writeStudents(students); return sendJSON(res, 200, { user: publicUser(s), course: c, state: courseState(s, c) });
    }

    if (req.method === "GET" && url.pathname === "/api/course/current") {
      const c = courseFor(user.branch, user.selectedCourse); if (!c) return sendJSON(res, 200, { course: null, state: null }); return sendJSON(res, 200, { course: c, state: courseState(user, c) });
    }

    if (req.method === "POST" && url.pathname === "/api/topic/complete") {
      const b = await body(req);
      const courseId = String(b.courseId || user.selectedCourse || "").trim();
      const c = courseFor(user.branch, courseId);
      if (!c) return sendJSON(res, 400, { message: "Invalid course for your branch." });
      const level = Number(b.level);
      const title = String(b.topicTitle || b.topic || "").trim();
      if (!Number.isInteger(level) || level < 1 || level > c.levels.length || !title) return sendJSON(res, 400, { message: "A valid course, level, and topic are required." });
      const levelTopics = c.levels[level - 1].topics || [];
      const allowed = levelTopics.some(t => String(t.title).toLowerCase() === title.toLowerCase());
      if (!allowed) return sendJSON(res, 400, { message: "Topic does not belong to the selected course and level." });
      const firstLevelFreeTitles = (c.levels[0]?.topics || []).slice(0, 2).map(t => String(t.title).toLowerCase());
      const freeTopic = level === 1 && firstLevelFreeTitles.includes(title.toLowerCase());

      const students = await readStudents(); const s = students.find(x => x.id === user.id); ensureStudentFields(s);

      s.learnedTopics ||= [];
      const exists = s.learnedTopics.some(item => String(item.courseId || item.id) === c.id && String(item.topicTitle || item.title || item.topic || "") === title);
      if (!exists) s.learnedTopics.push({ courseId: c.id, level, topicTitle: title, learnedAt: new Date().toISOString(), isFree: Boolean(freeTopic) });

      s.topicProgress ||= {};
      s.topicProgress[c.id] ||= {};
      const key = `${c.id}:${level}:${title}`;
      s.topicProgress[c.id][key] = { completed: true, learned: true, started: true, viewed: true, courseId: c.id, level, topicTitle: title, completedAt: new Date().toISOString(), isFree: Boolean(freeTopic) };

      s.lessonProgress ||= {};
      s.lessonProgress[key] = { viewed: true, completed: true, started: true, isFree: Boolean(freeTopic), courseId: c.id, level, topicTitle: title };

      s.courseProgress ||= {};
      s.courseProgress[c.id] = courseCompletionPercent(s, c);

      await writeStudents(students);
      await syncStudentHistoryToFirebase(s.id, "topic_complete", { courseId: c.id, level, title, isFree: Boolean(freeTopic), learnedAt: new Date().toISOString(), completed: true });
      return sendJSON(res, 200, { user: publicUser(s), message: "Topic marked completed and learned.", isFree: Boolean(freeTopic), points: 0, topic: { courseId: c.id, level, topicTitle: title, completed: true } });
    }

    if (req.method === "POST" && url.pathname === "/api/topic/video-progress") {
      const b = await body(req);
      const courseId = String(b.courseId || user.selectedCourse || "").trim();
      const c = courseFor(user.branch, courseId);
      if (!c) return sendJSON(res, 400, { message: "Invalid course for your branch." });
      const level = Number(b.level);
      const title = String(b.topicTitle || b.topic || "").trim();
      if (!Number.isInteger(level) || level < 1 || level > c.levels.length || !title) return sendJSON(res, 400, { message: "A valid course, level, and topic are required." });
      const levelTopics = c.levels[level - 1].topics || [];
      const allowed = levelTopics.some(t => String(t.title).toLowerCase() === title.toLowerCase());
      if (!allowed) return sendJSON(res, 400, { message: "Topic does not belong to the selected course and level." });
      const students = await readStudents();
      const s = students.find(x => x.id === user.id);
      ensureStudentFields(s);
      const key = `${c.id}:${level}:${title}`;
      const watchedPercent = Number(b.watchedPercent || b.progress || 0);
      const watchedSeconds = Number(b.watchedSeconds || 0);
      const duration = Number(b.duration || 0);
      const videoId = String(b.videoId || "");
      s.videoProgress ||= {};
      s.videoProgress[c.id] ||= {};
      s.videoProgress[c.id][key] = {
        courseId: c.id,
        level,
        topicTitle: title,
        videoId,
        watchedSeconds,
        watchedPercent,
        duration,
        completed: watchedPercent >= 90,
        lastUpdatedAt: new Date().toISOString()
      };

      s.topicProgress ||= {};
      s.topicProgress[c.id] ||= {};
      const progress = s.topicProgress[c.id][key] || { started: true, viewed: true, learned: false, completed: false, courseId: c.id, level, topicTitle: title };
      s.topicProgress[c.id][key] = { ...progress, started: true, viewed: true, learned: watchedPercent >= 90, completed: watchedPercent >= 90, courseId: c.id, level, topicTitle: title, completedAt: watchedPercent >= 90 ? new Date().toISOString() : progress.completedAt };

      if (watchedPercent >= 90) {
        s.learnedTopics ||= [];
        const exists = s.learnedTopics.some(item => String(item.courseId || item.id) === c.id && String(item.topicTitle || item.title || item.topic || "") === title);
        if (!exists) s.learnedTopics.push({ courseId: c.id, level, topicTitle: title, learnedAt: new Date().toISOString(), isFree: level === 1 && (c.levels[0]?.topics || []).slice(0, 2).some(t => String(t.title).toLowerCase() === title.toLowerCase()) });
        s.lessonProgress ||= {};
        s.lessonProgress[key] = { viewed: true, completed: true, started: true, courseId: c.id, level, topicTitle: title, learnedAt: new Date().toISOString() };
      }

      s.courseProgress ||= {};
      s.courseProgress[c.id] = courseCompletionPercent(s, c);

      await writeStudents(students);
      await syncStudentHistoryToFirebase(s.id, "topic_video_progress", { courseId: c.id, level, title, videoId, watchedPercent, watchedSeconds, duration, completed: watchedPercent >= 90, updatedAt: new Date().toISOString() });
      return sendJSON(res, 200, { user: publicUser(s), video: s.videoProgress[c.id][key], topic: { courseId: c.id, level, topicTitle: title, completed: watchedPercent >= 90 }, message: watchedPercent >= 90 ? "✅ Video Completed" : "Video progress saved." });
    }

    if (req.method === "POST" && url.pathname === "/api/course/complete-level") {
      const b = await body(req); const courseId = String(b.courseId || user.selectedCourse || ""); const level = Number(b.level); const c = courseFor(user.branch, courseId); if (!c || !Number.isInteger(level) || level < 1 || level > c.levels.length) return sendJSON(res, 400, { message: "Invalid course or level." });
      const students = await readStudents(); const s = students.find(x => x.id === user.id); ensureStudentFields(s);
      const levelTopics = c.levels[level - 1].topics || [];
      const topicProgress = s.topicProgress?.[c.id] || {};
      const allTopicsCompleted = levelTopics.every(topic => Boolean(topicProgress[`${c.id}:${level}:${topic.title}`]?.completed));
      if (!allTopicsCompleted) return sendJSON(res, 400, { message: "Complete every topic in this level before completing the level." });
      const passedCount = passedAssignmentCount(s, c, level);
      if (passedCount < 3) return sendJSON(res, 400, { message: "Complete all three assignments for this level before earning the level bonus." });

      s.completedLevels ||= {};
      s.completedLevels[c.id] ||= [];
      if (!s.completedLevels[c.id].includes(level)) s.completedLevels[c.id].push(level);
      s.completedLevels[c.id].sort((a, b) => a - b);

      const allLevelsCompleted = c.levels.length === s.completedLevels[c.id].length;
      if (allLevelsCompleted && !s.completedCourses.includes(c.id)) s.completedCourses.push(c.id);

      const bonus = 10;
      s.totalPoints += bonus;
      s.points = s.totalPoints;
      s.currentLevel = calculateLevel(s.totalPoints);
      s.courseProgress ||= {};
      s.courseProgress[c.id] = Math.min(100, courseCompletionPercent(s, c));
      if (allLevelsCompleted) s.courseProgress[c.id] = 100;

      await writeStudents(students);
      await syncStudentHistoryToFirebase(s.id, "level_complete", { courseId: c.id, level, bonus, completed: s.completedCourses.includes(c.id), totalPoints: s.totalPoints, completedLevels: s.completedLevels[c.id] });
      return sendJSON(res, 200, { user: publicUser(s), state: courseState(s, c), completed: s.completedCourses.includes(c.id), points: bonus, message: allLevelsCompleted ? `Level ${level} completed. Course completed.` : `Level ${level} completed. +${bonus} level bonus.`, courseCompleted: allLevelsCompleted, levelCompleted: true });
    }

    if (req.method === "POST" && url.pathname === "/api/ai") {
      const b = await body(req); const question = String(b.question || "").trim(); if (!question) return sendJSON(res, 400, { message: "Question is required." });
      const course = courseFor(user.branch, user.selectedCourse);
      const selectedLevel = Number(user.currentLevel || 1);
      const context = {
        education: user.education,
        branch: user.branch,
        selectedCourse: course?.name || "No selected course",
        currentLevel: selectedLevel,
        currentTopic: user.topicProgress?.[user.selectedCourse]?.activeTopic || "None",
        completedTopics: Array.isArray(user.completedLessons) ? user.completedLessons : [],
        learnedTopics: Array.isArray(user.learnedTopics) ? user.learnedTopics : [],
        lessonProgress: user.lessonProgress || {}
      };
      let answer = ""; let live = null;
      if (isCurrentInfo(question)) live = await liveLookup(question);
      if (live) {
        answer = `${live.answer}\n\nSource: ${live.source}`;
      } else {
        try {
          answer = await gemini(`You are NEXA, the SkillNexa AI Tutor. Student education: ${context.education}. Branch: ${context.branch}. Selected course: ${context.selectedCourse}. Current level: ${context.currentLevel}. Current topic: ${context.currentTopic}. Completed topics: ${context.completedTopics.map(String).join(", ") || "None"}. Learned topics: ${context.learnedTopics.map(t => topicTitleOf(t)).join(", ") || "None"}. Lesson progress: ${JSON.stringify(context.lessonProgress)}. Answer clearly and step-by-step. Detect the student's language and reply in that language. Do not invent current facts. If the question asks for current/present/latest information and no verified source is available, say that verification is unavailable instead of guessing. Do not automatically mark any topic as learned. Question: ${question}`);
        } catch (e) {
          answer = `I couldn't reach Gemini right now.\n\n${e.message}\n\nYou can still use the course lessons and YouTube resources below.`;
        }
      }
      return sendJSON(res, 200, { answer, liveSource: live?.source || null, liveUrl: live?.url || null });
    }

    if (req.method === "POST" && url.pathname === "/api/test/generate") {
      const course = courseFor(user.branch, user.selectedCourse);
      if (!course) return sendJSON(res, 400, { message: "Select a course first." });
      const students = await readStudents(); const s = students.find(x => x.id === user.id); ensureStudentFields(s);
      const learned = (s.learnedTopics || []).filter(t => t && String(t.courseId || "") === course.id);
      if (learned.length < 3) return sendJSON(res, 403, { message: "Learn more topics to unlock your Daily Test." });
      const selectedTopics = learned.map(t => topicTitleOf(t));
      const questionHistory = Array.isArray(s.testQuestionHistory) ? s.testQuestionHistory : [];
      const prompt = `Generate a structured JSON object with exactly 10 multiple-choice questions and exactly 4 options for each question, using only the supplied learned topics. Branch: ${user.branch}. Education: ${user.education}. Course: ${course.name}. Level: ${Math.min(5, Math.max(1, Number(user.currentLevel || 1)))}. Learned topics: ${selectedTopics.join(", ")}. Previous question history: ${questionHistory.join(", ") || "None"}. Generate questions ONLY from the supplied learned topics. Do not generate questions from topics outside the supplied context. Do not repeat previous questions. Do not create obvious paraphrased duplicates. Return valid structured JSON with fields question, options, answer. Use answer as a 0-based index. Do not include any extra text.`;
      try {
        const raw = await gemini(prompt);
        const parsed = parseGeminiJson(raw);
        if (!Array.isArray(parsed.questions)) {
          const fallback = parseGeminiJson(raw);
          if (!Array.isArray(fallback)) throw new Error("Invalid Gemini response");
          parsed.questions = fallback;
        }
        const questions = validateDailyTestQuestions(parsed.questions || parsed);
        if (!questions || questions.length !== 10) throw new Error("Invalid Gemini test structure");
        const testId = id();
        tests.set(testId, { userId: user.id, questions, createdAt: Date.now() });
        return sendJSON(res, 200, { testId, questions: questions.map(({ question, options }) => ({ question, options })) });
      } catch (e) {
        return sendJSON(res, 400, { message: "Daily Test generation failed. Learn more topics or try again later." });
      }
    }

    if (req.method === "POST" && url.pathname === "/api/test/submit") {
      const b = await body(req); const t = tests.get(String(b.testId || "")); if (!t || t.userId !== user.id) return sendJSON(res, 404, { message: "Test not found." });
      const answers = Array.isArray(b.answers) ? b.answers : [];
      const correct = t.questions.reduce((n, q, i) => n + (Number(answers[i]) === Number(q.answer) ? 1 : 0), 0);
      const points = testReward(correct);
      const students = await readStudents(); const s = students.find(x => x.id === user.id); ensureStudentFields(s);
      const duplicate = s.testHistory.some(x => x.testId === String(b.testId || ""));
      if (duplicate) return sendJSON(res, 400, { message: "This test has already been recorded." });
      const questionHistory = t.questions.map(q => q.question);
      s.testQuestionHistory ||= [];
      s.testQuestionHistory = s.testQuestionHistory.concat(questionHistory);
      s.testHistory.push({ testId: String(b.testId || ""), date: new Date().toISOString(), score: correct * 10, correct, maxScore: 100, points, questionHistory });
      s.totalPoints += points;
      s.currentLevel = calculateLevel(s.totalPoints);
      await writeStudents(students);
      await syncStudentHistoryToFirebase(s.id, "test_submit", { testId: String(b.testId || ""), correct, score: correct * 10, points, questionHistory });
      tests.delete(String(b.testId));
      return sendJSON(res, 200, { correct, totalQuestions: 10, score: correct * 10, points, totalPoints: s.totalPoints, level: calculateLevel(s.totalPoints), maxPoints: 5, message: "Daily test submitted." });
    }

    if (req.method === "POST" && url.pathname === "/api/assignment/start") {
      const c = courseFor(user.branch, user.selectedCourse); if (!c) return sendJSON(res, 400, { message: "Select a course first." });
      const students = await readStudents(); const s = students.find(x => x.id === user.id); ensureStudentFields(s);
      const courseLevels = c.levels; const completed = Array.isArray(s.completedLevels?.[c.id]) ? s.completedLevels[c.id] : [];
      const level = Math.min(courseLevels.length, Math.max(1, Math.min(completed.length + 1, courseLevels.length)));
      const learned = (s.learnedTopics || []).filter(t => t && String(t.courseId || t.id) === c.id && Number(t.level) === level);
      if (learned.length < 1) return sendJSON(res, 403, { message: "Learn more topics to unlock assignments." });
      const assignmentId = id();
      const prompt = `Generate exactly 5 questions/tasks as valid structured JSON for ${course.name} level ${level}. Use only the supplied learned topics from the course, not unlearned topics. Branch: ${user.branch}. Education: ${user.education}. Level: ${level}. Course: ${course.name}. Learned topics: ${learned.map(t => topicTitleOf(t)).join(", ")}. Previous assignment question history: ${Array.isArray(s.assignmentQuestionHistory) ? s.assignmentQuestionHistory.join(", ") : "None"}. Difficulty: ${level === 1 ? "Basic application" : level === 2 ? "Intermediate application" : "Practical / advanced application"}. Generate exactly 5 questions/tasks. Return valid structured JSON with fields title, questions, answerType, difficulty. For each question, include question, options, answer. Return valid structured JSON only.`;
      try {
        const raw = await gemini(prompt);
        const parsed = parseGeminiJson(raw);
        const questions = validateAssignmentQuestions(parsed.questions || parsed);
        if (!questions || questions.length !== 5) throw new Error("Invalid assignment structure");
        const task = { id: assignmentId, title: `${c.name} Level ${level} Assignment`, level, courseId: c.id, difficulty: level === 1 ? "Basic" : level === 2 ? "Intermediate" : "Advanced", prompt: `${parsed.title || `${c.name} Level ${level} Assignment`}`, questions, createdAt: Date.now(), status: "open" };
        assignments.set(assignmentId, { userId: user.id, courseId: c.id, level, task, createdAt: Date.now() });
        return sendJSON(res, 200, { task: { id: task.id, title: task.title, prompt: task.prompt, level, difficulty: task.difficulty, questions: task.questions } });
      } catch (e) {
        return sendJSON(res, 400, { message: "Assignment generation failed. Learn more topics first." });
      }
    }

    if (req.method === "POST" && url.pathname === "/api/assignment/submit") {
      const b = await body(req); const a = assignments.get(String(b.assignmentId || "")); if (!a || a.userId !== user.id) return sendJSON(res, 404, { message: "Assignment not found." });
      const text = String(b.answer || "").trim(); if (text.length < 20) return sendJSON(res, 400, { message: "Please submit a more complete answer (at least 20 characters)." });
      const students = await readStudents(); const s = students.find(x => x.id === user.id); ensureStudentFields(s);
      const assignmentKey = a.task.id || String(b.assignmentId || "");
      const attempts = s.assignmentAttempts?.[assignmentKey] || { count: 0, retryAt: null, status: "open" };
      if (attempts.count >= 1 && attempts.status === "failed" && attempts.retryAt && new Date(attempts.retryAt).getTime() > Date.now()) {
        return sendJSON(res, 403, { message: "Retry available after 24 hours.", nextRetryAt: attempts.retryAt });
      }
      let passed = text.length >= 20;
      const now = new Date().toISOString();
      if (passed) {
        const existing = s.assignmentHistory.some(x => x.assignmentId === assignmentKey);
        if (!existing) {
          s.assignmentHistory.push({ assignmentId: assignmentKey, courseId: a.courseId, level: a.level, passed: true, points: 20, date: now });
          s.totalPoints += 20;
        }
        s.assignmentAttempts ||= {};
        s.assignmentAttempts[assignmentKey] = { count: 1, lastAttemptAt: now, status: "passed", retryAt: null };
        s.assignmentQuestionHistory ||= [];
        s.assignmentQuestionHistory.push({ assignmentId: assignmentKey, level: a.level, courseId: a.courseId, date: now });
        assignments.delete(String(b.assignmentId));
        await writeStudents(students);
        await syncStudentHistoryToFirebase(s.id, "assignment_submit", { assignmentId: assignmentKey, courseId: a.courseId, level: a.level, passed: true, points: 20, date: now });
        return sendJSON(res, 200, { points: 20, totalPoints: s.totalPoints, level: calculateLevel(s.totalPoints), message: "Completed — 20 points earned.", passed: true, assignmentHistory: s.assignmentHistory });
      }
      const failRetry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      s.assignmentAttempts ||= {};
      s.assignmentAttempts[assignmentKey] = { count: (attempts.count || 0) + 1, lastAttemptAt: now, status: "failed", retryAt: failRetry };
      s.assignmentQuestionHistory ||= [];
      s.assignmentQuestionHistory.push({ assignmentId: assignmentKey, level: a.level, courseId: a.courseId, date: now, failed: true });
      assignments.delete(String(b.assignmentId));
      await writeStudents(students);
      await syncStudentHistoryToFirebase(s.id, "assignment_submit", { assignmentId: assignmentKey, courseId: a.courseId, level: a.level, passed: false, retryAt: failRetry, date: now });
      return sendJSON(res, 403, { message: "Not Good — Retry available after 24 hours.", nextRetryAt: failRetry });
    }

    if (req.method === "POST" && url.pathname === "/api/storage/upload") {
      const b = await body(req);
      const name = String(b.name || "artifact.txt").trim();
      const content = String(b.content || "");
      if (!content) return sendJSON(res, 400, { message: "Content is required for storage upload." });
      try {
        const uploaded = await uploadToFirebaseStorage(user.id, { name, content, contentType: b.contentType || "text/plain; charset=utf-8" });
        const history = { studentId: user.id, courseId: user.selectedCourse || null, fileName: uploaded.fileName, url: uploaded.url, createdAt: new Date().toISOString() };
        syncStudentHistoryToFirebase(user.id, "storage_upload", history);
        return sendJSON(res, 200, { message: "Storage upload saved to Firebase Storage.", fileName: uploaded.fileName, url: uploaded.url });
      } catch (e) {
        return sendJSON(res, 503, { message: "Firebase Storage is not configured. " + (e.message || e) });
      }
    }

    if (req.method === "GET" && url.pathname === "/api/history") {
      const students = await readStudents(); const s = students.find(x => x.id === user.id) || user;
      ensureStudentFields(s);
      const history = {
        assignmentHistory: Array.isArray(s.assignmentHistory) ? s.assignmentHistory : [],
        testHistory: Array.isArray(s.testHistory) ? s.testHistory : [],
        assignmentQuestionHistory: Array.isArray(s.assignmentQuestionHistory) ? s.assignmentQuestionHistory : [],
        testQuestionHistory: Array.isArray(s.testQuestionHistory) ? s.testQuestionHistory : []
      };
      await syncStudentHistoryToFirebase(user.id, "history_fetch", history);
      return sendJSON(res, 200, { history });
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
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";
  if (pathname.startsWith("/public/")) pathname = pathname.replace(/^\/public\//, "/");
  const safe = path.normalize(pathname).replace(/^([.][.][/\\])+/, "");
  const file = path.join(PUBLIC, safe);
  if (!file.startsWith(PUBLIC)) return sendJSON(res, 403, { message: "Forbidden" });
  fs.readFile(file, (err, data) => { if (err) return fs.readFile(path.join(PUBLIC, "index.html"), (e2, d2) => { if (e2) { res.writeHead(404); return res.end("Not found"); } res.writeHead(200, { "Content-Type": MIME[".html"] }); res.end(d2); }); res.writeHead(200, { "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream" }); res.end(data); });
}

http.createServer((req, res) => { const url = new URL(req.url, `http://${req.headers.host || "localhost"}`); if (url.pathname.startsWith("/api/")) return api(req, res, url); serveStatic(req, res, url); }).listen(PORT, () => console.log(`SkillNexa running at http://localhost:${PORT}`));
