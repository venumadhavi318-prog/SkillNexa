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

export function setVoiceEnabled(v) {
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

export function isVoiceEnabled() { return enabled; }

export function stopVoice() {
  generation++;
  try { window.speechSynthesis.cancel(); } catch (e) {}
  activeUtterance = null;
  speechState.message = "";
  speechState.position = 0;
  speechState.status = "idle";
}

export function speak(text, language = "Auto", style = "Female Sweet") {
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

export function setVoiceStyle(style) {
  if (!STYLES[style]) return;
  speechState.voiceStyle = style;
  if (speechState.status === "speaking" && speechState.position < speechState.message.length) {
    resumeAfterVoices(speechState.position, ++generation);
  }
}

export function setSpeechLanguage(language) {
  speechState.lang = formatLang(LANGS[language] || LANGS.Auto || "en-IN");
  if (speechState.status === "speaking" && speechState.position < speechState.message.length) {
    resumeAfterVoices(speechState.position, ++generation);
  }
}

export function getSpeechState() { return Object.assign({}, speechState, { enabled: enabled }); }
export function waitForVoices() { return new Promise(resolve => { if (!("speechSynthesis" in window)) return resolve([]); const v = speechSynthesis.getVoices(); if (v.length) return resolve(v); speechSynthesis.onvoiceschanged = () => resolve(speechSynthesis.getVoices()); setTimeout(() => resolve(speechSynthesis.getVoices()), 800); }); }