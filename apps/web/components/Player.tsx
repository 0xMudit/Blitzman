'use client';

import Hls from 'hls.js';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { formatBitrate, formatDuration } from '@/lib/format';

interface PlayerProps {
  src: string;
  title: string;
  startAt?: number;
  onProgress?: (positionSecs: number, durationSecs: number) => void;
  onEnded?: () => void;
}

interface Level {
  index: number;
  height: number;
  bitrate: number;
}

export default function Player({ src, title, startAt = 0, onProgress, onEnded }: PlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const startAtRef = useRef(startAt);
  const onProgressRef = useRef(onProgress);
  const onEndedRef = useRef(onEnded);
  const retriesRef = useRef(0);

  startAtRef.current = startAt;
  onProgressRef.current = onProgress;
  onEndedRef.current = onEnded;

  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(true);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volumeState, setVolumeState] = useState(1);
  const [muted, setMuted] = useState(false);
  const [levels, setLevels] = useState<Level[]>([]);
  const [manualLevel, setManualLevel] = useState(-1);
  const [activeLevel, setActiveLevel] = useState<Level | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [qualityOpen, setQualityOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      void video.play().catch(() => setPlaying(false));
    } else {
      video.pause();
    }
  }, []);

  const seekBy = useCallback((delta: number) => {
    const video = videoRef.current;
    if (!video || !Number.isFinite(video.duration)) return;
    video.currentTime = Math.min(Math.max(0, video.currentTime + delta), video.duration);
  }, []);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
  }, []);

  const revealControls = useCallback(() => {
    setControlsVisible(true);
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = window.setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) setControlsVisible(false);
    }, 3200);
  }, []);

  const toggleFullscreen = useCallback(() => {
    const element = containerRef.current;
    if (!element) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
    } else {
      void element.requestFullscreen().catch(() => {});
    }
  }, []);

  // Attach HLS and wire recovery.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    setError(null);
    setBuffering(true);
    setLevels([]);
    setActiveLevel(null);
    setManualLevel(-1);
    retriesRef.current = 0;

    let hls: Hls | null = null;

    if (Hls.isSupported()) {
      hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 30,
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        abrEwmaDefaultEstimate: 5_000_000,
      });
      hlsRef.current = hls;
      hls.loadSource(src);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, (_event, data) => {
        setLevels(
          data.levels.map((level, index) => ({
            index,
            height: level.height,
            bitrate: level.bitrate,
          })),
        );
        setBuffering(false);
        const active = videoRef.current;
        if (active) void active.play().catch(() => setPlaying(false));
      });

      hls.on(Hls.Events.LEVEL_SWITCHED, (_event, data) => {
        const level = hls?.levels[data.level];
        if (level) setActiveLevel({ index: data.level, height: level.height, bitrate: level.bitrate });
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) return;
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR && retriesRef.current < 2) {
          retriesRef.current += 1;
          hls?.startLoad();
          return;
        }
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          hls?.recoverMediaError();
          return;
        }
        setError(`The stream stopped unexpectedly (${data.details}).`);
        setBuffering(false);
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src;
    } else {
      setError('This browser cannot play HLS video.');
      setBuffering(false);
    }

    return () => {
      hls?.destroy();
      hlsRef.current = null;
    };
  }, [src]);

  // Report progress on a fixed cadence so long sessions survive interruptions.
  useEffect(() => {
    const interval = window.setInterval(() => {
      const video = videoRef.current;
      if (video && !video.paused && video.duration > 0) {
        onProgressRef.current?.(video.currentTime, video.duration);
      }
    }, 10_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;

      const video = videoRef.current;
      if (!video) return;

      switch (event.key) {
        case ' ':
        case 'k':
          event.preventDefault();
          togglePlay();
          break;
        case 'ArrowRight':
          event.preventDefault();
          seekBy(10);
          break;
        case 'ArrowLeft':
          event.preventDefault();
          seekBy(-10);
          break;
        case 'ArrowUp':
          event.preventDefault();
          video.volume = Math.min(1, video.volume + 0.1);
          break;
        case 'ArrowDown':
          event.preventDefault();
          video.volume = Math.max(0, video.volume - 0.1);
          break;
        case 'f':
          toggleFullscreen();
          break;
        case 'm':
          toggleMute();
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [seekBy, toggleFullscreen, toggleMute, togglePlay]);

  useEffect(() => {
    if (controlsVisible) revealControls();
    return () => {
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    };
  }, [controlsVisible, revealControls]);

  const selectLevel = (index: number) => {
    const hls = hlsRef.current;
    if (!hls) return;
    hls.currentLevel = index;
    setManualLevel(index);
    setQualityOpen(false);
  };

  const seekPercent = duration > 0 ? (current / duration) * 100 : 0;
  const volumePercent = muted ? 0 : volumeState * 100;
  const badge = manualLevel === -1 ? 'ABR auto' : 'Manual';

  return (
    <div
      ref={containerRef}
      className={`player ${controlsVisible ? '' : 'player-idle'}`}
      onMouseMove={revealControls}
      onMouseLeave={() => {
        if (videoRef.current && !videoRef.current.paused) setControlsVisible(false);
      }}
    >
      <video
        ref={videoRef}
        className="player-video"
        playsInline
        onClick={togglePlay}
        onDoubleClick={toggleFullscreen}
        onLoadedMetadata={() => {
          const video = videoRef.current;
          if (!video) return;
          setDuration(video.duration);
          if (startAtRef.current > 3 && startAtRef.current < video.duration - 5) {
            video.currentTime = startAtRef.current;
          }
        }}
        onTimeUpdate={() => {
          const video = videoRef.current;
          if (!video) return;
          setCurrent(video.currentTime);
          if (video.buffered.length > 0) {
            setBuffered(video.buffered.end(video.buffered.length - 1));
          }
        }}
        onDurationChange={() => {
          const video = videoRef.current;
          if (video) setDuration(video.duration);
        }}
        onPlay={() => {
          setPlaying(true);
          revealControls();
        }}
        onPause={() => {
          setPlaying(false);
          setControlsVisible(true);
          const video = videoRef.current;
          if (video && video.duration > 0) onProgressRef.current?.(video.currentTime, video.duration);
        }}
        onWaiting={() => setBuffering(true)}
        onPlaying={() => setBuffering(false)}
        onCanPlay={() => setBuffering(false)}
        onVolumeChange={() => {
          const video = videoRef.current;
          if (!video) return;
          setVolumeState(video.volume);
          setMuted(video.muted);
        }}
        onEnded={() => {
          const video = videoRef.current;
          if (video) onProgressRef.current?.(video.duration, video.duration);
          onEndedRef.current?.();
        }}
      />

      {buffering && !error && (
        <div className="player-spinner" aria-label="Buffering">
          <span />
        </div>
      )}

      {!playing && !buffering && !error && (
        <button type="button" className="player-bigplay" onClick={togglePlay} aria-label="Play">
          ▶
        </button>
      )}

      {error && (
        <div className="player-error">
          <h2>Playback failed</h2>
          <p>{error}</p>
          <button type="button" className="btn-primary" onClick={() => window.location.reload()}>
            Retry
          </button>
        </div>
      )}

      <div className="player-top">
        <Link href="/" className="player-back">
          ← Browse
        </Link>
        <div className="player-badges">
          <span className="pill">{badge}</span>
          {activeLevel && (
            <span className="pill">
              {activeLevel.height}p · {formatBitrate(activeLevel.bitrate)}
            </span>
          )}
        </div>
      </div>

      <div className="player-controls">
        <div className="player-title">{title}</div>

        <div className="seek-wrap">
          <div className="seek-buffer" style={{ width: `${duration > 0 ? (buffered / duration) * 100 : 0}%` }} />
          <input
            className="seek"
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={Math.min(current, duration || 0)}
            onChange={(event) => {
              const video = videoRef.current;
              const next = Number(event.target.value);
              setCurrent(next);
              if (video) video.currentTime = next;
            }}
            style={{ '--fill': `${seekPercent}%` } as CSSProperties}
            aria-label="Seek"
          />
        </div>

        <div className="player-buttons">
          <button type="button" onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'}>
            {playing ? '❚❚' : '▶'}
          </button>
          <button type="button" onClick={() => seekBy(-10)} aria-label="Back 10 seconds">
            −10s
          </button>
          <button type="button" onClick={() => seekBy(10)} aria-label="Forward 10 seconds">
            +10s
          </button>
          <div className="player-time">
            {formatDuration(current)} <span>/</span> {formatDuration(duration)}
          </div>
          <div className="player-spacer" />
          <div className="volume">
            <button type="button" onClick={toggleMute} aria-label={muted ? 'Unmute' : 'Mute'}>
              {muted ? '🔇' : '🔊'}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volumeState}
              onChange={(event) => {
                const video = videoRef.current;
                if (!video) return;
                video.volume = Number(event.target.value);
                video.muted = false;
              }}
              style={{ '--fill': `${volumePercent}%` } as CSSProperties}
              aria-label="Volume"
            />
          </div>
          <div className="quality">
            <button
              type="button"
              onClick={() => setQualityOpen((open) => !open)}
              aria-expanded={qualityOpen}
            >
              {manualLevel === -1 ? 'Auto' : `${activeLevel?.height ?? 'HD'}p`}
            </button>
            {qualityOpen && (
              <div className="quality-menu">
                <button
                  type="button"
                  className={manualLevel === -1 ? 'active' : ''}
                  onClick={() => selectLevel(-1)}
                >
                  Auto <span>adaptive</span>
                </button>
                {[...levels]
                  .sort((a, b) => b.height - a.height)
                  .map((level) => (
                    <button
                      type="button"
                      key={level.index}
                      className={manualLevel === level.index ? 'active' : ''}
                      onClick={() => selectLevel(level.index)}
                    >
                      {level.height}p <span>{formatBitrate(level.bitrate)}</span>
                    </button>
                  ))}
              </div>
            )}
          </div>
          <button type="button" onClick={toggleFullscreen} aria-label="Toggle fullscreen">
            {isFullscreen ? '⤢' : '⛶'}
          </button>
        </div>
      </div>
    </div>
  );
}
