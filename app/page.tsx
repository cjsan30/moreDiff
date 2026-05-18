import Link from "next/link";

export default function HomePage() {
  return (
    <main className="landing">
      <section className="hero">
        <p className="eyebrow">MoreDiff</p>
        <h1>두 개에서 여섯 개의 GitHub 브랜치를 한 작업 공간에서 리뷰하세요.</h1>
        <p className="lede">
          하나의 기준 브랜치와 여러 작업 브랜치를 비교하고, 겹치는 파일 변경을
          확인하며, 별도 비교 탭을 오가지 않고 브랜치 내용을 바로 수정할 수
          있습니다.
        </p>
        <div className="actions">
          <Link href="/connect" className="primaryAction">
            GitHub 저장소 연결
          </Link>
          <Link href="/compare?mode=demo" className="secondaryAction">
            데모 작업 공간 열기
          </Link>
        </div>
      </section>
    </main>
  );
}
