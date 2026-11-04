// Keep in step with the client's src/config.js by hand (a contract change goes in both projects).

// Bloxity game id; the env BLOXITY_GAME_ID (injected by Bloxity hosting) wins.
export const GAME_SLUG_DEFAULT = "shoot-a-bullet";
export const BLOXITY_API_DEFAULT = "https://api.bloxity.io";
export const BLOXITY_TIMEOUT_MS = 5000;
// The longest accepted Bloxity game token.
export const TOKEN_MAX_LEN = 2048;

// Players per room: 2-100 for Bloxity party play. The deploy workflow reads this number and sends
// it to Legion as the room size, so keep it a plain `= <number>;`.
export const ROOM_MAX_CLIENTS = 50;

// Longest accepted strings.
export const NAME_MAX = 64;
// Profile picture URL (Bloxity `pfp`).
export const PFP_MAX_LEN = 512;

// Colyseus drops the connection for a WebSocket message above this (default 4 KB).
export const MAX_PAYLOAD_BYTES = 64 * 1024;

// How long a dropped connection (WiFi blip, backgrounded tab) may reconnect with the same session.
export const RECONNECT_SECONDS = 20;

// Upper bounds for saved values, so a forged payload cannot store a bogus number. Generous
// ceilings, not game rules.
export const CURRENCY_MAX = 1e33; // damage, wins
export const REBIRTHS_MAX = 1e9;
export const PLAY_SECONDS_MAX = 31_536_000; // ~1 year
// Owned guns (client GUNS has 10), with slack.
export const OWNED_MAX = 64;

// Gun / ammo ids from the client's catalogs: slugs, so nothing odd is stored.
export const ID_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;

// The client's per-page-load id for players who are not signed in to Bloxity. Never saved.
export const GUEST_ID_PREFIX = "guest-";

// Bloxity's own boards on the trophy button. `id` is the saved PlayerDoc field reported; the client
// declares the same list with Legion.SDK.leaderboard.define (src/config.js BOARDS).
export const LEADERBOARD_STATS = ["rebirths", "wins"] as const;
export type LeaderboardStat = (typeof LEADERBOARD_STATS)[number];
export const BLOXITY_BOARDS = [
  { id: "rebirths", label: "Rebirths", order: "desc", mode: "best", format: "compact", reset: "none" },
  { id: "wins", label: "Wins", order: "desc", mode: "best", format: "compact", reset: "none" },
] as const;
export const REPORT_EVERY_MS = 15 * 1000;
export const REPORT_BATCH_MAX = 200;
// Account ids reported to Bloxity: `legion_<_id>` (any `#m...` suffix is stripped).
export const LEGION_PREFIX = "legion_";
