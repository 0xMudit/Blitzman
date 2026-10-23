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
    slug: 'sintel',
    name: 'Sintel',
    tagline: 'She gave away everything to find the one thing she lost.',
    description:
      'A lone hunter searches a frozen world for the dragon she raised and lost. Blender Foundation open movie, with a cinematic grade and a full adaptive bitrate ladder.',
    year: 2010,
    maturity: '13+',
    genre: 'Fantasy',
    durationMins: 15,
    manifestUrl: 'https://bitdash-a.akamaihd.net/content/sintel/hls/playlist.m3u8',
    posterFrom: '#5ac8d8',
    posterTo: '#123a57',
    backdropFrom: '#08131f',
    backdropTo: '#3aa6b9',
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
    slug: 'art-of-motion',
    name: 'Art of Motion',
    tagline: 'Every frame is a decision about where the eye goes.',
    description:
      'A short study of motion, color, and timing used across the industry as a bitrate-ladder benchmark. Small file, wide range of scene complexity.',
    year: 2011,
    maturity: 'All',
    genre: 'Documentary',
    durationMins: 7,
    manifestUrl:
      'https://bitdash-a.akamaihd.net/content/MI201109210084_1/m3u8s/f08e80da-bf1d-4e3d-8899-f0f6155f6efa.m3u8',
    posterFrom: '#f472b6',
    posterTo: '#4a1130',
    backdropFrom: '#1a0612',
    backdropTo: '#c2417d',
    featured: false,
    sortOrder: 5,
  },
  {
    slug: 'angel-one',
    name: 'Angel One',
    tagline: 'One stream, many voices.',
    description:
      'A multi-audio, multi-rendition HLS test title. Useful for exercising audio track selection and switch behavior alongside video ABR.',
    year: 2019,
    maturity: '13+',
    genre: 'Drama',
    durationMins: 8,
    manifestUrl: 'https://test-streams.mux.dev/test_001/stream.m3u8',
    posterFrom: '#60a5fa',
    posterTo: '#152a6b',
    backdropFrom: '#060b1f',
    backdropTo: '#3b6fd4',
    featured: false,
    sortOrder: 6,
  },
];
