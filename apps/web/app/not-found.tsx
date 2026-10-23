import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="state-screen">
      <div className="state-card">
        <span className="state-kicker">404</span>
        <h1>This scene was cut.</h1>
        <p>The page you asked for is not in the catalog.</p>
        <Link href="/" className="btn-primary">
          Back to browse
        </Link>
      </div>
    </main>
  );
}
