import { schema, t, type SchemaType } from "@colyseus/schema";

// The live roster: who is in the room. Durable progress lives in Mongo (src/db.ts).
export const PlayerState = schema(
  {
    username: t.string().default(""), // Bloxity displayName/username (verified when signed in)
    signedIn: t.boolean().default(false), // has a verified Bloxity id: only these are saved
    pfp: t.string().default(""), // Bloxity profile picture URL ("" = none)
    // Live pose, streamed by the owner (client-authoritative, only bounded: see sanitize.ts).
    x: t.float32().default(0),
    y: t.float32().default(0), // feet
    z: t.float32().default(0),
    facing: t.float32().default(0), // yaw the model faces, radians
    speed: t.float32().default(0), // horizontal speed, drives the walk cycle
    vy: t.float32().default(0),
    grounded: t.boolean().default(true),
    aim: t.float32().default(0), // 0..1 gun-raised blend
    shots: t.uint16().default(0), // counter: each change = one shot (recoil / flash)
    gun: t.string().default(""), // equipped gun id
    // Look, sent once on join and when the avatar changes.
    look: t.string().default(""), // JSON of SDK avatar.getEquipped()
    skin: t.string().default(""), // composed skin texture URL
    prop: t.string().default(""), // JSON of SDK avatar.getProportions()
    ready: t.boolean().default(false), // has sent a pose at least once
  },
  "PlayerState",
);
export type PlayerState = SchemaType<typeof PlayerState>;

export const WorldState = schema(
  {
    players: t.map(PlayerState), // keyed by sessionId
  },
  "WorldState",
);
export type WorldState = SchemaType<typeof WorldState>;
