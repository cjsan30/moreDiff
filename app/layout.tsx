import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MoreDiff",
  description: "여러 GitHub 브랜치를 한 번에 비교하는 작업 공간",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
