export interface Artwork {
  poster: { from: string; to: string };
  backdrop: { from: string; to: string };
}

export interface Title {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  description: string;
  year: number;
  maturity: string;
  genre: string;
  durationMins: number;
  featured: boolean;
  artwork: Artwork;
}

export interface CatalogResponse {
  featured: Title | null;
  titles: Title[];
}

export interface PlaybackResponse {
  sessionId: string;
  token: string;
  manifestUrl: string;
  expiresAt: string;
  ttlSecs: number;
  edgeUrls: string[];
  title: Title;
}

export interface QoeEvent {
  kind: 'session_start' | 'rebuffer' | 'bitrate' | 'error' | 'session_end';
  valueNum?: number;
  valueText?: string;
}

export interface QoeSummary {
  windowMins: number;
  generatedAt: string;
  activeStreams: number;
  sessionsStarted: number;
  rebuffers: number;
  rebufferMs: number;
  rebufferRatio: number;
  startupMs: { avg: number; max: number };
  avgBitrateBps: number;
  errors: number;
  watchSecs: number;
  events: number;
  edges: string[];
  topTitles: Array<{
    name: string;
    starts: number;
    rebuffers: number;
    rebufferMs: number;
  }>;
}

export interface ContinueItem {
  title: Title;
  positionSecs: number;
  durationSecs: number;
  progress: number;
  updatedAt: string;
}

export interface ContinueResponse {
  items: ContinueItem[];
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
}

export interface MeResponse {
  user: SessionUser;
  activeStreams: number;
}
