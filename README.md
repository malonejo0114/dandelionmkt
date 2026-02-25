# Dandelion Effect Web App (DDD MVP)

민들레효과 랜딩 + 관리자 CMS입니다.

- Public: `Home`, `About`, `Portfolio`, `Service`, `Contact`
- Admin: 콘텐츠 CRUD, 블록 편집, 문의 관리, 2FA/비밀번호 정책, 테넌트 설정
- 문의 알림: Telegram, Twilio SMS

## 1) 로컬 실행

```bash
npm install
npm start
```

- 앱: `http://127.0.0.1:8787`
- 관리자: `http://127.0.0.1:8787/admin/login`
- 초기 계정: `tenant=dandelion-effect / admin / admin1234`

## 2) 백엔드 모드

이 프로젝트는 환경변수로 백엔드를 자동 선택합니다.

- SQLite 모드(기본): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` 미설정
- Supabase 모드: 위 2개를 모두 설정

### SQLite 모드

- DB 파일: `data/app.sqlite`
- 업로드 파일: `uploads/`

### Supabase 모드

- DB: Supabase Postgres
- 파일: Supabase Storage(`media` 버킷 기본)

## 3) Supabase 초기 세팅

1. Supabase 프로젝트 생성
2. SQL Editor에서 `supabase/schema.sql` 실행
3. Project Settings > API 에서 값 확인

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

4. `.env` 예시

```bash
PORT=8787
SESSION_SECRET=change-this-secret
SESSION_SECURE=false
ALERT_PUBLIC_BASE_URL=http://127.0.0.1:8787

SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
SUPABASE_STORAGE_BUCKET=media

TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_IDS=-5222794057
```

## 4) Vercel 배포 (GitHub + Supabase)

### A. GitHub 푸시

```bash
git init
git add .
git commit -m "feat: supabase + vercel deployment"
git branch -M main
git remote add origin <YOUR_GITHUB_REPO_URL>
git push -u origin main
```

### B. Vercel 프로젝트 생성

1. Vercel에서 GitHub 저장소 Import
2. Framework preset: `Other`
3. Root: `/` (현재 프로젝트 루트)
4. `vercel.json`은 이미 포함되어 있음

### C. Vercel 환경변수 설정

Vercel Project > Settings > Environment Variables:

- `SESSION_SECRET`
- `SESSION_SECURE=true`
- `ALERT_PUBLIC_BASE_URL=https://<your-domain>`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_STORAGE_BUCKET=media` (선택)
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_IDS=-5222794057`

설정 후 Redeploy.

## 5) 문의 알림 채널

문의가 접수되면 DB 저장 후 알림 채널로 전송됩니다.
실패해도 문의 저장은 유지됩니다.

### Telegram

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_IDS` (콤마/공백 구분)
- `TELEGRAM_TOPIC_ID` (선택)

현재 코드는 다중 chat ID 전송 시:

- 한 곳이라도 성공하면 `ALERT_SENT`
- 실패 chat ID는 detail에 부분 실패로 기록

### Twilio SMS (선택)

- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_FROM_NUMBER`
- `ALERT_SMS_TO`

## 6) 구조

- `src/domain`: 엔티티/검증
- `src/application`: 유즈케이스 서비스
- `src/infrastructure`: DB/알림/스토리지 어댑터
- `src/interfaces/http`: 컨트롤러/라우트/미들웨어

## 7) 주의사항

- `.env`는 커밋 금지 (`.gitignore` 반영됨)
- Vercel 서버리스 업로드는 큰 파일에 한계가 있음
  - 대용량 영상은 추후 Signed URL 직접 업로드 방식 권장
