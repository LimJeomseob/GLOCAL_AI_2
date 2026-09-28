# 글로컬 AI 동행 포털

경상국립대학교 글로컬대학30 사업 **「2026학년도 2학기 AI 활용 연구모임」** 신청·심사·운영 포털
(`PRD.md` §15, 설계 근거는 `docs/연구모임_신청시스템_재구성_전략.md`).

### 특강(구 트랙 A)에 대하여

이 포털은 원래 「일과 삶을 바꾸는 생성형 AI 실무과정」 특강용이었고(`PRD.md` §1~14),
2026-08-31에 **공개 페이지를 폐지**하고 연구모임을 루트로 올렸습니다. 다만 특강의
**신청 253건·수료증·설문 데이터는 그대로 보존**되어 있으며 접근 경로도 남아 있습니다.

- 관리자 포털의 **「신청자 관리」·「만족도 설문결과」 탭은 유지** — 조회·엑셀 내보내기·수료증 발급 가능
- DB 테이블(`workshops`/`applications`/`certificates`/`LAWdata`)과
  Edge Function(`lookup`/`cancel-application`/`issue-certificate`)도 그대로 둡니다
- 연구모임 심사기준 1번(프로그램 참여·이수 이력)이 `applications`를 조회합니다.
  다만 관리자 「참여이력 관리」 탭에서 이력을 직접 등록할 수 있어(`0017`),
  특강 데이터가 없어도 심사기준 1번은 성립합니다

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
    결과보고서·산출물·배정 전문가·코칭 일정·팀별 최종 일정 공지(`0027`, 공개된 행만)를 한 번에 반환
    (트랙 B의 모든 탭이 이 응답 하나로 화면을 그린다)
  - `supabase/functions/study-expert-lookup` — **선정된** 전문가의 성명+연락처가 일치하면 그에게 배정된
    연구모임과 코칭 일정·조율 메모(`0026`), 팀별 최종 일정(`0027`, 공개된 행만)을 반환. 배정 관계가 확인된 범위에서만
    팀 대표자 연락처를 노출합니다.
  - `supabase/functions/study-submit` — 트랙 B **공개 쓰기의 유일한 경로**. `kind`(apply/apply-edit/members-edit/final-schedule-save/
    expert-apply/plan/meeting-save/meeting-delete/report/coaching-*/expert-coaching-*)로 갈리는 판별 유니온.
    `apply-edit`은 '내 연구모임'
    탭에서 대표자가 저장된 신청서를 고치는 경로(심사 착수 전·신청 마감 전에만 열린다). `members-edit`은 선발 이후
    (selected·in_progress) 같은 탭에서 **참여자 명단과 대표자 항목**을 고치는 경로로, 대표자 행은 서버가 화면이 보낸
    대표자 값(`leader`)으로 신청서의 대표자 항목(`leader_*`)과 함께 다시 만든다. 대표자 성명·연락처가 바뀌면
    이후 본인확인은 새 값으로 한다(apply-edit과 같은 방식). `final-schedule-save`는 같은 구간에
    대표자가 팀별 최종 일정(`0027`)의 3단계 일시·세부내용만 고치는 경로다(팀 구성·AI 전문가·공개 여부는 관리자 전용,
    `updated_by`에 "팀 대표자 OOO"로 남는다). `expert-apply`는 연구모임을 코칭할
    교내 AI활용 전문가(교원) 개인 신청(`study_expert_applications`, `0019`).
    `coaching-*`은 팀(대표자 본인확인), `expert-coaching-*`은 전문가(성명+연락처 본인확인 + 배정 확인)가
    코칭 일정을 제안·회신·확정하고 메모를 남기는 경로입니다(`0026`).
    연구모임 함수 4개(`study-submit`·`study-lookup`·`study-expert-lookup`·`study-notify`)는 `_shared/cors.ts`를 쓰지 않고 CORS 헬퍼를 파일 안에 복제해 **단일 파일**로 유지합니다 —
    Supabase 대시보드 코드 편집기는 `index.ts` 한 파일만 올리므로 `../_shared/`를 가리키는 import가
    있으면 "Module not found"로 배포가 실패합니다. 운영 담당자가 CLI 없이 대시보드에서 고쳐
    배포할 수 있도록 한 절충이며, `_shared/cors.ts`를 고칠 때는 이 파일도 함께 확인해야 합니다 연구모임 신청은 "모임 1건 + 참여자
    3~5행 + 계획서 1행"을 한 번에 만들고 접수번호를 되돌려줘야 해서 단일 INSERT로 끝나지 않으므로,
    `study_*` 테이블에는 익명 INSERT 정책을 두지 않고 이 함수로 모았습니다
- 수료증 PDF 발급/재발급(§6.4)은 Edge Function이 아니라 **관리자의 브라우저**에서 직접 생성합니다
  (`src/lib/certificatePdf.ts`, `src/lib/issueCertificate.ts`). `issue_certificate()` RPC 호출과
  Storage 업로드 모두 RLS의 `is_admin()` 체크로 통제되므로 관리자가 아니면 실행되지 않습니다.
  Deno(Supabase Edge Function) 환경에서는 `@pdf-lib/fontkit`이 내부적으로
  `Object.prototype.__proto__` 조작에 의존하는 부분이 있어 Deno의 보안 기본값과 충돌해
  런타임에 실패하는 것을 배포 전 스모크 테스트로 확인했습니다 — 그래서 브라우저 실행으로 우회했습니다.
- 연구모임 **신청서·연구계획서 제출본 PDF**(`src/lib/studyFormPdf.ts`)도 같은 방식으로 브라우저에서 만듭니다.
  관리자 「연구모임 관리」 상세 팝업과 대표자 「내 연구모임」에서 각각 내려받으며, 폰트 로더는
  `src/lib/pdfFonts.ts`로 수료증과 공유합니다. `public/fonts/`의 가공 폰트는
  `scripts/process_cert_fonts.py`로만 만듭니다(가변 원본은 `--wght 400`/`--wght 700`으로 인스턴스화).
- 관리자 인증: Supabase Auth 구글 OAuth + `admin_users` allowlist. 서버 미들웨어가 없으므로
  접근 통제는 클라이언트 라우트 가드(`useAdminSession`) + Supabase RLS(`is_admin()`)의 이중 구조입니다.

## 최초 배포 절차

### 1. Supabase 프로젝트 준비
1. [supabase.com](https://supabase.com) 에서 프로젝트 생성
2. `supabase/migrations/` 의 SQL을 **파일명 번호 순서대로** 적용 (`0001` → `0028`)
   (Supabase CLI: `supabase link --project-ref <ref>` 후 `supabase db push`, 또는 대시보드 SQL Editor에서 순서대로 실행)
   - `0001`~`0012` 특강 트랙 / `0013`~`0028` 연구모임 트랙
   - `0027`은 팀별 최종 일정·전문가 배정 결과 공지 테이블(`study_final_schedules`), `0028`은 2026-2학기 확정표
     시드입니다. 시드는 "회차 + 대표자 성명"으로 팀을 찾으므로 대표자 성명이 확정표와 다르거나 같은 성명의
     팀이 둘 이상이면 건너뛰고(`raise notice`), 그 팀은 「연구모임 관리」 상세 팝업에서 직접 입력합니다.
   - `0014`는 `admin_users.role` CHECK에 `reviewer`를 추가하고 `is_admin()`을 admin/superadmin으로
     좁힙니다. 기존 관리자 행은 role이 admin/superadmin이므로 잃는 권한이 없습니다.
3. Authentication → Sign In / Providers → **Google** 활성화
   - Google Cloud Console에서 OAuth 클라이언트 생성, **Authorized redirect URI**는 Supabase가 제공하는
     `https://<project-ref>.supabase.co/auth/v1/callback` 로 등록
   - 발급받은 Client ID/Secret을 Supabase Google Provider 설정에 입력
4. Authentication → URL Configuration (**로그인 후 localhost로 튕기는 오류를 막으려면 반드시 설정**):
   - **Site URL**: 기본값이 `http://localhost:3000` 이므로 배포 주소로 바꿉니다.
     예: `https://<github-username>.github.io/GLOCAL_AI_2`
     (이 값이 localhost로 남아 있으면, 구글 로그인 후 `ERR_CONNECTION_REFUSED`(localhost 연결 거부)로 실패합니다)
   - **Redirect URLs**: 배포될 GitHub Pages 주소를 와일드카드로 추가합니다.
     예: `https://<github-username>.github.io/GLOCAL_AI_2/**`
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
supabase functions deploy study-notify
supabase functions deploy study-expert-lookup
```
`SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` 는 Supabase가 모든 Edge Function에
자동으로 주입합니다. **대표자 안내 메일(`study-notify`)만 발송 서비스 시크릿이 따로 필요합니다**:
```bash
supabase secrets set RESEND_API_KEY=re_xxxxxxxx \
  NOTIFY_FROM_EMAIL="경상국립대학교 AI융합원 <noreply@<인증한 도메인>>" \
  NOTIFY_REPLY_TO=<문의 회신 주소>   # 선택
```
- [Resend](https://resend.com)에서 API 키를 만들고 **발신 도메인을 DNS로 인증**해야 합니다. 인증 전에는
  `NOTIFY_FROM_EMAIL=onboarding@resend.dev`로 Resend 계정 소유자 주소에만 보낼 수 있습니다(테스트 발송 용도).
- 시크릿이 없으면 「안내 발송」 탭의 발송 버튼이 설정 안내 오류를 돌려주고 큐 행은 그대로 남습니다.
- 안내 메일은 자동 발송이 아니라 **자동 준비 + 관리자 승인**입니다. 상태 전이(제출완료·선발/미선발·이수완료)가
  DB 트리거(`0024`)로 `study_notifications`에 제목·본문까지 렌더링해 쌓아 두고, 관리자가 「안내 발송」 탭에서
  확인·수정한 뒤 발송합니다. 전문가 신청자에게는 보내지 않습니다.

> `study-submit`을 고쳤다면 **프론트보다 먼저 재배포**하세요. 함수가 옛 버전이면 새 `kind`를 모르기 때문에
> 화면에서 "입력값을 확인해 주세요."(400)만 돌아옵니다.

#### CLI 없이 대시보드로 배포하기 (연구모임 함수 4개)

`study-submit`·`study-lookup`·`study-expert-lookup`·`study-notify`는 `_shared` import가 없는 단일 파일이라
Supabase 대시보드의 **Edge Functions** 코드 편집기로 배포할 수 있습니다.

1. 대시보드 → **Edge Functions** → 이미 있는 함수는 이름을 눌러 코드 편집 화면을, 없는 함수는
   새 함수 만들기(편집기 방식)를 엽니다. **함수 이름은 폴더명과 정확히 같아야** 합니다.
2. 저장소의 `supabase/functions/<함수명>/index.ts` 전체를 붙여넣고 배포합니다.
3. `study-notify`의 발송 시크릿(`RESEND_API_KEY`, `NOTIFY_FROM_EMAIL`, 선택 `NOTIFY_REPLY_TO`)은
   대시보드 Edge Functions의 **Secrets** 화면에서 등록합니다.

특강 레거시 함수(`lookup`·`issue-certificate`·`cancel-application`)는 `_shared`를 쓰므로 CLI로만 배포됩니다.

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

- `src/app/(study)` — 공개 탭. 라우트가 곧 루트입니다:
  `/`(사업안내) · `/apply` · `/plan` · `/meetings` · `/report` · `/lookup` ·
  `/expert-apply`(교내 AI활용 전문가 신청) · `/expert-teams`(전문가의 배정 팀 확인)
  - 팀의 「코칭 일정」 탭(`/coaching`)은 삭제했습니다. 팀은 「내 연구모임」의 **팀별 최종 일정**(`0027`)으로 일정을
    확인·수정합니다. 전문가 화면(`/expert-teams`)의 코칭 조율 패널(`CoachingSchedulePanel`)과 DB(`0026`)는 그대로 둡니다.
- `src/app/admin` — 관리자 포털(구글 OAuth 로그인 + 연구모임 관리 · 계획서 심사 · 운영현황 · 전문가 신청자 ·
  참여이력 관리 · 안내 발송 + 특강 레거시 탭인 신청자 관리 · 만족도 설문결과)
  - 공개 수정 경로(`study-submit`)는 신청 마감·심사 착수 전까지만 열리므로, 그 뒤의 정정은 관리자 화면에서
    합니다. **연구모임 관리**의 상세 팝업에서 신청서·참여자·윤리 다짐·계획서를 직접 고치고,
    **전문가 신청자** 탭에서 접수 건을 추가·수정·삭제합니다.
    연구모임 관리자 화면은 **선발 확정을 경계로 둘로 나뉩니다**(`STUDY_OPERATING_STATUSES`,
    `src/lib/studyGroupConstants.ts`). 같은 입력을 두 탭에 두지 않습니다.
    - **「연구모임 관리」 = 선발 전**: 접수 목록, 상태 변경, 심사 집계·선발 확정, 삭제, 신청서·계획서 열람·수정·PDF,
      복수학과 판정, 워크숍 희망일 집계. 선발된 팀의 상세 팝업은 운영현황으로 안내만 합니다.
    - **「연구모임 운영현황」 = 선발 후**: 선발 이후 상태(`selected` → `in_progress` → `report_submitted` → `completed`)의
      팀만 보이며, 모임명을 눌러 행을 펼치면 **전문가 배정**(`StudyExpertAssignForm`)·**3단계 일정**·**코칭 조율 내역**을
      그 자리에서 보고 고칩니다. 확정표의 팀 구성·비고·공개 여부·삭제까지 다룰 때는 「일정 상세 입력」
      (`StudyFinalScheduleModal`, `0027`). 행의 상태 select로 운영중 → 결과보고 제출 → 이수완료를 바꾸고, 이수완료 팀의
      참여자가 「이수 확정 명단」 CSV에 집계됩니다. 「운영현황 CSV」는 팀별 전문가·일정·진척을 한 표로 내보냅니다.
    **팀-전문가 배정은 관리자만, 드롭다운 수동 선택으로만** 합니다. 운영현황 행을 펼쳐 'AI 전문가 배정'에서
    「전문가 신청자」에 등록된 전문가(미선정·취소 제외, `isStudyExpertCandidate`)를 고르거나 '개별 학습'·미배정을 고릅니다.
    **외부 전문가도 「전문가 신청자」의 「신청자 추가」로 먼저 등록**해야 목록에 나옵니다. 자유 텍스트 입력은 두지 않습니다 —
    전문가 연결(`expert_id`)이 없으면 그 전문가가 「배정 팀 확인」에서 조회할 수 없기 때문입니다.
    저장은 `assignStudyGroupExpertWithLabel`(`src/lib/studyAdmin.ts`) 한 경로이며, 전문가가 '선정'이 아니면 **선정으로 바꾼 뒤**
    (`study-expert-lookup`·코칭 검증은 선정 + `expert_id` 연결 전문가만 연다) 연결과 팀 화면 'AI 전문가' 표기(`expert_label`)를 함께 저장합니다.
    배정해야 팀·전문가의 코칭 일정 조율이 열립니다(`0026`). 최종 일정 팝업의 'AI 전문가'는 읽기 전용입니다.
    '배정 전문가' 칸 배지(`studyGroupExpertDisplay`): **등록** = 연결됨(「배정 팀 확인」 가능), **미연결** = 예전 자유 텍스트 표기(0028 시드 등)만
    있어 조회 불가 → 드롭다운에서 다시 선택. 운영현황 CSV의 `배정팀확인` 열도 같은 기준입니다.
    최종 일정의 일시는 "미정", "2안 10.21(수)"처럼 원문 서식을 그대로 두는 자유 텍스트이고, 외부 전문가·'개별 학습'도
    그대로 적습니다. 저장하면 대표자가 「내 연구모임」에서 **자기 팀 것만** 봅니다(`study-lookup`이 공개된 행만 실어 보냄).
    전문가 「배정 팀 확인」도 같은 최종 일정을 보여 줍니다(`study-expert-lookup` 응답의 `finalSchedule`).
    두 경로 모두 Edge Function을 거치지 않고
    관리자 브라우저에서 RLS `is_admin()`으로 테이블을 직접 갱신하며(`src/lib/studyAdmin.ts`),
    접수 구간·팀 규모 검사는 DB 트리거가 관리자에게 면제합니다(`0013`·`0019`).
    인원(`member_count`)과 복수학과(`is_multi_dept`)는 트리거가 재계산하므로 화면에서 쓰지 않습니다.
- `src/lib/study*.ts` · `src/components/study` — 연구모임 전용 상수·타입·검증·데이터 접근·컴포넌트
- `src/lib/constants.ts`의 `PROGRAM_NAME`은 **수료증 서식과 기존 신청 데이터가 쓰는 특강 명칭**이라
  바꾸면 과거 수료증과 표기가 어긋납니다. 화면 상단 명칭은 `STUDY_PROGRAM_NAME`을 씁니다.
- `supabase/migrations` — DB 스키마, RLS 정책, 트리거/함수, 시드 데이터
- `supabase/functions` — Edge Function(Deno) 소스
- `.github/workflows/deploy-pages.yml` — GitHub Pages 자동 배포
