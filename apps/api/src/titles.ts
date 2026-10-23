export interface TitleRow {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  description: string;
  year: number;
  maturity: string;
  genre: string;
  duration_mins: number;
  manifest_url: string;
  poster_from: string;
  poster_to: string;
  backdrop_from: string;
  backdrop_to: string;
  featured: boolean;
  sort_order: number;
}

export interface TitleSummary {
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
  artwork: {
    poster: { from: string; to: string };
    backdrop: { from: string; to: string };
  };
}

/**
 * Catalog responses intentionally omit `manifest_url`. A manifest is only
 * handed out together with a signed, expiring playback token.
 */
export function toTitleSummary(row: TitleRow): TitleSummary {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    tagline: row.tagline,
    description: row.description,
    year: row.year,
    maturity: row.maturity,
    genre: row.genre,
    durationMins: row.duration_mins,
    featured: row.featured,
    artwork: {
      poster: { from: row.poster_from, to: row.poster_to },
      backdrop: { from: row.backdrop_from, to: row.backdrop_to },
    },
  };
}
