'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Row from '@/components/Row';
import { ContinueCard, TitleCard } from '@/components/TitleCard';
import { ApiError, api, getToken, onAuthChange } from '@/lib/api';
import { formatRuntime } from '@/lib/format';
import type { CatalogResponse, ContinueItem, ContinueResponse, Title } from '@/lib/types';

export default function HomePage() {
  const router = useRouter();
  const [signedIn, setSignedIn] = useState(false);
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [continueItems, setContinueItems] = useState<ContinueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api<CatalogResponse>('/catalog');
      setCatalog(data);
      if (getToken()) {
        const continued = await api<ContinueResponse>('/me/continue').catch(() => ({ items: [] }));
        setContinueItems(continued.items);
      } else {
        setContinueItems([]);
      }
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Unable to load the catalog.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setSignedIn(Boolean(getToken()));
    void load();
    return onAuthChange(() => {
      setSignedIn(Boolean(getToken()));
      void load();
    });
  }, [load]);

  const featured = catalog?.featured ?? null;
  const filtered = useMemo(() => {
    const titles = catalog?.titles ?? [];
    const needle = query.trim().toLowerCase();
    if (!needle) return titles;
    return titles.filter((title) =>
      [title.name, title.genre, title.tagline, title.description].some((value) =>
        value.toLowerCase().includes(needle),
      ),
    );
  }, [catalog, query]);

  function watch(title: Title) {
    router.push(
      signedIn
        ? `/watch/${title.slug}`
        : `/login?next=${encodeURIComponent(`/watch/${title.slug}`)}`,
    );
  }

  return (
    <main>
      {loading && (
        <div className="hero hero-skeleton">
          <div className="hero-content">
            <div className="skeleton skeleton-line short" />
            <div className="skeleton skeleton-title" />
            <div className="skeleton skeleton-line" />
            <div className="skeleton skeleton-line medium" />
          </div>
        </div>
      )}

      {!loading && error && (
        <section className="state-screen">
          <div className="state-card">
            <h1>Catalog unavailable</h1>
            <p>{error}</p>
            <button type="button" className="btn-primary" onClick={() => void load()}>
              Try again
            </button>
          </div>
        </section>
      )}

      {!loading && !error && catalog && (
        <>
          {featured && (
            <section
              className="hero"
              style={
                {
                  '--from': featured.artwork.backdrop.from,
                  '--to': featured.artwork.backdrop.to,
                } as React.CSSProperties
              }
            >
              <div className="hero-content">
                <span className="hero-eyebrow">Blitzman Original · {featured.genre}</span>
                <h1>{featured.name}</h1>
                <p className="hero-meta">
                  {featured.year} <span>·</span> {featured.maturity} <span>·</span>{' '}
                  {formatRuntime(featured.durationMins)} <span>·</span> HLS Adaptive
                </p>
                <p className="hero-tagline">{featured.tagline}</p>
                <p className="hero-description">{featured.description}</p>
                <div className="hero-actions">
                  <button type="button" className="btn-primary" onClick={() => watch(featured)}>
                    ▶ Play
                  </button>
                  <a className="btn-ghost" href="#catalog">
                    More info
                  </a>
                </div>
                <p className="hero-note">
                  Phase 1 · adaptive bitrate · signed playback sessions · {signedIn ? '2-stream limit' : 'free account'}
                </p>
              </div>
            </section>
          )}

          <div className="page-body">
            {continueItems.length > 0 && (
              <Row title="Continue watching">
                {continueItems.map((item) => (
                  <ContinueCard
                    key={item.title.id}
                    title={item.title}
                    progress={item.progress}
                    positionSecs={item.positionSecs}
                  />
                ))}
              </Row>
            )}

            <section id="catalog" className="catalog-section">
              <div className="catalog-head">
                <h2>{query.trim() ? `Results for “${query.trim()}”` : 'Trending on Blitzman'}</h2>
                <input
                  className="search"
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search titles, genres, moods…"
                  aria-label="Search the catalog"
                />
              </div>

              {filtered.length > 0 ? (
                <div className="grid">
                  {filtered.map((title) => (
                    <TitleCard key={title.id} title={title} signedIn={signedIn} />
                  ))}
                </div>
              ) : (
                <p className="empty-state">Nothing matches “{query.trim()}”. Try a genre or a title.</p>
              )}
            </section>

            <footer className="footer">
              <div className="footer-brand">
                <span className="logo-mark" aria-hidden>
                  ⚡
                </span>
                <span>Blitzman</span>
              </div>
              <p>
                Built in public. Phase 1: adaptive HLS, signed sessions, concurrency limits, continue
                watching.
              </p>
              <div className="footer-links">
                <Link href="https://github.com/0xMudit/Blitzman" target="_blank" rel="noreferrer">
                  GitHub
                </Link>
                <span className="footer-dot">·</span>
                <span>Streams are public open-movie test ladders</span>
              </div>
            </footer>
          </div>
        </>
      )}
    </main>
  );
}
