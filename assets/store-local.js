/* 브라우저(localStorage) 저장소 — 지원 기록 + 화면 설정.
 * 지원 기록 형식: { [recruitId]: { status, memo, appliedAt, updatedAt } }
 *   status: "interest" | "applied" | "pass" | "final" | "fail"
 */
(function () {
  const KEY = "rc.records.v1";
  const read = (k, fb) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch (e) { return fb; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };

  let records = read(KEY, {});

  window.LocalStore = {
    kind: "local",
    async init() { records = read(KEY, {}); },
    all() { return records; },
    get(id) { return records[id] || null; },
    async set(id, patch) {
      const cur = records[id] || {};
      const next = { ...cur, ...patch, updatedAt: new Date().toISOString() };
      if (!next.status && !next.memo && !next.appliedAt) delete records[id];
      else records[id] = next;
      write(KEY, records);
      return records[id] || null;
    },
    async remove(id) { delete records[id]; write(KEY, records); },
    clearAll() { records = {}; write(KEY, records); },
    user() { return null; }
  };

  /* 화면 설정(직무 범위, 테마 등)은 모드와 상관없이 브라우저에 저장 */
  window.Prefs = {
    get(k, fb) { return read("rc.pref." + k, fb); },
    set(k, v) { write("rc.pref." + k, v); }
  };
})();
