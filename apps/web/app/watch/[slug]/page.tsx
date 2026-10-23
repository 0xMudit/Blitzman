'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import Player from '@/components/Player';
import { ApiError, api, getToken, sendQuiet } from '@/lib/api';
import { formatRuntime } from '@/lib/format';
import type { ContinueResponse, PlaybackResponse, Title } from '@/lib/types';

interface PlaybackError {
  code: string;
  message: string;
}

export default function WatchPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const slug = params?.slug ?? '';

  const [title, setTitle] = useState<Title | null>(null);
  const [playback, setPlayback] = useState<PlaybackResponse | null>(null);
  const [error, setError] = useState<PlaybackError | null>(null);
  const [resumeAt, setResumeAt] = useState(0);

  const sessionIdRef = useRef<string | null>(null);
  const lastSavedRef = useRef({ position: -100, duration: 0 });
  const savedRef = useRef({ position: 0, duration: 0 });

  useEffect(() => {
    if (!slug) return;

    if (!getToken()) {
      router.replace(`/login?next=${encodeURIComponent(`/watch/${slug}`)}`);
      return;
    }

    let cancelled = false;
    let sessionId: string | null = null;

    (async () => {
      try {
        const [{ title: loadedTitle }, continued] = await Promise.all([
          api<{ title: Title }>(`/catalog/${slug}`),
          api<ContinueResponse>('/me/continue').catch(() => ({ items: [] })),
        ]);
        if (cancelled) return;

        setTitle(loadedTitle);
        const resume = continued.items.find((item) => item.title.slug === slug);
        if (resume && resume.progress < 0.95) setResumeAt(resume.positionSecs);

        const session = await api<PlaybackResponse>(`/catalog/${slug}/playback`, {
          method: 'POST',
          body: { device: 'web' },
        });

        if (cancelled) {
          sendQuiet(`/playback/${session.sessionId}`, 'DELETE');
          return;
        }

        sessionId = session.sessionId;
        sessionIdRef.current = session.sessionId;
        setPlayback(session);
      } catch (cause) {
        if (cancelled) return;
        if (cause instanceof ApiError) {
          if (cause.status === 401) {
            router.replace(`/login?next=${encodeURIComponent(`/watch/${slug}`)}`);
            return;
          }
          setError({ code: cause.code, message: cause.message });
        } else {
          setError({ code: 'unknown', message: 'Unable to start playback.' });
        }
      }
    })();

    return () => {
      cancelled = true;
      if (sessionId) sendQuiet(`/playback/${sessionId}`, 'DELETE');
      if (savedRef.current.position > 5 && savedRef.current.duration > 0) {
        sendQuiet(`/me/progress/${slug}`, 'PUT', {
          positionSecs: Math.round(savedRef.current.position),
          durationSecs: Math.round(savedRef.current.duration),
        });
      }
    };
  }, [slug, router]);

  function saveProgress(position: number, duration: number) {
    savedRef.current = { position, duration };
    const last = lastSavedRef.current;
    if (Math.abs(position - last.position) < 8 && Math.abs(duration - last.duration) < 1) return;
    lastSavedRef.current = { position, duration };
    sendQuiet(`/me/progress/${slug}`, 'PUT', {
      positionSecs: Math.round(position),
      durationSecs: Math.round(duration),
      sessionId: sessionIdRef.current ?? undefined,
    });
  }

  if (error) {
    return (
      <main className="state-screen">
        <div className="state-card">
          <span className="state-kicker">
            {error.code === 'concurrency_limit' ? 'Stream limit reached' : 'Playback unavailable'}
          </span>
          <h1>
            {error.code === 'concurrency_limit'
              ? 'Too many screens are streaming.'
              : 'We could not start this title.'}
          </h1>
          <p>{error.message}</p>
          <div className="state-actions">
            <Link href="/" className="btn-primary">
              Back to browse
            </Link>
            <button type="button" className="btn-ghost" onClick={() => window.location.reload()}>
              Try again
            </button>
          </div>
        </div>
      </main>
    );
  }

  if (!playback || !title) {
    return (
      <main className="watch-loading">
        <div className="player-spinner" aria-label="Preparing stream">
          <span />
        </div>
        <p>
          {title ? title.name : 'Preparing your stream'}…
          <span className="watch-loading-sub">authorizing playback session</span>
        </p>
      </main>
    );
  }

  const durationFromCatalog = title.durationMins * 60;

  return (
    <main className="watch-page">
      <div className="watch-stage">
        <Player
          src={playback.manifestUrl}
          title={title.name}
          startAt={resumeAt}
          onProgress={saveProgress}
          onEnded={() => {
            const finished = { position: durationFromCatalog, duration: durationFromCatalog };
            savedRef.current = finished;
            sendQuiet(`/me/progress/${slug}`, 'PUT', {
              positionSecs: durationFromCatalog,
              durationSecs: durationFromCatalog,
              sessionId: sessionIdRef.current ?? undefined,
            });
          }}
        />
      </div>

      <section className="watch-details">
        <Link href="/" className="watch-back">
          ← Back to browse
        </Link>

        <div className="watch-heading">
          <div>
            <h1>{title.name}</h1>
            <p className="watch-meta">
              {title.year} <span>·</span> {title.maturity} <span>·</span>{' '}
              {formatRuntime(title.durationMins)} <span>·</span> {title.genre}
              {resumeAt > 0 && (
                <>
                  {' '}
                  <span>·</span> resumed at {Math.floor(resumeAt / 60)} min
                </>
              )}
            </p>
          </div>
          <div className="watch-session">
            <span className="pill pill-live">Session active</span>
            <span className="watch-session-id">
              {playback.sessionId.slice(0, 8)} · token {playback.ttlSecs}s
            </span>
          </div>
        </div>

        <p className="watch-description">{title.description}</p>

        <div className="watch-notes">
          <div>
            <span>Delivery</span>
            <strong>HLS · adaptive bitrate</strong>
          </div>
          <div>
            <span>Authorization</span>
            <strong>Signed session token</strong>
          </div>
          <div>
            <span>Account limit</span>
            <strong>2 concurrent streams</strong>
          </div>
        </div>
      </section>
    </main>
  );
}
