'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import Player, { type PlayerEvent } from '@/components/Player';
import { ApiError, api, getToken, sendQuiet } from '@/lib/api';
import { closeEdgeSession, edgeHealth, edgeManifestUrl, openEdgeSession } from '@/lib/edge';
import type { EdgeHealth } from '@/lib/edge';
import { formatPercent, formatRuntime } from '@/lib/format';
import type { ContinueResponse, PlaybackResponse, QoeEvent, Title } from '@/lib/types';

interface PlaybackError {
  code: string;
  message: string;
}

type Delivery =
  | { mode: 'edge'; url: string; pop: string; ttlSecs: number }
  | { mode: 'origin'; reason: string };

interface WatchSession {
  playback: PlaybackResponse;
  src: string;
  delivery: Delivery;
}

export default function WatchPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const slug = params?.slug ?? '';

  const [title, setTitle] = useState<Title | null>(null);
  const [session, setSession] = useState<WatchSession | null>(null);
  const [error, setError] = useState<PlaybackError | null>(null);
  const [resumeAt, setResumeAt] = useState(0);
  const [edgeStats, setEdgeStats] = useState<EdgeHealth | null>(null);

  const sessionIdRef = useRef<string | null>(null);
  const lastSavedRef = useRef({ position: -100, duration: 0 });
  const savedRef = useRef({ position: 0, duration: 0 });
  const qoeQueueRef = useRef<QoeEvent[]>([]);

  const flushQoe = useCallback(() => {
    while (qoeQueueRef.current.length > 0) {
      const events = qoeQueueRef.current.splice(0, 25);
      sendQuiet('/telemetry/qoe', 'POST', {
        sessionId: sessionIdRef.current ?? undefined,
        titleSlug: slug,
        events,
      });
    }
  }, [slug]);

  useEffect(() => {
    if (!slug) return;

    if (!getToken()) {
      router.replace(`/login?next=${encodeURIComponent(`/watch/${slug}`)}`);
      return;
    }

    let cancelled = false;
    let sessionId: string | null = null;
    let edgeUrl: string | null = null;

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

        const playback = await api<PlaybackResponse>(`/catalog/${slug}/playback`, {
          method: 'POST',
          body: { device: 'web' },
        });

        if (cancelled) {
          sendQuiet(`/playback/${playback.sessionId}`, 'DELETE');
          return;
        }

        sessionId = playback.sessionId;
        sessionIdRef.current = playback.sessionId;

        // Try each PoP the control plane steered us to, then fall back to the
        // origin. A dead edge should degrade delivery, not playback.
        let delivery: Delivery = {
          mode: 'origin',
          reason: playback.edgeUrls.length === 0 ? 'no edge configured' : 'edge unreachable',
        };
        let src = playback.manifestUrl;

        for (const candidate of playback.edgeUrls) {
          try {
            const edge = await openEdgeSession(candidate, playback.token);
            if (cancelled) return;
            delivery = {
              mode: 'edge',
              url: candidate,
              pop: edge.pop,
              ttlSecs: edge.ttlSecs,
            };
            src = edgeManifestUrl(candidate, playback.manifestUrl);
            edgeUrl = candidate;
            break;
          } catch {
            // Try the next PoP.
          }
        }

        if (cancelled) return;
        setSession({ playback, src, delivery });
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
      if (edgeUrl) void closeEdgeSession(edgeUrl);
      if (savedRef.current.position > 5 && savedRef.current.duration > 0) {
        sendQuiet(`/me/progress/${slug}`, 'PUT', {
          positionSecs: Math.round(savedRef.current.position),
          durationSecs: Math.round(savedRef.current.duration),
        });
      }
    };
  }, [slug, router]);

  // Flush QoE every few seconds, and close the session out on unmount.
  useEffect(() => {
    const interval = window.setInterval(flushQoe, 5000);
    return () => {
      window.clearInterval(interval);
      if (savedRef.current.position > 0) {
        qoeQueueRef.current.push({
          kind: 'session_end',
          valueNum: Math.round(savedRef.current.position),
        });
      }
      flushQoe();
    };
  }, [flushQoe]);

  // Poll the PoP we are actually using so the page can show cache health.
  useEffect(() => {
    if (session?.delivery.mode !== 'edge') {
      setEdgeStats(null);
      return;
    }
    const url = session.delivery.url;
    let cancelled = false;

    const load = async () => {
      const health = await edgeHealth(url);
      if (!cancelled) setEdgeStats(health);
    };
    void load();
    const interval = window.setInterval(load, 8000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [session]);

  // Rotate the playback token and edge cookie before they expire.
  useEffect(() => {
    if (session?.delivery.mode !== 'edge') return;
    const { url, ttlSecs } = session.delivery;
    const playback = session.playback;
    let cancelled = false;

    const refresh = async () => {
      try {
        const refreshed = await api<{ token: string }>(
          `/playback/${playback.sessionId}/token`,
          { method: 'POST' },
        );
        if (!cancelled) await openEdgeSession(url, refreshed.token);
      } catch {
        // If rotation fails the cookie simply expires and playback stops.
      }
    };

    const interval = window.setInterval(refresh, Math.max(30, ttlSecs - 40) * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [session]);

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

  function handlePlayerEvent(event: PlayerEvent) {
    qoeQueueRef.current.push(event);
    if (event.kind === 'error') flushQoe();
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

  if (!session || !title) {
    return (
      <main className="watch-loading">
        <div className="player-spinner" aria-label="Preparing stream">
          <span />
        </div>
        <p>
          {title ? title.name : 'Preparing your stream'}…
          <span className="watch-loading-sub">
            {session ? 'attaching player' : 'authorizing playback session'}
          </span>
        </p>
      </main>
    );
  }

  const durationFromCatalog = title.durationMins * 60;
  const delivery = session.delivery;
  const onEdge = delivery.mode === 'edge';

  return (
    <main className="watch-page">
      <div className="watch-stage">
        <Player
          src={session.src}
          title={title.name}
          startAt={resumeAt}
          withCredentials={onEdge}
          onEvent={handlePlayerEvent}
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
              {session.playback.sessionId.slice(0, 8)} · token {session.playback.ttlSecs}s
            </span>
          </div>
        </div>

        <p className="watch-description">{title.description}</p>

        <div className="watch-notes">
          <div>
            <span>Delivery</span>
            <strong>
              {onEdge
                ? `Edge · ${delivery.pop}${
                    edgeStats
                      ? ` · ${formatPercent(edgeStats.cache.hitRatio)} cache hit`
                      : ''
                  }`
                : `Origin · direct (${delivery.reason})`}
            </strong>
          </div>
          <div>
            <span>Authorization</span>
            <strong>{onEdge ? 'Signed edge cookie' : 'Signed manifest token'}</strong>
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
