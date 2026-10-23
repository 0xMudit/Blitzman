'use client';

import Link from 'next/link';
import type { CSSProperties } from 'react';
import { formatRuntime, initials } from '@/lib/format';
import type { Title } from '@/lib/types';

export function TitleCard({
  title,
  signedIn,
  progress,
}: {
  title: Title;
  signedIn: boolean;
  progress?: number;
}) {
  const href = signedIn ? `/watch/${title.slug}` : `/login?next=${encodeURIComponent(`/watch/${title.slug}`)}`;

  return (
    <Link
      href={href}
      className="card"
      style={
        {
          '--from': title.artwork.poster.from,
          '--to': title.artwork.poster.to,
        } as CSSProperties
      }
    >
      <div className="card-poster">
        <span className="card-glyph" aria-hidden>
          {initials(title.name)}
        </span>
        {progress !== undefined && progress > 0 && (
          <div className="card-progress" aria-hidden>
            <span style={{ width: `${Math.min(100, progress * 100)}%` }} />
          </div>
        )}
      </div>
      <div className="card-meta">
        <span className="card-title">{title.name}</span>
        <span className="card-sub">
          {title.year} · {title.genre} · {formatRuntime(title.durationMins)}
        </span>
      </div>
    </Link>
  );
}

export function ContinueCard({ title, progress, positionSecs }: { title: Title; progress: number; positionSecs: number }) {
  const remaining = Math.max(0, Math.round(title.durationMins * 60 - positionSecs));
  const minutesLeft = Math.max(1, Math.round(remaining / 60));

  return (
    <Link
      href={`/watch/${title.slug}`}
      className="card continue-card"
      style={
        {
          '--from': title.artwork.backdrop.from,
          '--to': title.artwork.backdrop.to,
        } as CSSProperties
      }
    >
      <div className="continue-poster">
        <span className="continue-play" aria-hidden>
          ▶
        </span>
        <div className="continue-progress" aria-hidden>
          <span style={{ width: `${Math.min(100, progress * 100)}%` }} />
        </div>
      </div>
      <div className="card-meta">
        <span className="card-title">{title.name}</span>
        <span className="card-sub">{minutesLeft}m left · {title.genre}</span>
      </div>
    </Link>
  );
}
