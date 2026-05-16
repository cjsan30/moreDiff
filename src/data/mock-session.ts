import { createCompareSession } from "@/src/domain/compare-session";

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
            patch: "@@ -1,5 +1,6 @@",
            content:
              "export default function LoginPage() {\n  return <h1>Welcome back</h1>;\n}\n",
          },
          {
            path: "src/ui/auth-form.tsx",
            status: "modified",
            additions: 18,
            deletions: 10,
            patch: "@@ -10,8 +10,11 @@",
            content:
              "export function AuthForm() {\n  return <form aria-label=\"auth form\">Updated form</form>;\n}\n",
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
            patch: "@@ -3,4 +3,8 @@",
            content:
              "export default function LoginPage() {\n  return <h1 tabIndex={-1}>Sign in</h1>;\n}\n",
          },
          {
            path: "src/ui/field.tsx",
            status: "added",
            additions: 22,
            deletions: 0,
            patch: "@@ -0,0 +1,22 @@",
            content:
              "export function Field() {\n  return <label>Accessible field</label>;\n}\n",
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
            patch: "@@ -0,0 +1,31 @@",
            content:
              "export function shouldRateLimit() {\n  return false;\n}\n",
          },
          {
            path: "src/ui/auth-form.tsx",
            status: "modified",
            additions: 5,
            deletions: 1,
            patch: "@@ -2,4 +2,8 @@",
            content:
              "export function AuthForm() {\n  return <form data-rate-limit=\"inline\">Updated form</form>;\n}\n",
          },
        ],
      },
    ],
  });
}
