# MoreDiff 실행 가이드

최종 업데이트: 2026-05-18

## 전제 조건

- Node.js 20 이상 권장
- npm 사용
- GitHub 실제 저장소 비교에는 GitHub 계정 또는 fine-grained PAT 필요
- GitHub OAuth 로그인은 OAuth 앱 환경 변수를 설정한 경우에만 사용 가능

## 처음 실행

PowerShell에서 실행하는 경우:

```powershell
cd C:\Users\mnshell\Desktop\Jungle\morediff\harness
npm ci
npm run dev
```

WSL/bash에서 실행하는 경우:

```bash
cd /mnt/c/Users/mnshell/Desktop/Jungle/morediff/harness
npm ci
npm run dev
```

개발 서버가 뜨면 `http://localhost:3000`을 엽니다.

## 데모 확인

환경 변수와 GitHub 인증 없이 확인할 수 있습니다.

1. `npm run dev` 실행
2. `http://localhost:3000` 접속
3. `데모 작업 공간 열기` 선택
4. 변경 파일을 선택해 `기준 코드`와 브랜치별 `수정 코드`가 나란히 표시되는지 확인

## GitHub 저장소 연결

실제 저장소 비교는 두 방식 중 하나를 사용합니다.

- GitHub OAuth: `GITHUB_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_SECRET` 설정 필요
- Fine-grained PAT: `/connect` 화면에서 직접 입력. 토큰은 저장하지 않음

OAuth 앱의 callback URL은 실행 주소 기준으로 아래 값을 등록합니다.

```text
http://localhost:3000/api/github/oauth/callback
```

## 환경 변수

`.env.local`을 만들어 필요한 값만 설정합니다.

```dotenv
GITHUB_API_BASE_URL=https://api.github.com
GITHUB_OAUTH_CLIENT_ID=
GITHUB_OAUTH_CLIENT_SECRET=
OPENAI_API_KEY=
OPENAI_SUMMARY_MODEL=gpt-5
MOREDIFF_STORE_FILE=state/app/morediff-store.json
```

필수 여부:

- 데모만 실행: 없음
- PAT 기반 GitHub 연결: 없음
- OAuth 기반 GitHub 연결: `GITHUB_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_SECRET`
- AI 요약: `OPENAI_API_KEY`
- 저장 파일 위치 변경: `MOREDIFF_STORE_FILE`

## npm 명령 순서

처음 설치:

```bash
npm ci
```

개발 서버:

```bash
npm run dev
```

검증:

```bash
npx tsc --noEmit
npm test
npm run test:integration
npm run test:smoke
npm run build
git diff --check
```

프로덕션 실행:

```bash
npm run build
npm start
```

`npm start`는 빌드 산출물이 있어야 실행됩니다.

## 하네스/게이트 명령

하네스 운영은 PowerShell 진입점을 사용합니다.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/run_harness_preflight.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/run_harness_cycle.ps1 -SkipRetryPrompt
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/run_git_gate.ps1 -Stage feature
```

자세한 목록은 [../configs/commands.md](../configs/commands.md)를 참고하세요.

## 저장 데이터

기본 파일 기반 저장소는 아래 경로를 사용합니다.

```text
state/app/morediff-store.json
```

저장되는 데이터는 저장소, 브랜치, diff, PR 메타데이터, 리뷰 노트, 작업공간 편집, 감사 이벤트입니다. GitHub PAT는 저장하지 않습니다.

## 문제 해결

- `npm`이 인식되지 않으면 Node.js/npm 설치 경로를 먼저 확인하세요.
- OAuth 시작 시 설정 오류가 나면 `GITHUB_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_SECRET`이 비어 있는 상태입니다.
- GitHub API 호출이 401/403이면 PAT 권한 또는 OAuth 앱 scope를 확인하세요. 현재 scope는 `repo read:user`입니다.
- `npm start`가 실패하면 먼저 `npm run build`를 실행하세요.
