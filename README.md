# MoreDiff

GitHub 기준 브랜치 1개와 비교 브랜치 2-6개를 한 작업 공간에서 비교하고, 브랜치별 수정 내용을 확인한 뒤 안전하게 저장/PR 생성까지 이어가는 Next.js 서비스입니다.

## 빠른 실행

현재 저장소 기준 권장 순서입니다.

```powershell
cd C:\Users\mnshell\Desktop\Jungle\morediff\harness
npm ci
npm run dev
```

브라우저에서 `http://localhost:3000`을 열면 됩니다. GitHub 연결 없이 먼저 보려면 화면의 `데모 작업 공간 열기`를 사용하세요.

WSL/bash 터미널에서는 같은 폴더에서 아래처럼 실행합니다.

```bash
npm ci
npm run dev
```

## 주요 명령

- `npm run dev`: 개발 서버 실행
- `npm test`: 전체 Vitest 단위 테스트 실행
- `npm run test:integration`: 통합 테스트 실행
- `npm run test:smoke`: 스모크 테스트 실행
- `npm run build`: 프로덕션 빌드 및 타입 검사
- `npm start`: `npm run build` 이후 프로덕션 서버 실행

검증은 보통 아래 순서로 돌립니다.

```bash
npx tsc --noEmit
npm test
npm run test:integration
npm run test:smoke
npm run build
git diff --check
```

## 환경 변수

데모 모드는 환경 변수 없이 동작합니다. GitHub PAT는 화면에서 입력하며 저장하지 않습니다.

선택 환경 변수는 `.env.example`과 [docs/RUNNING.md](docs/RUNNING.md)를 참고하세요.

- `GITHUB_API_BASE_URL`: GitHub API URL. 기본값은 `https://api.github.com`
- `GITHUB_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_SECRET`: GitHub OAuth 로그인 사용 시 필요
- `OPENAI_API_KEY`: AI 리뷰 요약 사용 시 필요. 없으면 로컬 대체 요약을 생성
- `OPENAI_SUMMARY_MODEL`: AI 요약 모델. 기본값은 `gpt-5`
- `MOREDIFF_STORE_FILE`: 파일 기반 세션 저장 경로. 기본값은 `state/app/morediff-store.json`

## 문서

- 실행 방법: [docs/RUNNING.md](docs/RUNNING.md)
- 요구사항: [docs/requirements.md](docs/requirements.md)
- 요구사항 완료 상태: [docs/requirements_completion.md](docs/requirements_completion.md)
- 현재 운영 상태: [docs/current_state_summary.md](docs/current_state_summary.md)
- 하네스 명령: [configs/commands.md](configs/commands.md)
- 하네스 포팅: [docs/PORTING.md](docs/PORTING.md)

## 운영 메모

이 저장소는 제품 코드와 하네스/서브에이전트 운영 레이어가 같은 루트에 있습니다. 제품 실행은 `npm` 명령을 사용하고, 하네스 검증/게이트는 PowerShell 스크립트(`scripts/*.ps1`)를 사용합니다.
