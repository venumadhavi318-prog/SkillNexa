const LANGS = { Auto:"en-IN", English:"en-IN", Telugu:"te-IN", Hindi:"hi-IN", Tamil:"ta-IN", Kannada:"kn-IN", Malayalam:"ml-IN", Marathi:"mr-IN", Bengali:"bn-IN", Gujarati:"gu-IN", Punjabi:"pa-IN", Urdu:"ur-IN", Odia:"or-IN", Assamese:"as-IN" };
let enabled = false;
let current = null;
export function setVoiceEnabled(v) { enabled = Boolean(v); if (!enabled) stopVoice(); return enabled; }
export function isVoiceEnabled() { return enabled; }
export function stopVoice() { if ("speechSynthesis" in window) window.speechSynthesis.cancel(); current = null; }
export function speak(text, language = "Auto", style = "Female") {
  if (!("speechSynthesis" in window)) return false;
  stopVoice(); const u = new SpeechSynthesisUtterance(String(text).slice(0, 12000)); const lang = LANGS[language] || LANGS.Auto; u.lang = lang;
  const voices = window.speechSynthesis.getVoices(); const matches = voices.filter(v => v.lang?.toLowerCase().startsWith(lang.split("-")[0].toLowerCase()));
  const male = /male|david|mark|ravi|google uk english male/i; const female = /female|zira|samantha|google uk english female|heera/i;
  if (style === "Male") u.voice = matches.find(v => male.test(v.name)) || matches[0]; else u.voice = matches.find(v => female.test(v.name)) || matches[0];
  if (style === "Sweet") { u.rate = 0.9; u.pitch = 1.15; } else if (style === "Deep") { u.rate = 0.85; u.pitch = 0.7; } else { u.rate = 0.98; u.pitch = 1; }
  u.onend = () => { current = null; }; current = u; window.speechSynthesis.speak(u); return true;
}
export function waitForVoices() { return new Promise(resolve => { if (!("speechSynthesis" in window)) return resolve([]); const v = speechSynthesis.getVoices(); if (v.length) return resolve(v); speechSynthesis.onvoiceschanged = () => resolve(speechSynthesis.getVoices()); setTimeout(() => resolve(speechSynthesis.getVoices()), 800); }); }
