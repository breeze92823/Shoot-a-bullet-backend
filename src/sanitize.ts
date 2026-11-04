import { LOOK_MAX_LEN, SKIN_MAX_LEN, WORLD_LIMIT, CURRENCY_MAX, ID_PATTERN, OWNED_MAX, PLAY_SECONDS_MAX, REBIRTHS_MAX } from "./constants.js";
import type { PlayerDoc } from "./db.js";

export function finite(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}
export function clampNum(v: number, max: number): number {
  return Math.min(max, Math.max(0, v));
}
export function clampInt(v: number, max: number, min = 0): number {
  return Math.min(max, Math.max(min, Math.floor(v)));
}
function isObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}
const isId = (v: unknown): v is string => typeof v === "string" && ID_PATTERN.test(v);

// Catalog ids: slug strings, no duplicates, bounded count.
export function sanitizeIds(raw: unknown, max = OWNED_MAX): string[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter(isId))].slice(0, max);
}

// The game is client-authoritative -- no server-side gameplay validation. What IS enforced:
// shape and bounds, so a malformed payload can never corrupt this player's own Mongo document.
// A forged number can only ever affect the sender's own save. Only fields present in `raw` are returned.
export function sanitizeProgress(raw: unknown): Partial<PlayerDoc> | null {
  if (!isObject(raw)) return null;
  const out: Partial<PlayerDoc> = {};

  if (finite(raw.damage)) out.damage = clampNum(raw.damage, CURRENCY_MAX);
  if (finite(raw.wins)) out.wins = clampNum(raw.wins, CURRENCY_MAX);
  if (finite(raw.rebirths)) out.rebirths = clampInt(raw.rebirths, REBIRTHS_MAX);
  if (finite(raw.playTime)) out.playTime = clampInt(raw.playTime, PLAY_SECONDS_MAX);

  if (raw.owned !== undefined) out.owned = sanitizeIds(raw.owned);
  if (raw.perks !== undefined) out.perks = sanitizeIds(raw.perks);
  // The equipped gun must be an owned one (when this save carries the list).
  if (isId(raw.gun) && (!out.owned || out.owned.includes(raw.gun))) out.gun = raw.gun;
  if (isId(raw.ammo)) out.ammo = raw.ammo;
  return out;
}

// --- Live pose / look (what other players see) -------------------------------------------------
export interface Pose {
  x: number;
  y: number;
  z: number;
  facing: number;
  speed: number;
  vy: number;
  grounded: boolean;
  aim: number;
  shots: number;
  gun?: string;
}

const lim = (v: unknown, max: number, d = 0) => (finite(v) ? Math.min(max, Math.max(-max, v)) : d);

export function sanitizePose(raw: unknown): Pose | null {
  if (!isObject(raw) || !finite(raw.x) || !finite(raw.y) || !finite(raw.z)) return null;
  return {
    x: lim(raw.x, WORLD_LIMIT),
    y: lim(raw.y, WORLD_LIMIT),
    z: lim(raw.z, WORLD_LIMIT),
    facing: lim(raw.facing, 100),
    speed: clampNum(finite(raw.speed) ? raw.speed : 0, 60),
    vy: lim(raw.vy, 100),
    grounded: raw.grounded !== false,
    aim: clampNum(finite(raw.aim) ? raw.aim : 0, 1),
    shots: finite(raw.shots) ? Math.floor(raw.shots) & 0xffff : 0,
    gun: isId(raw.gun) ? raw.gun : undefined,
  };
}

// A JSON object of short scalar values (equipped avatar ids / proportions). Returns the
// re-serialised, bounded string, or "" when it is not usable.
export function sanitizeJsonMap(raw: unknown, maxLen = LOOK_MAX_LEN): string {
  let obj: unknown = raw;
  if (typeof raw === "string") {
    if (raw.length > maxLen) return "";
    try {
      obj = JSON.parse(raw);
    } catch {
      return "";
    }
  }
  if (!isObject(obj)) return "";
  const out: Record<string, string | number | null> = {};
  for (const [k, v] of Object.entries(obj).slice(0, 40)) {
    if (!/^[A-Za-z0-9_]{1,32}$/.test(k)) continue;
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    else if (typeof v === "string" && /^[A-Za-z0-9_.:-]{0,64}$/.test(v)) out[k] = v;
    else if (v === null) out[k] = null;
  }
  const s = JSON.stringify(out);
  return s.length <= maxLen ? s : "";
}

export function sanitizeSkinUrl(raw: unknown): string {
  return typeof raw === "string" && raw.length <= SKIN_MAX_LEN && /^https:\/\//i.test(raw) ? raw : "";
}
