/* 공채 캘린더 — 앱 본체 (빌드 도구 없이 동작하는 순수 JS) */
(function () {
  "use strict";

  const CFG = window.APP_CONFIG || { mode: "local" };
  const DATA = (window.RECRUITS || []).slice();
  const META = window.RECRUIT_META || {};
  const ALWAYS = window.ALWAYS_OPEN || [];
  const BYID = Object.fromEntries(DATA.map(x => [x.id, x]));
  let Store = window.LocalStore;

  /* ───────── 날짜 ───────── */
  const DOW = "일월화수목금토";
  const startOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  let TODAY = startOfDay(new Date());
  const pd = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const md = s => s ? `${+s.slice(5, 7)}.${+s.slice(8, 10)}` : "미정";
  const full = s => { if (!s) return "미정"; const d = pd(s); return `${d.getMonth() + 1}월 ${d.getDate()}일 (${DOW[d.getDay()]})`; };
  const diffDays = (a, b) => Math.round((a - b) / 864e5);

  function status(x) {
    if (pd(x.end) < TODAY) return "closed";
    if (x.start && pd(x.start) > TODAY) return "soon";
    return "open";
  }
  /* 남은 기간 표기: 큰 글자 + 작은 설명 */
  function remain(x) {
    const s = status(x);
    if (s === "closed") return { cls: "off", big: "마감", small: md(x.end) + " 종료", text: "마감" };
    if (s === "soon") { const k = diffDays(pd(x.start), TODAY); return { cls: "wait", big: String(k), small: "일 후 시작", text: `${k}일 후 시작` }; }
    const n = diffDays(pd(x.end), TODAY);
    if (n === 0) return { cls: "today hot", big: "오늘", small: "마감", text: "오늘 마감" };
    return { cls: n <= 3 ? "hot" : "go", big: String(n), small: "일 남음", text: `${n}일 남음` };
  }
  const STATUS = { open: ["접수중", "t-open"], soon: ["예정", "t-soon"], closed: ["마감", "t-closed"] };
  const APPLY = [["interest", "관심"], ["applied", "지원완료"], ["pass", "서류합격"], ["final", "최종합격"], ["fail", "불합격"]];
  const APPLY_LABEL = Object.fromEntries(APPLY);

  /* ───────── 공통 ───────── */
  const $ = (s, el = document) => el.querySelector(s);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const main = $("#main");
  const svg = (d, extra = "") => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${d}</svg>`;
  const ICON = {
    sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>'),
    moon: svg('<path d="M20.5 13.2A8.5 8.5 0 1 1 10.8 3.5a6.6 6.6 0 0 0 9.7 9.7z"/>'),
    auto: svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17a8.5 8.5 0 0 0 0-17z" fill="currentColor" stroke="none"/>'),
    ext: svg('<path d="M14 4h6v6M20 4l-8.5 8.5M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10"/>'),
    cal: svg('<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>'),
    plus: svg('<path d="M12 5v14M5 12h14"/>'),
    chev: svg('<path d="m9 6 6 6-6 6"/>', 'class="chev"'),
    left: svg('<path d="m15 6-6 6 6 6"/>'),
    right: svg('<path d="m9 6 6 6-6 6"/>'),
    x: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
    search: svg('<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>')
  };

  let toastTimer;
  function toast(msg) {
    const t = $("#toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), 2400);
  }

  /* ───────── 상태 ───────── */
  const state = {
    scope: Prefs.get("scope", "mech"),
    f: { group: "", status: "", type: "", mine: "", q: "", year: String(TODAY.getFullYear()) },
    tlYear: TODAY.getFullYear(),
    sort: Prefs.get("sort", "deadline"),
    month: new Date(TODAY.getFullYear(), TODAY.getMonth(), 1),
    sel: ymd(TODAY),
    animated: false
  };
  const yearOf = x => +x.end.slice(0, 4);
  /* 최근 5년: 올해 포함. 해가 바뀌면 자동으로 한 해씩 밀려남 */
  const RECENT_N = 5;
  const RECENT = Array.from({ length: RECENT_N }, (_, i) => TODAY.getFullYear() - i); // 내림차순
  const YEARS = RECENT;
  const scoped = (year) => DATA.filter(x => (state.scope === "all" || x.mech) && (year == null || yearOf(x) === year));
  const hasRec = id => { const r = Store.get(id); return !!(r && r.status); };
  function filtered(opts = {}) {
    const { group, status: st, type, mine, q, year } = state.f;
    const qq = q.trim().toLowerCase();
    return scoped().filter(x => {
      if (!opts.ignoreYear && year && yearOf(x) !== +year) return false;
      if (group && x.group !== group) return false;
      if (!opts.ignoreStatus && st && status(x) !== st) return false;
      if (type === "new" && x.exp) return false;
      if (type === "exp" && !x.exp) return false;
      if (mine && !hasRec(x.id)) return false;
      if (qq && !(x.company + " " + x.title + " " + x.jobs).toLowerCase().includes(qq)) return false;
      return true;
    });
  }
  const byDeadline = (a, b) => a.end.localeCompare(b.end);

  /* ───────── 공통 조각 ───────── */
  const statusTag = x => { const [l, c] = STATUS[status(x)]; return `<span class="tag ${c}">${l}</span>`; };
  const extraTags = x => (x.group === "robot" ? `<span class="tag t-robot">로봇</span>` : "") + (x.exp ? `<span class="tag t-exp">경력 포함</span>` : "");
  const mineTag = x => { const r = Store.get(x.id); return r && r.status ? `<span class="tag t-mine">${APPLY_LABEL[r.status]}</span>` : ""; };
  const range = x => `${md(x.start)} – ${md(x.end)}`;

  /* 기업 아바타: 이름에서 글자, 해시로 색 */
  function avatar(co, size = "") {
    const name = co.replace(/^KAI\s*/, "");
    const m = name.match(/^[A-Za-z]+/);
    const letter = m ? m[0].slice(0, 2).toUpperCase() : [...name][0];
    let h = 0; for (const c of co) h = (h * 31 + c.codePointAt(0)) >>> 0;
    return `<span class="av av-${h % 8}${size ? " av-" + size : ""}" aria-hidden="true">${esc(letter)}</span>`;
  }
  function ddChip(x) {
    const r = remain(x), s = status(x);
    const cls = s === "closed" ? "off" : s === "soon" ? "wait" : r.cls.includes("hot") ? "hot" : "go";
    const text = s === "closed" ? "마감" : s === "soon" ? r.text : (r.big === "오늘" ? "오늘 마감" : `D-${r.big}`);
    return `<span class="dchip ${cls}">${text}</span>`;
  }
  function row(x) {
    const s = status(x);
    return `<button type="button" class="row ${s}" data-open="${esc(x.id)}">
      ${avatar(x.company)}
      <span class="who"><span class="co">${esc(x.company)}${extraTags(x)}${mineTag(x)}</span><span class="ti">${esc(x.title)}</span></span>
      <span class="when"><span class="range">${range(x)}</span>${ddChip(x)}</span>
      ${ICON.chev}
    </button>`;
  }
  const rowsOr = (list, empty) => list.length ? `<div class="rows">${list.map(row).join("")}</div>` : `<div class="empty">${empty}</div>`;

  /* ───────── 필터 ───────── */
  const CHIPS = {
    group: [["", "전체"], ["robot", "로봇기업"], ["big", "대기업"]],
    status: [["", "전체"], ["open", "접수중"], ["soon", "예정"], ["closed", "마감"]],
    type: [["", "전체"], ["new", "신입만"], ["exp", "경력 포함"]],
    year: [...YEARS.map(y => [String(y), `${y}년`]), ["", "모든 연도"]]
  };
  function filterBar(opts) {
    const group = (key, label) => `<div class="f-group" role="group" aria-label="${label}"><span>${label}</span><div class="chips">${CHIPS[key].map(([v, t]) => `<button type="button" class="chip-btn" data-f="${key}" data-v="${v}" aria-pressed="${state.f[key] === v}">${t}</button>`).join("")}</div></div>`;
    return `<div class="filters">
      <div class="f-row">
        <label class="search" for="fQ">${ICON.search}<span class="sr">검색</span><input type="search" id="fQ" placeholder="기업이나 직무로 찾기 (예: 기구설계)" value="${esc(state.f.q)}"></label>
        <button type="button" class="chip-btn" data-f="mine" data-v="${state.f.mine ? "" : "1"}" aria-pressed="${!!state.f.mine}">내가 기록한 공고만</button>
      </div>
      ${opts.year ? `<div class="f-row">${group("year", "연도")}</div>` : ""}
      <div class="f-row">${group("group", "구분")}${opts.status ? group("status", "상태") : ""}${group("type", "대상")}</div>
    </div>`;
  }
  function bindFilters(onChange) {
    main.querySelectorAll(".filters .chip-btn").forEach(b => b.addEventListener("click", () => {
      state.f[b.dataset.f] = b.dataset.v;
      main.querySelectorAll(`.chip-btn[data-f="${b.dataset.f}"]`).forEach(o => {
        if (b.dataset.f === "mine") { o.setAttribute("aria-pressed", String(!!state.f.mine)); o.dataset.v = state.f.mine ? "" : "1"; }
        else o.setAttribute("aria-pressed", String(o.dataset.v === state.f[b.dataset.f]));
      });
      onChange();
    }));
    const q = $("#fQ", main); if (q) q.addEventListener("input", () => { state.f.q = q.value; onChange(); });
  }
  const scopeLine = () => state.scope === "mech"
    ? "기계 직무(설계·연구개발·생산기술·품질·설비)를 뽑는 공고만 보고 있어요."
    : "직무와 상관없이 모든 공채를 보고 있어요.";

  /* ───────── 올해 공채 흐름: 기업별 간트 도면 ───────── */
  function timelineHtml() {
    return `<section class="dwg" aria-labelledby="tlTitle">
      <div class="dwg-head">
        <div><h2 id="tlTitle"><span id="tlYearLabel">${state.tlYear}</span>년 공채 흐름</h2><p>기업별 서류 접수 기간이에요. 막대를 누르면 공고가 열려요.</p></div>
        <div class="dwg-key"><span><i class="k k-open"></i>접수중</span><span><i class="k k-soon"></i>예정</span><span><i class="k k-closed"></i>마감</span><span><i class="k k-mine"></i>내 기록</span></div>
      </div>
      <div class="yr-tabs" role="tablist" aria-label="연도">${YEARS.slice().reverse().map(y => `<button type="button" role="tab" data-y="${y}" aria-selected="${y === state.tlYear}">${y}</button>`).join("")}<a class="link yr-more" href="#/trend">최근 5년간 추세 보기</a></div>
      <div class="gantt-scroll" id="tlScroll"><div class="gantt${state.animated ? "" : " animate"}" id="tl"></div></div>
    </section>`;
  }
  function drawTimeline() {
    const host = $("#tl"); if (!host) return;
    const y = state.tlYear, y0 = new Date(y, 0, 1), days = diffDays(new Date(y + 1, 0, 1), y0);
    $("#tlYearLabel").textContent = y;
    document.querySelectorAll(".yr-tabs [data-y]").forEach(b => b.setAttribute("aria-selected", String(+b.dataset.y === y)));
    const pct = s => Math.min(Math.max(diffDays(pd(s), y0), 0), days) / days * 100;
    const list = scoped(y);
    // 기업별로 묶고, 첫 접수일 순으로 정렬
    const byCo = new Map();
    list.forEach(x => { if (!byCo.has(x.company)) byCo.set(x.company, []); byCo.get(x.company).push(x); });
    const cos = [...byCo.entries()].map(([co, xs]) => {
      xs.sort((a, b) => (a.start || a.end).localeCompare(b.start || b.end));
      // 같은 기업 안에서 기간이 겹치면 아래 칸으로
      const lanes = [];
      xs.forEach(x => { const a = x.start || x.end; let i = lanes.findIndex(e => e < a); if (i < 0) { lanes.push(""); i = lanes.length - 1; } lanes[i] = x.end; x._lane = i; });
      const live = xs.some(x => status(x) !== "closed");
      return { co, xs, lanes: lanes.length, live, robot: xs.some(x => x.group === "robot"), first: xs[0].start || xs[0].end };
    }).sort((a, b) => (b.live - a.live) || a.first.localeCompare(b.first));

    let head = "", grid = "";
    for (let m = 0; m < 12; m++) {
      const l = diffDays(new Date(y, m, 1), y0) / days * 100, w = diffDays(new Date(y, m + 1, 1), new Date(y, m, 1)) / days * 100;
      head += `<span class="g-month${m === TODAY.getMonth() ? " now" : ""}" style="left:${l}%;width:${w}%">${m + 1}월</span>`;
      grid += `<span class="${m % 3 === 0 ? "q" : ""}" style="left:${l}%"></span>`;
    }
    const todayPct = diffDays(TODAY, y0) / days * 100;
    const rows = cos.map((c, ri) => `<div class="g-row${c.live ? " live" : ""}" style="--lanes:${c.lanes}">
        <div class="g-name">${avatar(c.co, "sm")}<span>${esc(c.co)}</span>${c.robot ? `<i class="g-robot" title="로봇기업">로봇</i>` : ""}</div>
        <div class="g-track">${c.xs.map(x => {
          const s = status(x), a = pct(x.start || x.end), b = pct(nextDayStr(x.end));
          return `<button type="button" class="g-bar ${s}${hasRec(x.id) ? " mine" : ""}" data-open="${esc(x.id)}" style="left:${a}%;width:max(${b - a}%,6px);--l:${x._lane};--d:${ri * 28}ms" title="${esc(x.title)} · ${range(x)}" aria-label="${esc(x.company)} ${esc(x.title)}, ${range(x)}, ${STATUS[s][0]}"></button>`;
        }).join("")}</div>
      </div>`).join("");
    host.innerHTML = `<div class="g-head"><div class="g-name g-corner">기업</div><div class="g-track">${head}</div></div>
      <div class="g-body"><div class="g-grid">${grid}</div>${rows || `<p class="side-empty">올해 등록된 공고가 없습니다.</p>`}
        ${TODAY >= y0 && TODAY.getFullYear() === y ? `<div class="g-today" style="--x:${todayPct.toFixed(3)}"><b>오늘 ${TODAY.getMonth() + 1}.${TODAY.getDate()}</b></div>` : ""}</div>`;
    state.animated = true;
    const sc = $("#tlScroll");
    if (sc.scrollWidth > sc.clientWidth + 4) sc.scrollLeft = y === TODAY.getFullYear() ? sc.scrollWidth * todayPct / 100 - sc.clientWidth * 0.75 : 0;
  }
  function bindYearTabs() {
    main.querySelectorAll(".yr-tabs [data-y]").forEach(b => b.onclick = () => {
      state.tlYear = +b.dataset.y;
      const tl = $("#tl"); tl.classList.remove("animate"); void tl.offsetWidth; tl.classList.add("animate");
      drawTimeline();
    });
  }
  const nextDayStr = s => ymd(new Date(pd(s).getTime() + 864e5));

  /* ───────── 페이지 ───────── */
  const pages = {};

  pages.home = {
    title: "",
    render() {
      const all = scoped(TODAY.getFullYear());
      const open = all.filter(x => status(x) === "open").sort(byDeadline);
      const soon = all.filter(x => status(x) === "soon").sort((a, b) => a.start.localeCompare(b.start));
      const closed = all.filter(x => status(x) === "closed").sort((a, b) => b.end.localeCompare(a.end));
      const mineN = Object.values(Store.all()).filter(r => r.status).length;
      const t = TODAY;
      return `
      <section class="hero">
        <div class="hero-copy">
          <p class="date">${t.getMonth() + 1}월 ${t.getDate()}일 ${DOW[t.getDay()]}요일</p>
          <h1>놓치면 안 되는 공채,<br>한 화면에서 챙기세요</h1>
          <p class="sum">로봇기업과 대기업의 ${t.getFullYear()}년 신입·경력 공채를 모았어요. 마감일이 가까운 순서로 보여주고, 공고 원문까지 바로 연결해요.</p>
          <div class="stat-row">
            <a href="#/list" data-kpi="open" class="stat"><b class="num">${open.length}</b><span>접수중</span></a>
            <a href="#/list" data-kpi="soon" class="stat"><b class="num">${soon.length}</b><span>예정</span></a>
            <a href="#/list" data-kpi="closed" class="stat"><b class="num">${closed.length}</b><span>마감</span></a>
            <a href="#/my" class="stat"><b class="num">${mineN}</b><span>내 기록</span></a>
          </div>
        </div>
        ${featureCard(open, soon)}
      </section>
      ${timelineHtml()}
      <section class="block">
        <div class="block-head"><h2>지금 지원할 수 있어요<span class="count num">${open.length}</span></h2><a class="link" href="#/list">전체 공고</a></div>
        ${rowsOr(open, `<b>지금 접수 중인 공고가 없어요.</b><span>하반기 공채가 끝난 시기라면 수시로 뽑는 로봇기업 채용 페이지를 확인해 보세요.</span><a class="btn btn-sm" href="#/always">상시채용 기업 보기</a>`)}
      </section>
      ${soon.length ? `<section class="block"><div class="block-head"><h2>곧 시작해요<span class="count num">${soon.length}</span></h2></div>${rowsOr(soon, "")}</section>` : ""}
      <section class="block">
        <div class="block-head"><h2>최근 마감됐어요</h2><a class="link" href="#/list" data-kpi="closed">모두 보기</a></div>
        ${rowsOr(closed.slice(0, 5), "마감된 공고가 없어요.")}
      </section>`;
    },
    mount() {
      main.querySelectorAll("[data-kpi]").forEach(a => a.addEventListener("click", () => { state.f.status = a.dataset.kpi; }));
      bindYearTabs();
      drawTimeline();
    },
    refresh() { drawTimeline(); }
  };

  /* 히어로 오른쪽: 가장 급한 공고 한 건 */
  function featureCard(open, soon) {
    const x = open[0] || soon[0];
    if (!x) return `<aside class="feature quiet"><p class="f-eyebrow">지금은 쉬어가는 시기</p><h2>접수 중인 공채가 없어요</h2>
      <p class="f-sub">새 공고는 매주 월요일에 확인해서 올려요. 그 사이에는 수시로 뽑는 기업을 살펴보세요.</p>
      <div class="f-act"><a class="btn btn-white" href="#/always">상시채용 기업 보기</a></div></aside>`;
    const s = status(x), r = remain(x);
    const a = pd(x.start || x.end), e = pd(nextDayStr(x.end));
    const prog = s === "soon" ? 0 : Math.min(100, Math.max(4, diffDays(TODAY, a) / Math.max(1, diffDays(e, a)) * 100));
    const big = s === "soon" ? `${r.big}일 후 시작` : r.big === "오늘" ? "오늘 마감" : `${r.big}일 남음`;
    return `<aside class="feature" aria-label="가장 급한 공고">
      <div class="f-top">${avatar(x.company, "lg")}<span class="f-eyebrow">${s === "soon" ? "곧 열리는 공고" : "가장 먼저 마감돼요"}</span></div>
      <div><h2>${esc(x.company)}</h2><p class="f-sub">${esc(x.title)}</p></div>
      <p class="f-big num">${big}</p>
      <div class="f-prog"><div class="f-bar"><i style="width:${prog}%"></i></div>
        <div class="f-dates num"><span>${md(x.start)} 시작</span><span>${md(x.end)} 마감</span></div></div>
      <div class="f-act">
        <a class="btn btn-white" href="${esc(x.url)}" target="_blank" rel="noopener">지원하러 가기 ${ICON.ext}</a>
        <button class="btn btn-glass" type="button" data-open="${esc(x.id)}">자세히</button>
      </div>
    </aside>`;
  }

  pages.calendar = {
    title: "달력",
    render() {
      return `
      <div class="page-head"><div><h1>공채 달력</h1><p>파란 선은 접수 시작, 빨간 선은 서류 마감입니다. 날짜를 누르면 그날 걸린 공고가 옆에 정리돼요.</p></div></div>
      ${filterBar({ status: false })}
      <div class="cal-layout">
        <section class="cal-sheet" aria-label="월 달력">
          <div class="cal-bar"><h2 id="monthLabel"></h2>
            <div class="cal-nav"><button class="btn btn-sm" id="todayM" type="button">오늘</button>
              <button class="icon-btn" id="prevM" type="button" aria-label="이전 달">${ICON.left}</button>
              <button class="icon-btn" id="nextM" type="button" aria-label="다음 달">${ICON.right}</button></div></div>
          <div class="cal" id="cal"></div>
          <div class="cal-key"><span><i style="background:var(--blue)"></i>접수 시작</span><span><i style="background:var(--hot)"></i>서류 마감</span><span><i style="background:var(--blue-tint);width:12px;border-radius:3px"></i>내가 기록한 공고</span></div>
        </section>
        <aside class="side" id="dayPanel" aria-live="polite"></aside>
      </div>`;
    },
    mount() {
      const redraw = () => this.refresh();
      bindFilters(redraw);
      const go = n => { state.month = new Date(state.month.getFullYear(), state.month.getMonth() + n, 1); redraw(); };
      $("#prevM").onclick = () => go(-1);
      $("#nextM").onclick = () => go(1);
      $("#todayM").onclick = () => { state.month = new Date(TODAY.getFullYear(), TODAY.getMonth(), 1); state.sel = ymd(TODAY); redraw(); };
      $("#cal").addEventListener("click", e => {
        const b = e.target.closest(".day"); if (!b) return;
        state.sel = b.dataset.k; redraw();
        if (matchMedia("(max-width:980px)").matches) $("#dayPanel").scrollIntoView({ behavior: "smooth", block: "start" });
      });
      redraw();
    },
    refresh() {
      const rows = filtered({ ignoreStatus: true, ignoreYear: true });
      const y = state.month.getFullYear(), m = state.month.getMonth();
      $("#monthLabel").textContent = `${y}년 ${m + 1}월`;
      const first = new Date(y, m, 1), start = new Date(y, m, 1 - first.getDay());
      const ev = {};
      rows.forEach(x => { if (x.start) (ev[x.start] ||= []).push(["start", x]); (ev[x.end] ||= []).push(["end", x]); });
      let h = [...DOW].map((d, i) => `<div class="dow${i === 0 ? " sun" : i === 6 ? " sat" : ""}">${d}</div>`).join("");
      const weeks = Math.ceil((first.getDay() + new Date(y, m + 1, 0).getDate()) / 7);
      for (let i = 0; i < weeks * 7; i++) {
        const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i), k = ymd(d);
        const list = (ev[k] || []).slice().sort((a, b) => (a[0] === "end" ? 0 : 1) - (b[0] === "end" ? 0 : 1));
        const shown = list.slice(0, 3).map(([t, x]) => `<span class="ev ${t}${hasRec(x.id) ? " mine" : ""}">${esc(x.company)}</span>`).join("");
        const more = list.length > 3 ? `<span class="ev more">외 ${list.length - 3}건</span>` : "";
        const cls = ["day", d.getMonth() !== m && "out", d.getDay() === 0 && "sun", d.getDay() === 6 && "sat", k === ymd(TODAY) && "today", k === state.sel && "sel"].filter(Boolean).join(" ");
        h += `<button type="button" class="${cls}" data-k="${k}" aria-label="${d.getMonth() + 1}월 ${d.getDate()}일, 공고 ${list.length}건"><span class="dnum">${d.getDate()}</span>${shown}${more}</button>`;
      }
      $("#cal").innerHTML = h;
      const sk = state.sel, sd = pd(sk), items = [];
      rows.forEach(x => {
        if (x.end === sk) items.push(["end", "서류 마감", x, 0]);
        else if (x.start === sk) items.push(["start", "접수 시작", x, 1]);
        else if (x.start && pd(x.start) < sd && pd(x.end) > sd) items.push(["ing", `접수 중 · ${md(x.end)} 마감`, x, 2]);
      });
      items.sort((a, b) => a[3] - b[3]);
      $("#dayPanel").innerHTML = `<div class="side-head"><h3>${full(sk)}</h3><p>${items.length ? `공고 ${items.length}건` : "걸린 공고 없음"}</p></div>` +
        (items.length ? `<div class="side-list">${items.map(([c, l, x]) => `<button type="button" class="s-item" data-open="${esc(x.id)}"><span class="s-kind ${c}">${l}</span><span class="co">${esc(x.company)}</span><span class="ti">${esc(x.title)}</span></button>`).join("")}</div>`
          : `<p class="side-empty">다른 날짜를 누르거나 이전·다음 달로 넘겨 보세요.</p>`);
    }
  };

  const SORTS = {
    deadline: ["마감 임박순", (a, b) => { const o = { open: 0, soon: 1, closed: 2 }; const sa = status(a), sb = status(b); return o[sa] - o[sb] || (sa === "closed" ? b.end.localeCompare(a.end) : a.end.localeCompare(b.end)); }],
    start: ["접수 시작순", (a, b) => (a.start || a.end).localeCompare(b.start || b.end)],
    company: ["기업 이름순", (a, b) => a.company.localeCompare(b.company, "ko") || a.end.localeCompare(b.end)]
  };
  pages.list = {
    title: "전체 공고",
    render() {
      return `
      <div class="page-head"><div><h1>전체 공고</h1><p>${scopeLine()} 공고를 누르면 자세한 내용과 지원 기록 창이 열려요.</p></div></div>
      ${filterBar({ status: true, year: true })}
      <div class="stack">
        <div class="result-line"><span id="count"></span>
          <label for="sortSel">정렬 <select id="sortSel">${Object.entries(SORTS).map(([k, [t]]) => `<option value="${k}"${k === state.sort ? " selected" : ""}>${t}</option>`).join("")}</select></label></div>
        <div id="listOut"></div>
      </div>`;
    },
    mount() {
      bindFilters(() => this.refresh());
      $("#sortSel").addEventListener("change", e => { state.sort = e.target.value; Prefs.set("sort", state.sort); this.refresh(); });
      this.refresh();
    },
    refresh() {
      const rows = filtered().sort(SORTS[state.sort][1]);
      $("#count").innerHTML = `공고 <b class="num">${rows.length}</b>건`;
      const out = $("#listOut");
      if (!rows.length) { out.innerHTML = `<div class="empty"><b>조건에 맞는 공고가 없어요.</b><span>필터를 하나씩 풀거나, 위쪽에서 ‘전체’ 보기로 바꿔 보세요.</span></div>`; return; }
      if (matchMedia("(max-width:760px)").matches) { out.innerHTML = `<div class="rows">${rows.map(row).join("")}</div>`; return; }
      out.innerHTML = `<div class="table-sheet"><table>
        <thead><tr><th>남은 기간</th><th>기업과 공고</th><th>서류 접수</th><th>주요 직무</th><th>상태</th><th><span class="sr">공고 원문</span></th></tr></thead>
        <tbody>${rows.map(x => { const r = remain(x), s = status(x); return `<tr class="${s}" data-open="${esc(x.id)}">
          <td>${ddChip(x)}</td>
          <td><div class="t-co">${avatar(x.company)}<div><span class="co">${esc(x.company)}</span> ${extraTags(x)}${mineTag(x)}<span class="ti">${esc(x.title)}</span></div></div></td>
          <td class="date">${range(x)}</td>
          <td class="jobs">${esc(x.jobs)}</td>
          <td>${statusTag(x)}</td>
          <td><a class="btn btn-sm" href="${esc(x.url)}" target="_blank" rel="noopener" data-stop>원문 ${ICON.ext}</a></td>
        </tr>`; }).join("")}</tbody></table></div>`;
    }
  };


  /* ───────── 5년 추세 ───────── */
  pages.trend = {
    title: "최근 5년간 추세",
    render() {
      const all = scoped().filter(x => x.start && RECENT.includes(yearOf(x)));
      const years = [...new Set(all.map(yearOf))].sort();
      const y0 = RECENT[RECENT.length - 1], y1 = RECENT[0];
      // 기업별 집계
      const by = new Map();
      all.forEach(x => { if (!by.has(x.company)) by.set(x.company, []); by.get(x.company).push(x); });
      const md2 = s => `${+s.slice(5, 7)}.${+s.slice(8, 10)}`;
      const rows = [...by.entries()].map(([co, xs]) => {
        const ys = new Set(xs.map(yearOf));
        const months = Array.from({ length: 12 }, () => new Set());
        xs.forEach(x => { const a = pd(x.start), b = pd(x.end); for (let d = new Date(a.getFullYear(), a.getMonth(), 1); d <= b; d.setMonth(d.getMonth() + 1)) months[d.getMonth()].add(yearOf(x)); });
        const half = h => xs.filter(x => { const m = +x.start.slice(5, 7); return h === 1 ? m <= 5 : m >= 8; }).map(x => x.start.slice(5));
        const rng = arr => { if (!arr.length) return "—"; arr.sort(); const a = arr[0], b = arr[arr.length - 1]; return a === b ? md2("0000-" + a) : `${md2("0000-" + a)}–${md2("0000-" + b)}`; };
        return { co, xs, n: ys.size, months, h1: rng(half(1)), h2: rng(half(2)), first: Math.min(...xs.map(x => +x.start.slice(5, 7))) };
      }).filter(r => r.n >= 2).sort((a, b) => b.n - a.n || a.co.localeCompare(b.co, "ko"));
      // 전체 요약
      const startMonths = Array(12).fill(0); all.forEach(x => startMonths[+x.start.slice(5, 7) - 1]++);
      const top = arr => arr.indexOf(Math.max(...arr));
      const h1m = top(startMonths.slice(0, 6)) + 1, h2m = top(startMonths.slice(6)) + 7;
      const avgLen = Math.round(all.reduce((t, x) => t + diffDays(pd(x.end), pd(x.start)) + 1, 0) / Math.max(1, all.length));
      const maxN = Math.max(1, ...rows.flatMap(r => r.months.map(m => m.size)));
      const lv = n => n === 0 ? 0 : Math.max(1, Math.ceil(n / maxN * 5));
      return `
      <div class="page-head"><div><h1>최근 5년간 추세</h1><p>올해를 포함한 최근 5년(${y0}~${y1}년) 서류 접수 기간을 기업별로 겹쳐 봤어요. 해가 바뀌면 기간도 자동으로 바뀌어요. 색이 진할수록 그 달에 공채를 연 해가 많다는 뜻이에요.</p></div></div>
      <div class="stat-row trend-stats">
        <div class="stat"><b class="num">${h1m}월</b><span>상반기 접수가 가장 많이 시작된 달</span></div>
        <div class="stat"><b class="num">${h2m}월</b><span>하반기 접수가 가장 많이 시작된 달</span></div>
        <div class="stat"><b class="num">${avgLen}일</b><span>서류 접수 기간 평균</span></div>
        <div class="stat"><b class="num">${all.length}건</b><span>${y0}~${y1}년 기록된 공채</span></div>
      </div>
      <section class="block">
        <div class="block-head"><h2>기업별 월간 패턴</h2><span class="hm-key">적음 <i class="lv1"></i><i class="lv2"></i><i class="lv3"></i><i class="lv4"></i><i class="lv5"></i> 많음</span></div>
        <div class="table-sheet hm-sheet"><table class="hm">
          <thead><tr><th class="hm-co">기업</th>${Array.from({ length: 12 }, (_, i) => `<th class="hm-m${i + 1 === TODAY.getMonth() + 1 ? " now" : ""}">${i + 1}월</th>`).join("")}<th>보통 상반기 시작</th><th>보통 하반기 시작</th><th class="hm-n">기록</th></tr></thead>
          <tbody>${rows.map(r => `<tr data-co="${esc(r.co)}">
            <td class="hm-co"><div class="t-co">${avatar(r.co, "sm")}<span class="co">${esc(r.co)}</span></div></td>
            ${r.months.map((set, i) => `<td class="hm-c"><span class="lv${lv(set.size)}" title="${esc(r.co)} ${i + 1}월: ${set.size ? [...set].sort().join(", ") + "년" : "없음"}">${set.size || ""}</span></td>`).join("")}
            <td class="hm-r num">${r.h1}</td><td class="hm-r num">${r.h2}</td><td class="hm-n num">${r.n}년</td>
          </tr>`).join("")}</tbody></table></div>
        <p class="hm-note">칸 안의 숫자는 그 달에 서류 접수를 연 해의 수예요. ‘보통 시작’은 지난 기록의 접수 시작일 범위이고, 예측이 아니에요. 기업 이름을 누르면 그 기업의 연도별 공고가 아래에 나와요.</p>
      </section>
      <section class="block" id="coHistory"></section>`;
    },
    mount() {
      const show = co => {
        const xs = scoped().filter(x => x.company === co && RECENT.includes(yearOf(x))).sort((a, b) => b.end.localeCompare(a.end));
        $("#coHistory").innerHTML = `<div class="block-head"><h2>${esc(co)} 연도별 공채<span class="count num">${xs.length}</span></h2></div>${rowsOr(xs, "")}`;
        main.querySelectorAll(".hm tbody tr").forEach(t => t.classList.toggle("sel", t.dataset.co === co));
      };
      main.querySelectorAll(".hm tbody tr").forEach(t => t.onclick = () => { show(t.dataset.co); $("#coHistory").scrollIntoView({ behavior: "smooth", block: "start" }); });
      const first = main.querySelector(".hm tbody tr"); if (first) show(first.dataset.co);
    }
  };

  pages.always = {
    title: "상시채용",
    render() {
      return `
      <div class="page-head"><div><h1>상시채용 기업</h1><p>정기 공채 없이 직무별로 수시로 뽑는 곳이에요. 공고가 짧게 열렸다 닫히니 자주 들어가 보세요.</p></div></div>
      <div class="always">${ALWAYS.map(a => `<div class="a-row"><div class="a-co">${avatar(a.company)}<h3>${esc(a.company)}</h3></div><p>${esc(a.desc)}</p><a class="btn btn-sm" href="${esc(a.url)}" target="_blank" rel="noopener">채용 페이지 ${ICON.ext}</a></div>`).join("")}</div>`;
    }
  };

  const LANES = [["interest", "관심"], ["applied", "지원완료"], ["pass", "서류합격"], ["result", "결과"]];
  pages.my = {
    title: "내 지원현황",
    render() {
      const items = Object.entries(Store.all()).filter(([id, r]) => r.status && BYID[id]).map(([id, r]) => ({ x: BYID[id], r }));
      const lane = k => items.filter(({ r }) => k === "result" ? (r.status === "final" || r.status === "fail") : r.status === k).sort((a, b) => a.x.end.localeCompare(b.x.end));
      const user = Store.user && Store.user();
      const note = Store.kind === "cloud" && user ? `<span>${esc(user.email)} 계정에 저장하고 있어요. 어느 기기에서 로그인해도 같은 기록이 보여요.</span>`
        : Store.kind === "cloud" ? `<span>지금은 이 브라우저에만 저장돼요. 로그인하면 기록이 계정으로 옮겨지고 다른 기기에서도 보여요.</span><button class="btn btn-sm btn-primary" type="button" data-login>로그인</button>`
        : `<span>지원 기록은 이 브라우저에만 저장돼요. 다른 기기나 시크릿 창에서는 보이지 않아요.</span>`;
      return `
      <div class="page-head"><div><h1>내 지원현황</h1><p>공고 창에서 상태를 고르면 여기로 모여요.</p></div>
        ${items.length ? `<button class="btn" type="button" id="icsAll">${ICON.cal} 진행 중 마감일을 캘린더로 받기</button>` : ""}</div>
      <div class="note">${note}</div>
      ${items.length ? `<div class="board">${LANES.map(([k, t]) => { const l = lane(k); return `<section class="lane" data-k="${k}"><div class="lane-h"><h3>${t}</h3><b>${l.length}</b></div>${l.map(({ x, r }) => `<button type="button" class="tile" data-open="${esc(x.id)}"><span class="tile-top">${avatar(x.company, "sm")}<span class="co">${esc(x.company)}</span></span><small>${esc(x.title)}</small><small class="num">${k === "result" ? APPLY_LABEL[r.status] + ", " : ""}마감 ${full(x.end)}${r.appliedAt ? `, ${md(r.appliedAt)} 지원` : ""}</small>${r.memo ? `<span class="memo">${esc(r.memo)}</span>` : ""}</button>`).join("") || `<p class="lane-empty">아직 없어요</p>`}</section>`; }).join("")}</div>
        <div class="confirm"><button class="btn btn-quiet btn-sm" type="button" id="clearAsk">기록 모두 지우기</button><span id="clearConfirm" hidden>정말 모두 지울까요? <button class="btn btn-sm" type="button" id="clearYes">모두 지우기</button> <button class="btn btn-quiet btn-sm" type="button" id="clearNo">취소</button></span></div>`
        : `<div class="empty"><b>아직 기록한 공고가 없어요.</b><span>공고를 누르고 ‘관심’이나 ‘지원완료’를 고르면 여기에 정리돼요.</span><a class="btn btn-sm" href="#/list">전체 공고 보기</a></div>`}`;
    },
    mount() {
      const ia = $("#icsAll"); if (ia) ia.onclick = () => {
        const xs = Object.entries(Store.all()).filter(([id, r]) => r.status && BYID[id] && status(BYID[id]) !== "closed").map(([id]) => BYID[id]);
        if (!xs.length) { toast("아직 마감되지 않은 기록 공고가 없어요"); return; }
        downloadIcs(xs, "my-deadlines.ics"); toast(`마감일 ${xs.length}건을 캘린더 파일로 저장했어요`);
      };
      const ask = $("#clearAsk"); if (ask) {
        ask.onclick = () => { $("#clearConfirm").hidden = false; ask.hidden = true; };
        $("#clearNo").onclick = () => { $("#clearConfirm").hidden = true; ask.hidden = false; };
        $("#clearYes").onclick = async () => { for (const id of Object.keys(Store.all())) await Store.remove(id); toast("기록을 모두 지웠어요"); route(true); };
      }
    }
  };

  pages.about = {
    title: "사이트 안내",
    render() {
      const srcs = [...new Set(DATA.map(x => x.source).filter(Boolean))];
      const host = u => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch (e) { return u; } };
      let dec = u => { try { return decodeURI(u); } catch (e) { return u; } };
      return `
      <div class="page-head"><div><h1>사이트 안내</h1><p>데이터 기준일 ${esc(META.updated || "-")}, 공고 ${DATA.length}건</p></div></div>
      <div class="prose">
        <h2>무엇을 보여주나요</h2>
        <ul>
          <li>${TODAY.getFullYear()}년 로봇기업과 대기업의 신입·경력 공채 서류 접수 기간, 그리고 공고 원문 링크</li>
          <li><b>기계 직무</b>는 설계·연구개발·생산기술·품질·설비 직무를 뽑는 공고만, <b>전체</b>는 모든 공채를 보여줍니다.</li>
          <li>접수중·예정·마감과 남은 기간은 접속한 날짜로 자동 계산됩니다.</li>
          <li>새 공고는 매주 월요일 아침에 확인해 추가합니다.</li>
        </ul>
        <h2>지원 기록은 어디에 저장되나요</h2>
        <p>${Store.kind === "cloud" ? "로그인하지 않으면 이 브라우저에, 로그인하면 계정에 저장됩니다. 다른 사람은 내 기록을 볼 수 없습니다." : "이 브라우저에만 저장됩니다. 브라우저 데이터를 지우면 함께 지워집니다."}</p>
        <h2>지원 전에 꼭 확인하세요</h2>
        <p>날짜는 공고와 채용 페이지에서 확인한 값이지만 기업 사정으로 바뀔 수 있습니다. 마감 시각과 자격 요건은 반드시 공고 원문에서 다시 확인하세요.</p>
        <h2>출처</h2>
        <ul>${srcs.map(u => `<li><a href="${esc(u)}" target="_blank" rel="noopener">${esc(host(u))}</a><br><span class="src">${esc(dec(u).slice(0, 96))}</span></li>`).join("")}</ul>
      </div>`;
    }
  };

  /* ───────── 상세 시트 ───────── */
  const detail = $("#detail");
  let memoTimer = null;
  function openDetail(id) {
    const x = BYID[id]; if (!x) { toast("공고를 찾을 수 없어요"); return; }
    const r = Store.get(id) || {}, rm = remain(x), s = status(x);
    const where = Store.kind === "cloud" && Store.user() ? "계정에 저장" : "이 브라우저에 저장";
    detail.dataset.id = id;
    detail.innerHTML = `<div class="sheet">
      <div class="sheet-top"><div class="tags" style="justify-content:flex-start">${statusTag(x)}${extraTags(x)}</div>
        <button class="close-x" type="button" data-close aria-label="닫기">${ICON.x}</button></div>
      <div class="sheet-body">
        <div class="sheet-title">${avatar(x.company, "lg")}<div><h2 id="dTitle">${esc(x.company)}</h2><p class="ti">${esc(x.title)}</p></div></div>
        <div class="big-dd ${rm.cls.split(" ").pop()}"><b>${rm.big}</b><span>${s === "closed" ? "된 공고예요" : rm.small}</span></div>
        <dl class="facts">
          <dt>접수 시작</dt><dd>${full(x.start)}</dd>
          <dt>서류 마감</dt><dd>${full(x.end)}</dd>
          <dt>모집 직무</dt><dd>${esc(x.jobs)}</dd>
          <dt>대상</dt><dd>${x.exp ? "신입, 경력" : "신입"}</dd>
          ${x.source && x.source !== x.url ? `<dt>날짜 출처</dt><dd><a class="link" href="${esc(x.source)}" target="_blank" rel="noopener">확인한 페이지 보기</a></dd>` : ""}
        </dl>
        <div class="actions">
          <a class="btn btn-primary" href="${esc(x.url)}" target="_blank" rel="noopener">공고 원문 열기 ${ICON.ext}</a>
          ${s !== "closed" ? `<div class="pair"><a class="btn" href="${gcalUrl(x)}" target="_blank" rel="noopener">구글 캘린더에 추가</a><button class="btn" type="button" id="icsOne">${ICON.cal} 캘린더 파일</button></div>` : ""}
        </div>
        <div class="track">
          <h3>내 지원 기록 <small>${where}</small></h3>
          <div class="status-pick" role="group" aria-label="지원 상태">${APPLY.map(([k, t]) => `<button type="button" data-st="${k}" aria-pressed="${r.status === k}">${t}</button>`).join("")}<button type="button" data-st="" aria-pressed="false">기록 지우기</button></div>
          <label class="field" for="tDate">지원한 날<input type="date" id="tDate" value="${esc(r.appliedAt || "")}"></label>
          <label class="field" for="tMemo">메모<textarea id="tMemo" placeholder="지원 직무, 자소서 문항, 인적성 일정 등을 적어 두세요">${esc(r.memo || "")}</textarea></label>
        </div>
      </div></div>`;
    const save = patch => Store.set(id, patch);
    detail.querySelectorAll("[data-st]").forEach(b => b.onclick = async () => {
      const v = b.dataset.st;
      if (!v) { await Store.remove(id); detail.querySelectorAll("[data-st]").forEach(o => o.setAttribute("aria-pressed", "false")); $("#tDate", detail).value = ""; $("#tMemo", detail).value = ""; toast("기록을 지웠어요"); return; }
      const patch = { status: v };
      if (v === "applied" && !$("#tDate", detail).value) { patch.appliedAt = ymd(TODAY); $("#tDate", detail).value = patch.appliedAt; }
      await save(patch);
      detail.querySelectorAll("[data-st]").forEach(o => o.setAttribute("aria-pressed", String(o.dataset.st === v)));
      toast(`‘${APPLY_LABEL[v]}’로 저장했어요`);
    });
    $("#tDate", detail).onchange = e => save({ appliedAt: e.target.value || null });
    $("#tMemo", detail).oninput = e => { clearTimeout(memoTimer); const v = e.target.value; memoTimer = setTimeout(() => { memoTimer = null; save({ memo: v }); }, 500); };
    const io = $("#icsOne", detail); if (io) io.onclick = () => { downloadIcs([x], `${x.id}.ics`); toast("캘린더 파일을 저장했어요"); };
    detail.showModal();
    $(".close-x", detail).focus();
  }
  detail.addEventListener("click", e => { if (e.target === detail || e.target.closest("[data-close]")) detail.close(); });
  detail.addEventListener("close", () => {
    const m = $("#tMemo", detail);
    if (m && memoTimer) { clearTimeout(memoTimer); memoTimer = null; Store.set(detail.dataset.id, { memo: m.value }); }
    if (location.hash.startsWith("#/r/")) history.replaceState(null, "", "#/list");
    route(true);
  });

  /* ───────── 캘린더 내보내기 ───────── */
  const icsEsc = s => String(s).replace(/\\/g, "\\\\").replace(/[;,]/g, m => "\\" + m).replace(/\n/g, "\\n");
  const compact = s => s.replace(/-/g, "");
  function downloadIcs(list, filename) {
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
    const ev = x => ["BEGIN:VEVENT", `UID:${x.id}-deadline@gongchae-calendar`, `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${compact(x.end)}`, `DTEND;VALUE=DATE:${compact(nextDayStr(x.end))}`,
      `SUMMARY:${icsEsc(`[서류 마감] ${x.company} ${x.title}`)}`, `DESCRIPTION:${icsEsc(`${x.jobs}\n${x.url}`)}`, `URL:${x.url}`,
      "BEGIN:VALARM", "TRIGGER:-P2D", "ACTION:DISPLAY", `DESCRIPTION:${icsEsc(x.company + " 서류 마감 2일 전")}`, "END:VALARM", "END:VEVENT"].join("\r\n");
    const body = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//공채 캘린더//KO", "CALSCALE:GREGORIAN", ...list.map(ev), "END:VCALENDAR"].join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([body], { type: "text/calendar;charset=utf-8" }));
    a.download = filename; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  const gcalUrl = x => "https://calendar.google.com/calendar/render?action=TEMPLATE" +
    `&text=${encodeURIComponent(`[서류 마감] ${x.company} ${x.title}`)}` +
    `&dates=${compact(x.end)}/${compact(nextDayStr(x.end))}` +
    `&details=${encodeURIComponent(`${x.jobs}\n${x.url}`)}`;

  /* ───────── 라우터 ───────── */
  let current = null;
  function route(keepScroll) {
    TODAY = startOfDay(new Date());
    const parts = (location.hash.replace(/^#\/?/, "") || "").split("/");
    let name = parts[0] || "home", openId = null;
    if (/access_token|error_description|refresh_token/.test(name)) { name = "home"; history.replaceState(null, "", location.pathname + location.search + "#/"); }
    if (name === "r") { openId = decodeURIComponent(parts[1] || ""); name = "list"; }
    if (!pages[name]) name = "home";
    const page = pages[name], changed = current !== page, y = scrollY;
    current = page;
    main.innerHTML = page.render();
    if (page.mount) page.mount();
    document.title = (page.title ? page.title + " – " : "") + "공채 캘린더";
    document.querySelectorAll("[data-route]").forEach(a => { if (a.dataset.route === name) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
    if (changed && !keepScroll) { scrollTo(0, 0); main.focus({ preventScroll: true }); } else scrollTo(0, y);
    if (openId && !detail.open) openDetail(openId);
  }
  window.addEventListener("hashchange", () => route());
  let lastW = innerWidth, rT;
  window.addEventListener("resize", () => { clearTimeout(rT); rT = setTimeout(() => { if (Math.abs(innerWidth - lastW) > 40) { lastW = innerWidth; if (current && current.refresh) current.refresh(); } }, 150); });

  document.addEventListener("click", e => {
    if (e.target.closest("[data-stop]")) return;
    const o = e.target.closest("[data-open]"); if (o) { e.preventDefault(); openDetail(o.dataset.open); return; }
    if (e.target.closest("[data-login]")) openLogin();
  });

  /* ───────── 헤더 ───────── */
  function paintScope() { document.querySelectorAll("#scopeSeg button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.v === state.scope))); }
  $("#scopeSeg").addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; state.scope = b.dataset.v; Prefs.set("scope", state.scope); paintScope(); route(true); });
  const THEMES = ["auto", "light", "dark"];
  function paintTheme() {
    let t = "auto"; try { t = localStorage.getItem("rc.theme") || "auto"; } catch (e) {}
    const btn = $("#themeBtn"); btn.innerHTML = ICON[t === "auto" ? "auto" : t === "dark" ? "moon" : "sun"];
    btn.title = `화면: ${{ auto: "기기 설정 따름", light: "밝게", dark: "어둡게" }[t]} (눌러서 바꾸기)`; btn.setAttribute("aria-label", btn.title);
    if (t === "auto") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
  }
  $("#themeBtn").onclick = () => {
    let t = "auto"; try { t = localStorage.getItem("rc.theme") || "auto"; } catch (e) {}
    const n = THEMES[(THEMES.indexOf(t) + 1) % 3];
    try { if (n === "auto") localStorage.removeItem("rc.theme"); else localStorage.setItem("rc.theme", n); } catch (e) {}
    paintTheme(); toast({ auto: "기기 설정에 맞춰 보여줘요", light: "밝은 화면으로 바꿨어요", dark: "어두운 화면으로 바꿨어요" }[n]);
  };

  /* ───────── 로그인 (공개용) ───────── */
  const loginDlg = $("#loginDlg");
  function paintAuth() {
    const slot = $("#authSlot");
    if (Store.kind !== "cloud") { slot.innerHTML = ""; return; }
    const u = Store.user();
    slot.innerHTML = u ? `<button class="btn btn-sm" type="button" id="logoutBtn" title="${esc(u.email)}">로그아웃</button>`
      : `<button class="btn btn-sm btn-primary" type="button" data-login>로그인</button>`;
    const lo = $("#logoutBtn"); if (lo) lo.onclick = () => Store.signOut();
  }
  function openLogin() {
    if (Store.kind !== "cloud") return;
    loginDlg.innerHTML = `<form class="login" id="loginForm" novalidate>
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px"><h2 id="lgTitle">로그인</h2><button class="close-x" type="button" data-close aria-label="닫기">${ICON.x}</button></div>
      <p>이메일로 로그인 링크를 보내드려요. 비밀번호는 필요 없습니다.</p>
      <label class="field" for="lgEmail">이메일<input type="email" id="lgEmail" required autocomplete="email" placeholder="name@example.com"></label>
      <p id="lgMsg" role="status"></p>
      <button class="btn btn-primary" type="submit" id="lgSubmit">로그인 링크 받기</button>
      <p style="font-size:13px;color:var(--ink-3)">로그인 전에 남긴 기록은 로그인하면 계정으로 옮겨집니다.</p>
    </form>`;
    $("#loginForm").onsubmit = async e => {
      e.preventDefault();
      const email = $("#lgEmail").value.trim(), msg = $("#lgMsg"), btn = $("#lgSubmit");
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { msg.textContent = "이메일 주소 형식을 확인해 주세요."; return; }
      btn.disabled = true; msg.textContent = "보내는 중이에요…";
      const err = await Store.signIn(email);
      btn.disabled = false;
      msg.textContent = err ? `링크를 보내지 못했어요. ${err}` : `${email}로 로그인 링크를 보냈어요. 메일의 링크를 누르면 이 사이트로 돌아와 로그인됩니다.`;
    };
    loginDlg.showModal(); $("#lgEmail").focus();
  }
  loginDlg.addEventListener("click", e => { if (e.target === loginDlg || e.target.closest("[data-close]")) loginDlg.close(); });

  window.addEventListener("rc:merged", e => toast(`브라우저에 있던 기록 ${e.detail}건을 계정으로 옮겼어요`));
  window.addEventListener("rc:error", e => toast(e.detail));

  /* ───────── 시작 ───────── */
  function loadScript(src) {
    return new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => rej(new Error(src)); document.head.appendChild(s); });
  }
  async function boot() {
    $("#ftUpdated").textContent = `데이터 기준일 ${META.updated || "-"}, 공고 ${DATA.length}건`;
    paintScope(); paintTheme();
    if (CFG.mode === "cloud") {
      if (CFG.supabaseUrl && CFG.supabaseAnonKey) {
        try {
          await loadScript("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/dist/umd/supabase.js");
          await loadScript("assets/store-supabase.js");
          Store = window.CloudStore;
          await Store.init(CFG, () => { paintAuth(); if (loginDlg.open) loginDlg.close(); if (detail.open) detail.close(); else route(true); toast(Store.user() ? "로그인했어요" : "로그아웃했어요"); });
        } catch (e) {
          console.error("[공채 캘린더] 계정 저장소를 불러오지 못해 브라우저 저장으로 동작합니다.", e);
          Store = window.LocalStore; toast("로그인 기능을 불러오지 못했어요. 기록은 이 브라우저에 저장됩니다.");
        }
      } else {
        console.info("[공채 캘린더] config.js에 Supabase 정보가 없어 브라우저 저장으로 동작합니다.");
      }
    }
    if (Store.kind === "local") await Store.init();
    paintAuth();
    route();
  }
  boot();
})();
