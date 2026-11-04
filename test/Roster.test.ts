import assert from "assert";
import type { ColyseusTestServer } from "@colyseus/testing";

import type appConfig from "../src/app.config.js";
import { WorldState } from "../src/rooms/schema/WorldState.js";
import { __setPlayersForTest } from "../src/db.js";
import { sleep } from "./fakePlayers.js";
import { testServer } from "./server.js";

describe("roster", () => {
  let colyseus: ColyseusTestServer<typeof appConfig>;
  before(async () => (colyseus = await testServer()));
  beforeEach(async () => await colyseus.cleanup());
  afterEach(() => __setPlayersForTest(null));

  it("lists each player with a bounded name and an http(s) pfp only", async () => {
    const room = await colyseus.createRoom<WorldState>("world", {});
    const a = await colyseus.connectTo(room, { userId: "guest-a", username: "A".repeat(200), pfp: "https://static.bloxity.io/a.png" });
    const b = await colyseus.connectTo(room, { userId: "guest-b", username: "Bea", pfp: "javascript:alert(1)" });
    await sleep(100);
    assert.strictEqual(room.state.players.size, 2);
    assert.strictEqual(room.state.players.get(a.sessionId)?.username.length, 64);
    assert.strictEqual(room.state.players.get(a.sessionId)?.pfp, "https://static.bloxity.io/a.png");
    assert.strictEqual(room.state.players.get(b.sessionId)?.pfp, "");
    assert.strictEqual(room.state.players.get(b.sessionId)?.signedIn, false);
  });

  it("syncs a bounded pose and look to the roster", async () => {
    const room = await colyseus.createRoom<WorldState>("world", {});
    const a = await colyseus.connectTo(room, { userId: "guest-a", username: "A" });
    a.send("pose", { x: 1.5, y: 2, z: -3, facing: 1, speed: 4, vy: 0, grounded: true, aim: 5, shots: 70000, gun: "ak" });
    a.send("look", { equipped: { hatId: "12", headId: "-1", bad: "<script>" }, proportions: { height: 1.1 }, skin: "https://x.io/s.png" });
    await sleep(100);
    const p = room.state.players.get(a.sessionId)!;
    assert.strictEqual(p.ready, true);
    assert.strictEqual(p.x, 1.5);
    assert.strictEqual(p.aim, 1);
    assert.strictEqual(p.gun, "ak");
    assert.deepStrictEqual(JSON.parse(p.look), { hatId: "12", headId: "-1" });
    assert.strictEqual(p.skin, "https://x.io/s.png");
    a.send("pose", { x: "nope" });
    await sleep(50);
    assert.strictEqual(p.x, 1.5);
  });
});
