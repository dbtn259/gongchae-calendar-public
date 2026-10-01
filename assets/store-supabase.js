/* 계정 저장소 (공개용, Supabase)
 * - 로그인 전: LocalStore(브라우저)에 저장
 * - 로그인 후: applications 테이블에 저장, 로그인 전 기록은 계정으로 옮김
 * 테이블·보안 규칙은 supabase/schema.sql 참고.
 */
(function () {
  const L = window.LocalStore;
  let client = null, user = null, cloud = {}, onChange = () => {};
  const emit = (name, detail) => window.dispatchEvent(new CustomEvent(name, { detail }));

  const toRow = (id, r) => ({
    user_id: user.id,
    recruit_id: id,
    status: r.status || null,
    memo: r.memo || null,
    applied_at: r.appliedAt || null,
    updated_at: r.updatedAt || new Date().toISOString()
  });

  async function pull() {
    const { data, error } = await client.from("applications").select("recruit_id,status,memo,applied_at,updated_at");
    if (error) { console.error(error); emit("rc:error", "기록을 불러오지 못했어요"); return; }
    cloud = {};
    data.forEach(r => { cloud[r.recruit_id] = { status: r.status || "", memo: r.memo || "", appliedAt: r.applied_at, updatedAt: r.updated_at }; });
  }

  async function mergeLocal() {
    const rows = [];
    for (const [id, r] of Object.entries(L.all())) {
      const c = cloud[id];
      if (!c || (r.updatedAt || "") > (c.updatedAt || "")) rows.push(toRow(id, r));
    }
    if (!rows.length) return 0;
    const { error } = await client.from("applications").upsert(rows);
    if (error) { console.error(error); emit("rc:error", "브라우저 기록을 계정으로 옮기지 못했어요"); return 0; }
    L.clearAll();
    await pull();
    return rows.length;
  }

  async function setUser(u, notify) {
    user = u; cloud = {};
    if (user) {
      await pull();
      const n = await mergeLocal();
      if (n) emit("rc:merged", n);
    }
    if (notify) onChange();
  }

  window.CloudStore = {
    kind: "cloud",
    async init(cfg, cb) {
      onChange = cb || onChange;
      client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      });
      await L.init();
      const { data } = await client.auth.getSession();
      await setUser((data.session && data.session.user) || null, false);
      client.auth.onAuthStateChange((_event, session) => {
        const u = (session && session.user) || null;
        if ((u && u.id) === (user && user.id)) return;
        // 콜백 안에서 바로 DB를 부르면 인증 잠금과 겹칠 수 있어 다음 틱으로 미룸
        setTimeout(() => setUser(u, true), 0);
      });
    },
    all() { return user ? cloud : L.all(); },
    get(id) { return (user ? cloud : L.all())[id] || null; },
    async set(id, patch) {
      if (!user) return L.set(id, patch);
      const next = { ...(cloud[id] || {}), ...patch, updatedAt: new Date().toISOString() };
      if (!next.status && !next.memo && !next.appliedAt) { await this.remove(id); return null; }
      cloud[id] = next;
      const { error } = await client.from("applications").upsert(toRow(id, next));
      if (error) { console.error(error); emit("rc:error", "저장하지 못했어요. 네트워크를 확인해 주세요"); }
      return next;
    },
    async remove(id) {
      if (!user) return L.remove(id);
      delete cloud[id];
      const { error } = await client.from("applications").delete().eq("recruit_id", id);
      if (error) { console.error(error); emit("rc:error", "삭제하지 못했어요"); }
    },
    user() { return user; },
    async signIn(email) {
      const { error } = await client.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: location.origin + location.pathname }
      });
      return error ? error.message : null;
    },
    async signOut() { await client.auth.signOut(); }
  };
})();
