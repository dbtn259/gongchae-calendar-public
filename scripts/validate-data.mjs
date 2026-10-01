// 공채 데이터 형식 검사:  node scripts/validate-data.mjs
// 데이터를 고친 뒤(사람이든 자동 업데이트든) 배포 전에 실행하세요. 문제가 있으면 종료 코드 1.
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
import { existsSync } from "node:fs";
const file = [path.join(root, "data/recruits.js"), path.join(root, "src/data/recruits.js")].find(f => existsSync(f));
const ctx = { window: {} };
vm.runInNewContext(readFileSync(file, "utf8"), ctx, { filename: file });
const { RECRUITS = [], RECRUIT_META = {}, ALWAYS_OPEN = [] } = ctx.window;

const errors = [];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const okDate = s => DATE.test(s) && !Number.isNaN(new Date(s + "T00:00:00").getTime());
const okUrl = s => { try { return /^https?:$/.test(new URL(s).protocol); } catch { return false; } };
const ids = new Set();

if (!okDate(RECRUIT_META.updated || "")) errors.push("RECRUIT_META.updated 가 YYYY-MM-DD 형식이 아닙니다");
RECRUITS.forEach((x, i) => {
  const at = `#${i} ${x.id || "(id 없음)"}`;
  if (!/^[a-z0-9-]+$/.test(x.id || "")) errors.push(`${at}: id는 영문 소문자·숫자·하이픈만`);
  if (ids.has(x.id)) errors.push(`${at}: id 중복`); ids.add(x.id);
  for (const k of ["company", "title", "jobs"]) if (!x[k] || typeof x[k] !== "string") errors.push(`${at}: ${k} 비어 있음`);
  if (!["robot", "big"].includes(x.group)) errors.push(`${at}: group은 robot|big`);
  for (const k of ["mech", "exp"]) if (typeof x[k] !== "boolean") errors.push(`${at}: ${k}는 true|false`);
  if (x.start !== null && !okDate(x.start || "")) errors.push(`${at}: start는 YYYY-MM-DD 또는 null`);
  if (!okDate(x.end || "")) errors.push(`${at}: end는 YYYY-MM-DD`);
  if (x.start && x.end && x.start > x.end) errors.push(`${at}: start가 end보다 늦음`);
  if (!okUrl(x.url || "")) errors.push(`${at}: url이 올바르지 않음`);
  if (x.source && !okUrl(x.source)) errors.push(`${at}: source가 올바르지 않음`);
});
ALWAYS_OPEN.forEach((a, i) => { if (!a.company || !okUrl(a.url || "")) errors.push(`ALWAYS_OPEN #${i}: company/url 확인`); });

if (errors.length) { console.error("데이터 오류 " + errors.length + "건\n- " + errors.join("\n- ")); process.exit(1); }
console.log(`OK — 공고 ${RECRUITS.length}건, 상시채용 ${ALWAYS_OPEN.length}곳, 기준일 ${RECRUIT_META.updated}`);
