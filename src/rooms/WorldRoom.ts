import { Room, Client, CloseCode } from "colyseus";
import { WorldState, PlayerState } from "./schema/WorldState.js";
import { GUEST_ID_PREFIX, LEGION_PREFIX, NAME_MAX, PFP_MAX_LEN, RECONNECT_SECONDS, ROOM_MAX_CLIENTS } from "../constants.js";
import { getPlayers, type PlayerDoc } from "../db.js";
import { sanitizeProgress } from "../sanitize.js";
import { verifyToken } from "../bloxity.js";
import { queueScores } from "../reporter.js";

function sanitizeName(raw: unknown): string {
  return typeof raw === "string" ? raw.slice(0, NAME_MAX) : "";
}

function sanitizePfp(raw: unknown): string {
  return typeof raw === "string" && raw.length <= PFP_MAX_LEN && /^https?:\/\//i.test(raw) ? raw : "";
}

interface IdentityMsg {
  username?: unknown;
  userId?: unknown;
  pfp?: unknown;
  token?: unknown;
}

/**
 * Room every client joins via `client.joinOrCreate("world", { userId, username, pfp, token })`.
 * Loads and saves each verified player's progress (MongoDB, see db.ts) -- the client keeps no save
 * of its own, so this is the only place progress lives. Client-authoritative: saves are only
 * bounded (sanitize.ts). Full rooms spill into a fresh one automatically (maxClients).
 */
export class WorldRoom extends Room<{ state: WorldState }> {
  state = new WorldState();
  maxClients = ROOM_MAX_CLIENTS;

  // sessionId -> account id (`legion_<id>`, or a dev id outside production). NOT part of
  // WorldState: it only gates this room's own Mongo reads/writes. Guests have no entry.
  userIds = new Map<string, string>();

  // sessionIds that already got a progress/noProgress answer for their current identity.
  private identified = new Set<string>();
  // sessionIds whose current identity's save has been read: only these may write. A save sent
  // before the load answered would overwrite the stored progress with a fresh player's defaults.
  private loaded = new Set<string>();
  // Latest identity request per session, so a slow token verify can't overwrite a newer one.
  private identSeq = new Map<string, number>();

  messages = {
    // Debounced push of the client's whole progress. Upserts, so a first save creates the document.
    saveProgress: async (client: Client, msg: unknown) => {
      const p = this.state.players.get(client.sessionId);
      const patch = sanitizeProgress(msg);
      const userId = this.userIds.get(client.sessionId);
      if (!p || !patch || !userId || !this.loaded.has(client.sessionId)) return;
      queueScores(userId, patch); // Bloxity boards, from saved state only
      const players = getPlayers();
      if (!players) return; // Mongo unset/unreachable -- degrade silently
      try {
        await players.updateOne(
          { _id: userId },
          // Display name comes from this connection's own PlayerState, not `msg`.
          { $set: { ...patch, username: p.username || "Player", updatedAt: new Date() }, $setOnInsert: { version: 1 } },
          { upsert: true },
        );
      } catch (err) {
        console.warn("[WorldRoom] saveProgress failed", err);
      }
    },
    // Re-states identity after a login/logout that happens AFTER join (a guest who signs in
    // mid-session). The server answers with progress/noProgress for the new identity.
    identify: (client: Client, msg: IdentityMsg) => {
      const p = this.state.players.get(client.sessionId);
      if (p) void this.applyIdentity(client, p, msg ?? {});
    },
  };

  onJoin(client: Client, options?: IdentityMsg) {
    const p = new PlayerState();
    p.username = sanitizeName(options?.username);
    p.pfp = sanitizePfp(options?.pfp);
    this.state.players.set(client.sessionId, p);
    void this.applyIdentity(client, p, options ?? {});
  }

  // A deliberate `room.leave()` closes with CONSENTED -- drop the player at once. Anything
  // else (WiFi blip, backgrounded tab) gets RECONNECT_SECONDS to reconnect with the same session.
  async onLeave(client: Client, code?: number) {
    if (code === CloseCode.CONSENTED) return this.forgetSession(client.sessionId);
    try {
      await this.allowReconnection(client, RECONNECT_SECONDS);
    } catch {
      this.forgetSession(client.sessionId);
    }
  }

  // Drops a session's per-connection bookkeeping.
  private forgetSession(sessionId: string) {
    this.state.players.delete(sessionId);
    this.userIds.delete(sessionId);
    this.identified.delete(sessionId);
    this.loaded.delete(sessionId);
    this.identSeq.delete(sessionId);
  }

  // Resolves who this connection is. With a `token`: verified through Bloxity (account id
  // `legion_<user._id>`, name/pfp from the verified user); an invalid / unreachable token = guest.
  // Without a token a client `userId` is trusted ONLY outside production (dev ids); `guest-` never.
  private async applyIdentity(client: Client, p: PlayerState, msg: IdentityMsg) {
    const seq = (this.identSeq.get(client.sessionId) ?? 0) + 1;
    this.identSeq.set(client.sessionId, seq);

    if (typeof msg.username === "string") p.username = sanitizeName(msg.username);
    if (typeof msg.pfp === "string") p.pfp = sanitizePfp(msg.pfp);

    let accountId = "";
    const token = typeof msg.token === "string" ? msg.token : "";
    if (token) {
      const user = await verifyToken(token);
      // Left, or asked again, while the verify was in flight.
      if (this.state.players.get(client.sessionId) !== p || this.identSeq.get(client.sessionId) !== seq) return;
      if (user) {
        accountId = `${LEGION_PREFIX}${user.id}`;
        if (user.username) p.username = sanitizeName(user.username);
        p.pfp = sanitizePfp(user.pfp);
      }
    } else if (process.env.NODE_ENV !== "production" && typeof msg.userId === "string") {
      const id = msg.userId.slice(0, 128);
      if (id && !id.startsWith(GUEST_ID_PREFIX)) accountId = id;
    }
    this.setAccount(client, p, accountId);
  }

  // Switches this session to `userId` ("" = guest) and answers with progress / noProgress / serverError.
  private setAccount(client: Client, p: PlayerState, userId: string) {
    const prev = this.userIds.get(client.sessionId) || "";
    // No change (e.g. a username-only identify) -- but the very first call must still answer.
    if (userId === prev && this.identified.has(client.sessionId)) return;
    this.identified.add(client.sessionId);
    this.loaded.delete(client.sessionId); // no writes until the new identity's save is read
    p.signedIn = !!userId;

    if (userId) {
      // Evict any OTHER live session on this account, so one account never has two Mongo writers
      // (a crashed tab lingers up to RECONNECT_SECONDS via allowReconnection in onLeave).
      for (const [sid, uid] of this.userIds) {
        if (sid === client.sessionId || uid !== userId) continue;
        this.forgetSession(sid);
        const stale = this.clients.find((c) => c.sessionId === sid);
        try {
          stale?.leave(CloseCode.CONSENTED);
        } catch {
          // Already gone -- nothing to clean up.
        }
      }
      this.userIds.set(client.sessionId, userId);
    } else {
      this.userIds.delete(client.sessionId);
    }

    void this.loadProgress(client, userId, p);
  }

  // Sends the saved doc ("progress"), or "noProgress" when there is nothing to load (new account,
  // guest, or Mongo unset). A failed read sends "serverError" and keeps saving off, so a save that
  // could not be read is never overwritten.
  private async loadProgress(client: Client, userId: string, p: PlayerState) {
    const players = getPlayers();
    let doc: PlayerDoc | null = null;
    if (userId && players) {
      try {
        doc = await players.findOne({ _id: userId });
      } catch (err) {
        console.warn("[WorldRoom] loadProgress failed", err);
        client.send("serverError", {});
        return;
      }
    }
    // The player may have left, or switched identity again, while the read was in flight.
    if (this.state.players.get(client.sessionId) !== p || (this.userIds.get(client.sessionId) ?? "") !== userId) return;

    this.loaded.add(client.sessionId);
    if (!doc) client.send("noProgress", {});
    else client.send("progress", sanitizeProgress(doc) ?? {});
  }
}
