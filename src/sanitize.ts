import { CURRENCY_MAX, ID_PATTERN, OWNED_MAX, PLAY_SECONDS_MAX, REBIRTHS_MAX } from "./constants.js";
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
