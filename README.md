# 공채 캘린더

최근 5년(올해 포함) 로봇기업·대기업 신입/경력 공채 일정을 달력과 리스트로 보고, 공고 원문으로 바로 이동하고, 내 지원 현황을 관리하는 웹사이트입니다.
누구나 볼 수 있고, 로그인하면 지원 기록이 계정에 저장돼 다른 기기에서도 이어서 볼 수 있습니다.

## 사이트 열기 (GitHub Pages)

1. 저장소 **Settings → Pages**
2. **Source**: `Deploy from a branch`, **Branch**: `main` / `/ (root)` → **Save**
3. 1~2분 뒤 `https://<내아이디>.github.io/gongchae-calendar-public/` 에서 열립니다.

로그인 설정 전에도 사이트는 열리고, 그동안 지원 기록은 브라우저에 저장됩니다.

## 로그인(계정 저장) 켜기 — Supabase 무료

1. https://supabase.com 에서 새 프로젝트 만들기
2. **SQL Editor** 에 `supabase/schema.sql` 내용을 붙여넣고 **Run**
   → 지원 기록 표와 "각자 자기 기록만 읽고 쓰기" 보안 규칙이 만들어집니다.
3. **Authentication → URL Configuration**
   - Site URL: 사이트 주소 (예: `https://<내아이디>.github.io/gongchae-calendar-public/`)
   - Redirect URLs: 같은 주소 추가
4. **Project Settings → API** 에서 `Project URL` 과 `anon public` 키 복사
5. `assets/config.js` 에 붙여넣고 커밋
   ```js
   window.APP_CONFIG = {
     mode: "cloud",
     supabaseUrl: "https://xxxx.supabase.co",
     supabaseAnonKey: "eyJ..."
   };
   ```
6. 사이트 상단 **로그인** → 이메일로 받은 링크를 누르면 로그인됩니다.

- `anon public` 키는 공개돼도 되는 키입니다. 기록 보호는 2번의 보안 규칙이 맡습니다.
- 로그인 전에 남긴 기록은 로그인하는 순간 계정으로 옮겨집니다.
- Supabase 기본 메일 발송은 시간당 횟수 제한이 있습니다. 사용자가 많아지면 Authentication → SMTP 에 메일 서버를 연결하세요.

## 공채 데이터 고치기

데이터는 `data/recruits.js` 한 파일에 있습니다. 항목 형식은 파일 맨 위 설명을 보세요.

```bash
node scripts/validate-data.mjs   # 형식 검사
```

- `id` 는 한 번 정하면 바꾸지 마세요. 지원 기록이 이 값에 연결됩니다.
- 자동 업데이트 절차: `docs/update-routine.md`

## 기능

- 홈: 오늘 기준 접수중·예정·마감 수, 마감 임박 / 곧 시작 / 최근 마감 공고
- 달력: 접수 시작일·마감일 표시, 날짜를 누르면 그날 공고 목록
- 공고 리스트: 구분·상태·대상·내 기록·검색 필터와 정렬, 원문 바로가기
- 상단에서 **기계 직무**(설계·연구개발·생산기술·품질·설비) ↔ **전체** 전환
- 공고 상세: 원문 열기, 구글 캘린더에 마감일 추가, 캘린더 파일 저장, 지원 상태·지원일·메모
- 내 지원현황: 관심 → 지원완료 → 서류합격 → 결과
- 이메일 로그인과 기기 간 동기화, 상시채용 기업 바로가기, 밝은/어두운 화면, 모바일 하단 메뉴
