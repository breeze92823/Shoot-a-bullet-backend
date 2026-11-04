import { schema, t, type SchemaType } from "@colyseus/schema";

// The live roster: who is in the room. Durable progress lives in Mongo (src/db.ts).
export const PlayerState = schema(
  {
    username: t.string().default(""), // Bloxity displayName/username (verified when signed in)
    signedIn: t.boolean().default(false), // has a verified Bloxity id: only these are saved
    pfp: t.string().default(""), // Bloxity profile picture URL ("" = none)
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
