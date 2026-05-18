import { createCompareSession } from "@/src/domain/compare-session";

const LOGIN_PAGE_BASE = `export default function LoginPage() {
  const title = "로그인";
  const subtitle = "계정으로 계속 진행하세요";
  const emailLabel = "이메일";
  const passwordLabel = "비밀번호";
  const submitLabel = "로그인";
  const forgotPasswordLabel = "비밀번호를 잊으셨나요?";
  const helpText = "사내 계정 또는 GitHub 계정을 사용할 수 있습니다.";

  return (
    <main className="loginPage">
      <section className="loginHero">
        <p className="eyebrow">MoreDiff</p>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </section>
      <form className="loginForm">
        <label>
          <span>{emailLabel}</span>
          <input name="email" type="email" autoComplete="email" />
        </label>
        <label>
          <span>{passwordLabel}</span>
          <input name="password" type="password" autoComplete="current-password" />
        </label>
        <button type="submit">{submitLabel}</button>
        <a href="/help/password">{forgotPasswordLabel}</a>
      </form>
      <p className="loginHelp">{helpText}</p>
    </main>
  );
}
`;

const LOGIN_PAGE_COPY = `export default function LoginPage() {
  const title = "다시 오신 것을 환영합니다";
  const subtitle = "작업 중인 브랜치 리뷰를 이어가려면 로그인하세요";
  const emailLabel = "업무용 이메일";
  const passwordLabel = "비밀번호";
  const submitLabel = "안전하게 로그인";
  const forgotPasswordLabel = "비밀번호 재설정";
  const helpText = "GitHub 연결은 로그인 후 설정 화면에서 다시 확인할 수 있습니다.";
  const securityNotice = "로그인 정보는 저장하지 않고 세션 토큰만 사용합니다.";
  const supportNotice = "접근 문제가 있으면 팀 관리자에게 권한을 요청하세요.";

  return (
    <main className="loginPage copyRefresh">
      <section className="loginHero">
        <p className="eyebrow">MoreDiff 보안 로그인</p>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </section>
      <form className="loginForm" aria-describedby="login-help">
        <label>
          <span>{emailLabel}</span>
          <input name="email" type="email" autoComplete="email" />
        </label>
        <label>
          <span>{passwordLabel}</span>
          <input name="password" type="password" autoComplete="current-password" />
        </label>
        <button type="submit">{submitLabel}</button>
        <a href="/help/password">{forgotPasswordLabel}</a>
      </form>
      <aside className="loginAssistance">
        <p id="login-help">{helpText}</p>
        <p>{securityNotice}</p>
        <p>{supportNotice}</p>
      </aside>
    </main>
  );
}
`;

const LOGIN_PAGE_A11Y = `export default function LoginPage() {
  const title = "로그인";
  const subtitle = "키보드와 스크린 리더로도 쉽게 접근할 수 있습니다";
  const emailLabel = "이메일 주소";
  const passwordLabel = "비밀번호";
  const submitLabel = "로그인 계속";
  const forgotPasswordLabel = "비밀번호 도움말 열기";
  const helpText = "필수 입력 항목은 모두 명확한 라벨을 제공합니다.";
  const errorSummaryId = "login-error-summary";

  return (
    <main className="loginPage accessibleLogin">
      <section className="loginHero" aria-labelledby="login-title">
        <p className="eyebrow">MoreDiff</p>
        <h1 id="login-title" tabIndex={-1}>{title}</h1>
        <p>{subtitle}</p>
      </section>
      <div id={errorSummaryId} role="status" aria-live="polite" />
      <form className="loginForm" aria-describedby="login-help">
        <label htmlFor="email">
          <span>{emailLabel}</span>
          <input id="email" name="email" type="email" autoComplete="email" />
        </label>
        <label htmlFor="password">
          <span>{passwordLabel}</span>
          <input id="password" name="password" type="password" autoComplete="current-password" />
        </label>
        <button type="submit">{submitLabel}</button>
        <a href="/help/password">{forgotPasswordLabel}</a>
      </form>
      <p id="login-help" className="loginHelp">{helpText}</p>
    </main>
  );
}
`;

const AUTH_FORM_BASE = `export function AuthForm() {
  const emailLabel = "이메일";
  const passwordLabel = "비밀번호";
  const submitLabel = "로그인";

  return (
    <form aria-label="로그인 폼">
      <label>
        <span>{emailLabel}</span>
        <input name="email" type="email" />
      </label>
      <label>
        <span>{passwordLabel}</span>
        <input name="password" type="password" />
      </label>
      <button type="submit">{submitLabel}</button>
    </form>
  );
}
`;

const AUTH_FORM_COPY = `export function AuthForm() {
  const emailLabel = "업무용 이메일";
  const passwordLabel = "비밀번호";
  const submitLabel = "안전하게 로그인";
  const helperText = "GitHub 저장소 접근 권한은 로그인 후 다시 확인합니다.";

  return (
    <form aria-label="보안 로그인 폼" className="authForm copyRefresh">
      <label>
        <span>{emailLabel}</span>
        <input name="email" type="email" autoComplete="email" />
      </label>
      <label>
        <span>{passwordLabel}</span>
        <input name="password" type="password" autoComplete="current-password" />
      </label>
      <p className="helperText">{helperText}</p>
      <button type="submit">{submitLabel}</button>
    </form>
  );
}
`;

const AUTH_FORM_RATE_LIMIT = `export function AuthForm() {
  const emailLabel = "이메일";
  const passwordLabel = "비밀번호";
  const submitLabel = "로그인";
  const rateLimitNotice = "시도가 너무 많으면 잠시 후 다시 요청됩니다.";

  return (
    <form aria-label="로그인 폼" data-rate-limit="inline">
      <label>
        <span>{emailLabel}</span>
        <input name="email" type="email" />
      </label>
      <label>
        <span>{passwordLabel}</span>
        <input name="password" type="password" />
      </label>
      <p role="status">{rateLimitNotice}</p>
      <button type="submit">{submitLabel}</button>
    </form>
  );
}
`;

const FIELD_BASE = `export function Field() {
  return <label>입력 필드</label>;
}
`;

const FIELD_A11Y = `export function Field() {
  const label = "접근 가능한 입력 필드";
  const description = "오류와 도움말을 스크린 리더에서 함께 읽습니다.";

  return (
    <label>
      <span>{label}</span>
      <input aria-describedby="field-help" />
      <small id="field-help">{description}</small>
    </label>
  );
}
`;

const RATE_LIMIT_BASE = `export function shouldRateLimit() {
  return false;
}
`;

const RATE_LIMIT_ADDED = `const MAX_ATTEMPTS = 5;
const WINDOW_MS = 60_000;

export function shouldRateLimit(attempts: Array<{ createdAt: number }>, now = Date.now()) {
  const recentAttempts = attempts.filter((attempt) => {
    return now - attempt.createdAt <= WINDOW_MS;
  });

  return recentAttempts.length >= MAX_ATTEMPTS;
}
`;

export function buildMockCompareSession() {
  return createCompareSession({
    repository: {
      owner: "acme",
      name: "morediff-demo",
    },
    baseBranch: "main",
    branches: [
      {
        name: "feature/login-copy",
        headSha: "a1b2c3d",
        files: [
          {
            path: "app/login/page.tsx",
            status: "modified",
            additions: 14,
            deletions: 4,
            patch: "@@ -1,5 +1,34 @@",
            content: LOGIN_PAGE_COPY,
            contentLoaded: true,
            baseContent: LOGIN_PAGE_BASE,
            baseContentLoaded: true,
          },
          {
            path: "src/ui/auth-form.tsx",
            status: "modified",
            additions: 18,
            deletions: 10,
            patch: "@@ -10,8 +10,22 @@",
            content: AUTH_FORM_COPY,
            contentLoaded: true,
            baseContent: AUTH_FORM_BASE,
            baseContentLoaded: true,
          },
        ],
      },
      {
        name: "feature/login-a11y",
        headSha: "d4e5f6g",
        files: [
          {
            path: "app/login/page.tsx",
            status: "modified",
            additions: 9,
            deletions: 2,
            patch: "@@ -3,4 +3,34 @@",
            content: LOGIN_PAGE_A11Y,
            contentLoaded: true,
            baseContent: LOGIN_PAGE_BASE,
            baseContentLoaded: true,
          },
          {
            path: "src/ui/field.tsx",
            status: "added",
            additions: 22,
            deletions: 0,
            patch: "@@ -0,0 +1,12 @@",
            content: FIELD_A11Y,
            contentLoaded: true,
            baseContent: FIELD_BASE,
            baseContentLoaded: true,
          },
        ],
      },
      {
        name: "feature/login-rate-limit",
        headSha: "h7i8j9k",
        files: [
          {
            path: "src/data/auth-rate-limit.ts",
            status: "added",
            additions: 31,
            deletions: 0,
            patch: "@@ -0,0 +1,10 @@",
            content: RATE_LIMIT_ADDED,
            contentLoaded: true,
            baseContent: RATE_LIMIT_BASE,
            baseContentLoaded: true,
          },
          {
            path: "src/ui/auth-form.tsx",
            status: "modified",
            additions: 5,
            deletions: 1,
            patch: "@@ -2,4 +2,24 @@",
            content: AUTH_FORM_RATE_LIMIT,
            contentLoaded: true,
            baseContent: AUTH_FORM_BASE,
            baseContentLoaded: true,
          },
        ],
      },
    ],
  });
}
