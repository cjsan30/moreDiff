import Link from "next/link";

export default function HomePage() {
  return (
    <main className="landing">
      <section className="hero">
        <p className="eyebrow">MoreDiff</p>
        <h1>Review two to six GitHub branches in one workspace.</h1>
        <p className="lede">
          Compare one base branch against multiple in-flight branches, inspect
          overlapping file changes, and edit branch content without bouncing
          between separate compare tabs.
        </p>
        <div className="actions">
          <Link href="/connect" className="primaryAction">
            Connect GitHub Repository
          </Link>
          <Link href="/compare?mode=demo" className="secondaryAction">
            Open Demo Workspace
          </Link>
        </div>
      </section>
    </main>
  );
}
