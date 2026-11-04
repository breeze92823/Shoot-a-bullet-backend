import assert from "assert";

import { sanitizeProgress } from "../src/sanitize.js";

describe("sanitizeProgress", () => {
  it("rejects non-objects", () => {
    assert.strictEqual(sanitizeProgress(null), null);
    assert.strictEqual(sanitizeProgress([1]), null);
    assert.strictEqual(sanitizeProgress("x"), null);
  });

  it("keeps good values and clamps bad ones", () => {
    const p = sanitizeProgress({ damage: 5e4, wins: -3, rebirths: 2.7, playTime: 1e12, ammo: "gold", extra: 1 })!;
    assert.strictEqual(p.damage, 5e4);
    assert.strictEqual(p.wins, 0);
    assert.strictEqual(p.rebirths, 2);
    assert.strictEqual(p.playTime, 31_536_000);
    assert.strictEqual(p.ammo, "gold");
    assert.ok(!("extra" in p));
  });

  it("ignores non-finite numbers and odd ids", () => {
    const p = sanitizeProgress({ damage: NaN, wins: Infinity, ammo: "bad id!", gun: "../x" })!;
    assert.deepStrictEqual(p, {});
  });

  it("requires the equipped gun to be owned", () => {
    assert.strictEqual(sanitizeProgress({ owned: ["glock", "ak", "ak", 4], gun: "ak" })!.gun, "ak");
    assert.deepStrictEqual(sanitizeProgress({ owned: ["glock", "ak", "ak"] })!.owned, ["glock", "ak"]);
    assert.strictEqual(sanitizeProgress({ owned: ["glock"], gun: "ak" })!.gun, undefined);
  });
});
