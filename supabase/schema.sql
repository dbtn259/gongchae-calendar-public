-- 공채 캘린더 공개용: 사용자별 지원 기록 테이블
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run 하세요.

create table if not exists public.applications (
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  recruit_id  text not null,                 -- data/recruits.js 의 id
  status      text check (status in ('interest','applied','pass','final','fail')),
  memo        text check (char_length(memo) <= 4000),
  applied_at  date,
  updated_at  timestamptz not null default now(),
  primary key (user_id, recruit_id)
);

-- 행 단위 보안: 각자 자기 기록만 읽고 쓸 수 있음
alter table public.applications enable row level security;

drop policy if exists "own rows select" on public.applications;
drop policy if exists "own rows insert" on public.applications;
drop policy if exists "own rows update" on public.applications;
drop policy if exists "own rows delete" on public.applications;

create policy "own rows select" on public.applications for select to authenticated using (auth.uid() = user_id);
create policy "own rows insert" on public.applications for insert to authenticated with check (auth.uid() = user_id);
create policy "own rows update" on public.applications for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows delete" on public.applications for delete to authenticated using (auth.uid() = user_id);
