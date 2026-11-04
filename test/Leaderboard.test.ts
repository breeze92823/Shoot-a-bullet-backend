import assert from "assert";
import type { ColyseusTestServer } from "@colyseus/testing";

import type appConfig from "../src/app.config.js";
import { WorldState } from "../src/rooms/schema/WorldState.js";
import { __setPlayersForTest, type PlayerDoc } from "../src/db.js";
import { LEADERBOARD_SIZE } from "../src/constants.js";
import { __resetLeaderboardForTest } from "../src/leaderboard.js";
import { fakePlayers, sleep } from "./fakePlayers.js";
import { testServer } from "./server.js";

const doc = (id: string, f: Partial<PlayerDoc>): PlayerDoc => ({ _id: id, version: 1, updatedAt: new Date(), ...f });

describe("leaderboard", () => {
  let colyseus: ColyseusTestServer<typeof appConfig>;
  before(async () => (colyseus = await testServer()));
  beforeEach(async () => {
    await colyseus.cleanup();
    __resetLeaderboardForTest();
  });
  afterEach(() => __setPlayersForTest(null));

  it("sends the top saved players per stat and the player's own ranks after the load", async () => {
    const seed = [
      doc("u1", { username: "Ann", rebirths: 3, topWins: 500, topDamage: 60 }),
      doc("u2", { username: "Bo", rebirths: 9, topWins: 100, topDamage: 7200 }),
      ...Array.from({ length: 15 }, (_, i) => doc(`x${i}`, { username: `P${i}`, topWins: 1000 + i })),
    ];
    const fake = fakePlayers(seed);
    __setPlayersForTest(fake);
    const room = await colyseus.createRoom<WorldState>("world", {});
    const c = await colyseus.connectTo(room, { userId: "u1", username: "Ann" });
    let got: any = null;
    c.onMessage("leaderboard", (m: any) => (got = m));
    c.onMessage("progress", () => {});
    fake.release();
    await sleep(200);
    assert.ok(got, "leaderboard sent after the load");
    assert.deepStrictEqual(got.boards.rebirths, [{ name: "Bo", value: 9 }, { name: "Ann", value: 3 }]);
    assert.strictEqual(got.boards.wins.length, LEADERBOARD_SIZE);
    assert.deepStrictEqual(got.boards.wins[0], { name: "P14", value: 1014 });
    assert.strictEqual(got.boards.damage[0].name, "Bo");
    assert.deepStrictEqual(got.ranks, { wins: 16, rebirths: 2, damage: 2 });
  });

  it("gives a player with no save the lists and no ranks", async () => {
    const fake = fakePlayers([doc("u1", { username: "Ann", rebirths: 3 })]);
    __setPlayersForTest(fake);
    const room = await colyseus.createRoom<WorldState>("world", {});
    const c = await colyseus.connectTo(room, { userId: "u9", username: "New" });
    let got: any = null;
    c.onMessage("leaderboard", (m: any) => (got = m));
    c.onMessage("noProgress", () => {});
    fake.release();
    await sleep(200);
    assert.deepStrictEqual(got?.boards.rebirths, [{ name: "Ann", value: 3 }]);
    assert.deepStrictEqual(got?.ranks, { wins: null, rebirths: null, damage: null });
  });

  it("keeps peaks when Wins are spent or Damage resets on a rebirth", async () => {
    const fake = fakePlayers([doc("u1", { username: "Ann", wins: 5000, damage: 900, topWins: 5000, topDamage: 900, rebirths: 2 })]);
    __setPlayersForTest(fake);
    const room = await colyseus.createRoom<WorldState>("world", {});
    const c = await colyseus.connectTo(room, { userId: "u1", username: "Ann" });
    c.onMessage("progress", () => {});
    c.onMessage("leaderboard", () => {});
    fake.release();
    await sleep(150);
    c.send("saveProgress", { wins: 100, damage: 0, rebirths: 1 }); // spent, reset, stale rebirth count
    await sleep(150);
    const d = fake.docs.get("u1")! as any;
    assert.strictEqual(d.wins, 100, "current wins are saved as sent");
    assert.strictEqual(d.damage, 0);
    assert.strictEqual(d.topWins, 5000);
    assert.strictEqual(d.topDamage, 900);
    assert.strictEqual(d.rebirths, 2, "rebirths never go down");

    c.send("saveProgress", { wins: 9000, damage: 1200, rebirths: 3 });
    await sleep(150);
    assert.strictEqual((fake.docs.get("u1") as any).topWins, 9000);
    assert.strictEqual((fake.docs.get("u1") as any).topDamage, 1200);
    assert.strictEqual((fake.docs.get("u1") as any).rebirths, 3);
  });
});
