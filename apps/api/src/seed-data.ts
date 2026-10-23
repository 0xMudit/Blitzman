export interface SeedTitle {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  year: number;
  maturity: string;
  genre: string;
  durationMins: number;
  manifestUrl: string;
  posterFrom: string;
  posterTo: string;
  backdropFrom: string;
  backdropTo: string;
  featured: boolean;
  sortOrder: number;
}

/**
 * Open, publicly available HLS streams stand in for the licensed catalog.
 * Every entry is a real ABR ladder, so the player exercises level switching,
 * buffer management, and rendition selection for real.
 */
export const SEED_TITLES: SeedTitle[] = [
  {
    slug: 'big-buck-bunny',
    name: 'Big Buck Bunny',
    tagline: 'A giant rabbit. A tiny forest. One very bad day.',
    description:
      'A gentle giant of a rabbit wakes up to a day of bullying from three woodland rodents. What follows is the most patient, and most elaborate, revenge in animation history. Blender Foundation open movie, streamed here as a multi-bitrate HLS ladder.',
    year: 2008,
    maturity: 'All',
    genre: 'Animation',
    durationMins: 10,
    manifestUrl: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
    posterFrom: '#f4a259',
    posterTo: '#8a3b12',
    backdropFrom: '#2b1a10',
    backdropTo: '#f4a259',
    featured: true,
    sortOrder: 1,
  },
  {
    slug: 'dark-truths',
    name: 'Big Buck Bunny: Dark Truths',
    tagline: 'The forest, regraded for the dark.',
    description:
      'Blender’s Big Buck Bunny re-graded in low light. A reference title for testing how an adaptive ladder, a decoder, and a display pipeline handle dark, low-contrast scenes without banding or crushed blacks.',
    year: 2020,
    maturity: 'All',
    genre: 'Animation',
    durationMins: 10,
    manifestUrl:
      'https://storage.googleapis.com/shaka-demo-assets/bbb-dark-truths-hls/hls.m3u8',
    posterFrom: '#6b8f71',
    posterTo: '#16251b',
    backdropFrom: '#060d09',
    backdropTo: '#3f6b4f',
    featured: false,
    sortOrder: 2,
  },
  {
    slug: 'tears-of-steel',
    name: 'Tears of Steel',
    tagline: 'The future sent its regrets. Twice.',
    description:
      'In a ruined Amsterdam, a team of scientists tries to undo the robot uprising by replaying a moment of heartbreak. Blender Foundation open movie with live-action plates and heavy VFX.',
    year: 2012,
    maturity: '16+',
    genre: 'Sci-Fi',
    durationMins: 12,
    manifestUrl:
      'https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8',
    posterFrom: '#b06ab3',
    posterTo: '#2a1039',
    backdropFrom: '#12061a',
    backdropTo: '#8a3fb0',
    featured: false,
    sortOrder: 3,
  },
  {
    slug: 'bipbop',
    name: 'BipBop',
    tagline: 'The reference stream that taught the web to adapt.',
    description:
      "Apple's long-running adaptive streaming sample: a short animated film cut into a full fMP4 HLS ladder. If a player works anywhere, it works here.",
    year: 2014,
    maturity: 'All',
    genre: 'Animation',
    durationMins: 5,
    manifestUrl:
      'https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_fmp4/master.m3u8',
    posterFrom: '#4ade80',
    posterTo: '#0b3d2e',
    backdropFrom: '#04150f',
    backdropTo: '#1f9e6a',
    featured: false,
    sortOrder: 4,
  },
  {
    slug: 'pts-shift',
    name: 'PTS Shift',
    tagline: 'One stream, deliberately broken timestamps.',
    description:
      'A timing stress test assembled to expose players that mishandle presentation timestamp discontinuities. If seeking, audio, and subtitles stay in sync here, the player is earning its keep.',
    year: 2021,
    maturity: 'All',
    genre: 'Technical',
    durationMins: 5,
    manifestUrl: 'https://test-streams.mux.dev/pts_shift/master.m3u8',
    posterFrom: '#8b5cf6',
    posterTo: '#241046',
    backdropFrom: '#0b0619',
    backdropTo: '#6d28d9',
    featured: false,
    sortOrder: 5,
  },
  {
    slug: 'angel-one',
    name: 'Angel One',
    tagline: 'One stream, many voices.',
    description:
      'A multi-audio, multi-subtitle HLS title. Useful for exercising alternate audio rendition selection and text tracks alongside video ABR.',
    year: 2019,
    maturity: '13+',
    genre: 'Drama',
    durationMins: 8,
    manifestUrl: 'https://storage.googleapis.com/shaka-demo-assets/angel-one-hls/hls.m3u8',
    posterFrom: '#60a5fa',
    posterTo: '#152a6b',
    backdropFrom: '#060b1f',
    backdropTo: '#3b6fd4',
    featured: false,
    sortOrder: 6,
  },
];
