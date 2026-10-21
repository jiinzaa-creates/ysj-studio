/* YSJ Studio beat catalog — static data (Milestone 2).
 * Only VERIFIED metadata is filled in. Unknown fields are null and render as "—".
 * Never invent BPM, key, genre, prices, or reviews.
 * M3+: this file is replaced by GET /api/beats served from D1.
 */
const LICENSES = [
  { id: "mp3",       name: "MP3 Lease",  priceCents: 2000, deliverable: "Tagged MP3 + untagged MP3", exclusive: false },
  { id: "wav",       name: "WAV Lease",  priceCents: 4000, deliverable: "Untagged WAV + MP3",         exclusive: false },
  { id: "stems",     name: "Stems",      priceCents: 7500, deliverable: "Tracked-out stems + WAV + MP3", exclusive: false },
  { id: "exclusive", name: "Exclusive",  priceCents: null, deliverable: "Full package — contact to negotiate", exclusive: true },
];

const BEATS = [
  {
    slug: "red-handed", title: "RED HANDED",
    genre: "Emo Trap", mood: "Dark, Ambient", bpm: null, key: null,
    pocket: "Melodic R&B pocket — Future × Lil Baby × PartyNextDoor",
    cover: "assets/covers/red-handed.jpg", preview: "assets/previews/red-handed.mp3",
    featured: true, isNew: false,
  },
  {
    slug: "underneath", title: "UNDERNEATH",
    genre: "Alt-R&B", mood: null, bpm: 140, key: null,
    pocket: "Brent Faiyaz / Sonder lane",
    cover: "assets/covers/underneath.jpg", preview: "assets/previews/underneath.mp3",
    featured: true, isNew: true,
  },
  {
    slug: "doll-house", title: "Doll House F Min",
    genre: "Rage", mood: null, bpm: null, key: "F minor",
    pocket: "Yeat-type electronic rage",
    cover: "assets/covers/doll-house.jpg", preview: "assets/previews/doll-house.mp3",
    featured: true, isNew: false,
  },
  {
    slug: "winters-coming", title: "Winters Coming Cmin",
    genre: "Alt-R&B", mood: null, bpm: null, key: "C minor", pocket: null,
    cover: "assets/covers/winters-coming.jpg", preview: "assets/previews/winters-coming.mp3",
    featured: false, isNew: false,
  },
  {
    slug: "soaking", title: "Soaking",
    genre: null, mood: null, bpm: null, key: null, pocket: null,
    cover: "assets/covers/soaking.jpg", preview: "assets/previews/soaking.mp3",
    featured: false, isNew: true,
  },
  {
    slug: "tides", title: "Tides",
    genre: "Dark Trap", mood: null, bpm: null, key: null, pocket: null,
    cover: "assets/covers/tides.jpg", preview: "assets/previews/tides.mp3",
    featured: false, isNew: true,
  },
  {
    slug: "money-not-toxic", title: "Money not toxic",
    genre: "Ambient Rap", mood: null, bpm: null, key: null, pocket: null,
    cover: "assets/covers/money-not-toxic.jpg", preview: "assets/previews/money-not-toxic.mp3",
    featured: false, isNew: false,
  },
  {
    slug: "on-god", title: "On god",
    genre: "Dark Trap", mood: null, bpm: null, key: null, pocket: null,
    cover: "assets/covers/on-god.jpg", preview: "assets/previews/on-god.mp3",
    featured: false, isNew: false,
  },
  {
    slug: "design-of-it", title: "Design of it",
    genre: "Ambient Rap", mood: null, bpm: null, key: null, pocket: null,
    cover: "assets/covers/design-of-it.jpg", preview: "assets/previews/design-of-it.mp3",
    featured: false, isNew: false,
  },
  {
    slug: "war", title: "War",
    genre: "Dark Trap", mood: null, bpm: null, key: null, pocket: null,
    cover: "assets/covers/war.jpg", preview: "assets/previews/war.mp3",
    featured: false, isNew: false,
  },
  {
    slug: "be-smooth", title: "Be Smooth",
    genre: "Dark Trap", mood: null, bpm: null, key: null, pocket: null,
    cover: "assets/covers/be-smooth.jpg", preview: "assets/previews/be-smooth.mp3",
    featured: false, isNew: false,
  },
  {
    slug: "overzelous", title: "OVERZELOUS",
    genre: "Emo Trap", mood: null, bpm: 93, key: "D minor",
    pocket: "Juice WRLD type beat",
    cover: "assets/covers/overzelous.jpg", preview: "assets/previews/overzelous.mp3",
    featured: false, isNew: true,
  },
  {
    slug: "hypnotic", title: "HYPNOTIC",
    genre: "Emo Trap", mood: null, bpm: 120, key: "D minor",
    pocket: "Juice WRLD type beat",
    cover: "assets/covers/hypnotic.jpg", preview: "assets/previews/hypnotic.mp3",
    featured: false, isNew: true,
  },
];

function getBeat(slug) { return BEATS.find(b => b.slug === slug) || null; }
function getLicense(id) { return LICENSES.find(l => l.id === id) || null; }
function money(cents) { return cents == null ? "—" : "$" + (cents / 100).toFixed(cents % 100 ? 2 : 0); }
/* Lowest priced non-exclusive license, for "from $X" labels. */
function fromPrice() {
  const prices = LICENSES.filter(l => l.priceCents != null).map(l => l.priceCents);
  return money(Math.min(...prices));
}

/* Node/CJS interop for scripts/seed.mjs (harmless when loaded as a classic browser script). */
if (typeof module !== "undefined" && module.exports) {
  module.exports = { LICENSES, BEATS, getBeat, getLicense, money, fromPrice };
}
