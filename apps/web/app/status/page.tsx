'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { edgeHealth } from '@/lib/edge';
import type { EdgeHealth } from '@/lib/edge';
import { formatBitrate, formatBytes, formatPercent } from '@/lib/format';
import type { QoeSummary } from '@/lib/types';

function formatMs(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '—';
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(2)} s`;
}

function formatWatch(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0 min';
  const minutes = seconds / 60;
  return minutes < 60 ? `${minutes.toFixed(1)} min` : `${(minutes / 60).toFixed(1)} h`;
}

export default function StatusPage() {
  const [summary, setSummary] = useState<QoeSummary | null>(null);
  const [edges, setEdges] = useState<EdgeHealth[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const data = await api<QoeSummary>('/telemetry/summary?windowMins=60');
        if (cancelled) return;
        setSummary(data);

        const health = await Promise.all(data.edges.map((url) => edgeHealth(url)));
        if (cancelled) return;
        setEdges(health.filter((entry): entry is EdgeHealth => entry !== null));
        setError(null);
      } catch {
        if (!cancelled) setError('Could not reach the control plane.');
      }
    };

    void load();
    const interval = window.setInterval(load, 8000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const requests = edges.reduce((sum, edge) => sum + edge.cache.hits + edge.cache.misses, 0);
  const hits = edges.reduce((sum, edge) => sum + edge.cache.hits, 0);
  const cacheHitRatio = requests > 0 ? hits / requests : 0;

  return (
    <main className="status-page">
      <header className="status-hero">
        <span className="status-eyebrow">Live · rolling 60 minutes</span>
        <h1>Quality of experience</h1>
        <p>
          What the player actually observes: startup latency, rebuffering, delivered bitrate,
          errors, and edge cache health. Telemetry is batched in the browser and refreshed here
          every eight seconds.
        </p>
      </header>

      {error && <p className="status-error">{error}</p>}

      <section className="status-grid" aria-label="Quality metrics">
        <article className="status-card">
          <span className="status-label">Active streams</span>
          <strong className="status-value">{summary?.activeStreams ?? '—'}</strong>
          <span className="status-foot">{summary?.sessionsStarted ?? 0} started this window</span>
        </article>
        <article className="status-card">
          <span className="status-label">Startup · avg</span>
          <strong className="status-value">{summary ? formatMs(summary.startupMs.avg) : '—'}</strong>
          <span className="status-foot">
            worst {summary ? formatMs(summary.startupMs.max) : '—'}
          </span>
        </article>
        <article className="status-card">
          <span className="status-label">Rebuffer ratio</span>
          <strong className="status-value">
            {summary ? formatPercent(summary.rebufferRatio) : '—'}
          </strong>
          <span className="status-foot">
            {summary?.rebuffers ?? 0} stalls · {formatMs(summary?.rebufferMs ?? 0)}
          </span>
        </article>
        <article className="status-card">
          <span className="status-label">Delivered bitrate</span>
          <strong className="status-value">
            {summary && summary.avgBitrateBps > 0 ? formatBitrate(summary.avgBitrateBps) : '—'}
          </strong>
          <span className="status-foot">ABR average across renditions</span>
        </article>
        <article className="status-card">
          <span className="status-label">Edge cache</span>
          <strong className="status-value">{formatPercent(cacheHitRatio)}</strong>
          <span className="status-foot">
            {requests > 0 ? `${hits} of ${requests} requests` : 'waiting for traffic'}
          </span>
        </article>
        <article className="status-card">
          <span className="status-label">Playback errors</span>
          <strong className="status-value">{summary?.errors ?? 0}</strong>
          <span className="status-foot">
            watched {summary ? formatWatch(summary.watchSecs) : '0 min'}
          </span>
        </article>
      </section>

      <section className="status-panels">
        <div className="panel">
          <div className="panel-head">
            <h2>Edge PoPs</h2>
            <span>{edges.length} reachable</span>
          </div>
          {edges.length === 0 ? (
            <p className="empty-state">
              No edge responded. Run <code>npm run dev</code> so both PoPs start on 4100 and
              4101.
            </p>
          ) : (
            edges.map((edge) => {
              const used = edge.cache.maxBytes > 0 ? edge.cache.bytes / edge.cache.maxBytes : 0;
              return (
                <div className="edge-row" key={edge.pop}>
                  <div className="edge-meta">
                    <div>
                      <span className="status-dot" aria-hidden />
                      <strong>{edge.pop}</strong>
                    </div>
                    <span>
                      {formatPercent(edge.cache.hitRatio)} hit · {edge.cache.entries} objects ·{' '}
                      {formatBytes(edge.cache.bytes)}
                    </span>
                  </div>
                  <div className="edge-bar" aria-label={`${formatPercent(used)} of cache used`}>
                    <span style={{ width: `${Math.min(100, used * 100)}%` }} />
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="panel">
          <div className="panel-head">
            <h2>Titles by rebuffers</h2>
            <span>last hour</span>
          </div>
          {!summary || summary.topTitles.length === 0 ? (
            <p className="empty-state">
              Play something to populate the dashboard. QoE events arrive after the first
              session starts.
            </p>
          ) : (
            summary.topTitles.map((title) => (
              <div className="title-row" key={title.name}>
                <div>
                  <strong>{title.name}</strong>
                  <span>
                    {title.starts} {title.starts === 1 ? 'start' : 'starts'} ·{' '}
                    {formatMs(title.rebufferMs)} stalled
                  </span>
                </div>
                <span className="title-rebuffers">{title.rebuffers}</span>
              </div>
            ))
          )}
        </div>
      </section>

      <footer className="status-note">
        Local simulator: two PoPs run on this machine and share a cache-per-process. The
        control plane steers sessions deterministically; production uses geo/DNS steering and a
        shared cache tier. See <code>docs/scale-notes.md</code>.
      </footer>
    </main>
  );
}
