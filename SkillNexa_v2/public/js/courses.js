import { api } from "./api.js";
let allCourses = {};
export async function loadCourses() { if (!Object.keys(allCourses).length) allCourses = (await api("/api/courses")).courses; return allCourses; }
export function branchCourses(branch) { return allCourses[branch] || []; }
export function youtubeUrl(query) { return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`; }
export async function selectCourse(courseId) { return api("/api/course/select", { method:"POST", body:JSON.stringify({ courseId }) }); }
export async function currentCourse() { return api("/api/course/current"); }
export async function completeLevel(courseId, level) { return api("/api/course/complete-level", { method:"POST", body:JSON.stringify({ courseId, level }) }); }
