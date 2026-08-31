# 글로컬 AI 동행 포털

경상국립대학교 글로컬대학30 사업 포털. 두 개의 사업 트랙을 한 사이트에서 서비스합니다.

- **트랙 A — 특강**: 「일과 삶을 바꾸는 생성형 AI 실무과정」 신청·조회·만족도조사·수료증 (`PRD.md` §1~14)
- **트랙 B — 연구모임**: 「2026학년도 2학기 AI 활용 연구모임」 신청·심사·운영·결과보고
  (`PRD.md` §15, 설계 근거는 `docs/연구모임_신청시스템_재구성_전략.md`)

두 트랙은 **같은 Supabase 데이터베이스**를 쓰되 테이블 네임스페이스(`study_` 접두어)로 분리되어 있습니다.
기존 특강 테이블은 트랙 B 도입으로 스키마가 변경되지 않았습니다.

이 저장소는 **완전 정적 사이트(Next.js `output: 'export'`)** 로 빌드되어 **GitHub Pages** 에 배포됩니다.
서버가 필요한 로직(신청내역조회, 수료증 PDF 발급)은 **Supabase Edge Function** 으로 분리되어 있습니다.

## 아키텍처 요약

- 프론트엔드: Next.js(App Router, 정적 export) + Tailwind CSS → GitHub Pages
- 데이터/인증: Supabase(Postgres, Auth, RLS, Storage) — 브라우저에서 anon key로 직접 접근, 접근 통제는 전부 RLS
- 서비스 롤 키로 RLS를 우회해야 하는 공개 작업(성명+연락처 본인확인 기반)만 Supabase Edge Function으로 처리
  - `supabase/functions/lookup` — 성명+연락처가 정확히 일치하는 신청 건만 서버에서 필터링해 반환(§5.3)
  - `supabase/functions/cancel-application` — 본인확인 후 신청 상태를 '취소'로 변경(특강 시작 전·신청완료/대기 건만).
    행 삭제는 여전히 관리자 포털에서만 가능
  - `supabase/functions/issue-certificate` — 본인확인 후 이수 건 수료증 발급(발급번호 채번·서식 전달)
  - `supabase/functions/study-lookup` — 대표자 성명+연락처가 일치하는 연구모임과 그 팀의 계획서·회의록·
    결과보고서·산출물을 한 번에 반환(트랙 B의 모든 탭이 이 응답 하나로 화면을 그린다)
  - `supabase/functions/study-submit` — 트랙 B **공개 쓰기의 유일한 경로**. `kind`(apply/plan/
    meeting-save/meeting-delete/report)로 갈리는 판별 유니온. 연구모임 신청은 "모임 1건 + 참여자
    3~5행 + 계획서 1행"을 한 번에 만들고 접수번호를 되돌려줘야 해서 단일 INSERT로 끝나지 않으므로,
    `study_*` 테이블에는 익명 INSERT 정책을 두지 않고 이 함수로 모았습니다
- 수료증 PDF 발급/재발급(§6.4)은 Edge Function이 아니라 **관리자의 브라우저**에서 직접 생성합니다
  (`src/lib/certificatePdf.ts`, `src/lib/issueCertificate.ts`). `issue_certificate()` RPC 호출과
  Storage 업로드 모두 RLS의 `is_admin()` 체크로 통제되므로 관리자가 아니면 실행되지 않습니다.
  Deno(Supabase Edge Function) 환경에서는 `@pdf-lib/fontkit`이 내부적으로
  `Object.prototype.__proto__` 조작에 의존하는 부분이 있어 Deno의 보안 기본값과 충돌해
  런타임에 실패하는 것을 배포 전 스모크 테스트로 확인했습니다 — 그래서 브라우저 실행으로 우회했습니다.
- 관리자 인증: Supabase Auth 구글 OAuth + `admin_users` allowlist. 서버 미들웨어가 없으므로
  접근 통제는 클라이언트 라우트 가드(`useAdminSession`) + Supabase RLS(`is_admin()`)의 이중 구조입니다.

## 최초 배포 절차

### 1. Supabase 프로젝트 준비
1. [supabase.com](https://supabase.com) 에서 프로젝트 생성
2. `supabase/migrations/` 의 SQL을 **파일명 번호 순서대로** 적용 (`0001` → `0016`)
   (Supabase CLI: `supabase link --project-ref <ref>` 후 `supabase db push`, 또는 대시보드 SQL Editor에서 순서대로 실행)
   - `0001`~`0012` 특강 트랙 / `0013`~`0016` 연구모임 트랙
   - `0014`는 `admin_users.role` CHECK에 `reviewer`를 추가하고 `is_admin()`을 admin/superadmin으로
     좁힙니다. 기존 관리자 행은 role이 admin/superadmin이므로 잃는 권한이 없습니다.
3. Authentication → Sign In / Providers → **Google** 활성화
   - Google Cloud Console에서 OAuth 클라이언트 생성, **Authorized redirect URI**는 Supabase가 제공하는
     `https://<project-ref>.supabase.co/auth/v1/callback` 로 등록
   - 발급받은 Client ID/Secret을 Supabase Google Provider 설정에 입력
4. Authentication → URL Configuration (**로그인 후 localhost로 튕기는 오류를 막으려면 반드시 설정**):
   - **Site URL**: 기본값이 `http://localhost:3000` 이므로 배포 주소로 바꿉니다.
     예: `https://<github-username>.github.io/GLOCAL_AI`
     (이 값이 localhost로 남아 있으면, 구글 로그인 후 `ERR_CONNECTION_REFUSED`(localhost 연결 거부)로 실패합니다)
   - **Redirect URLs**: 배포될 GitHub Pages 주소를 와일드카드로 추가합니다.
     예: `https://<github-username>.github.io/GLOCAL_AI/**`
     (`**` 는 하위 경로와 `?redirectedFrom=...` 쿼리스트링까지 매칭)
5. Table Editor에서 `admin_users` 테이블에 관리자로 추가할 이메일이 들어있는지 확인
   (시드에 `eros4424@gmail.com` 포함됨. 추가 관리자는 이 테이블에 행을 더 넣으면 됩니다)
   - **연구모임 심사위원**은 같은 테이블에 `role = 'reviewer'` 로 넣습니다. 심사위원은 관리자 포털에서
     「계획서 심사」 탭만 보이고, 특강 신청자 데이터에는 접근할 수 없습니다.

### 2. Edge Function 배포
```bash
npm install -g supabase
supabase login
supabase link --project-ref <project-ref>
supabase functions deploy lookup
supabase functions deploy issue-certificate
supabase functions deploy cancel-application
supabase functions deploy study-lookup
supabase functions deploy study-submit
```
`SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` 는 Supabase가 모든 Edge Function에
자동으로 주입하므로 별도 시크릿 설정이 필요 없습니다.

### 3. GitHub Pages 활성화
1. 저장소 Settings → Pages → Build and deployment → **Source: GitHub Actions** 선택
2. Settings → Secrets and variables → Actions
   - **Secrets**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **Variables**(선택, 커스텀 도메인을 쓰는 경우만): `NEXT_PUBLIC_BASE_PATH` = `""`
     (기본값은 저장소 이름 기준 `/<repo-name>` 서브패스로 자동 설정됩니다)
3. `main` 브랜치에 push하면 `.github/workflows/deploy-pages.yml` 워크플로우가 자동으로 빌드·배포합니다
   (수동 실행은 Actions 탭 → Deploy to GitHub Pages → Run workflow)

## 로컬 개발

```bash
cp .env.example .env.local   # 값 채우기
npm install
npm run dev
```

정적 export 산출물을 로컬에서 직접 확인하려면:
```bash
npm run build && npm run preview   # http://localhost:3000 (out/ 디렉터리를 정적 서빙)
```

## 폴더 구조 메모

- `src/app/(portal)` — 트랙 A 특강 공개 탭(소개/신청/신청내역조회/만족도조사/수료증 발급)
- `src/app/(study)` — 트랙 B 연구모임 공개 탭(사업안내/신청/연구계획서/회의록/결과보고서/내 연구모임)
- `src/app/admin` — 관리자 포털(구글 OAuth 로그인 + 신청자 관리 + 만족도 설문결과 +
  연구모임 관리 · 계획서 심사 · 운영현황)
- `src/lib/study*.ts` · `src/components/study` — 트랙 B 전용 상수·타입·검증·데이터 접근·컴포넌트.
  기존 특강 트랙 파일(`constants.ts` 등)과 섞지 않고 분리했습니다.
- `supabase/migrations` — DB 스키마, RLS 정책, 트리거/함수, 시드 데이터
- `supabase/functions` — Edge Function(Deno) 소스
- `.github/workflows/deploy-pages.yml` — GitHub Pages 자동 배포
