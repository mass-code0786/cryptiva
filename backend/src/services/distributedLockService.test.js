import test from "node:test";
import assert from "node:assert/strict";

import { acquireDistributedLock, extendDistributedLock, releaseDistributedLock } from "./distributedLockService.js";

const createSettingModel = () => {
  const records = new Map();

  return {
    findOneAndUpdate: async (query, update, options) => {
      const key = String(query.key);
      const now = Date.now();
      const current = records.get(key);
      const expired = !current || Number(current.valueNumber || 0) <= now;
      if (!expired) {
        return current;
      }
      if (options?.upsert || current) {
        const next = {
          key,
          valueString: update.$set.valueString,
          valueNumber: update.$set.valueNumber,
          metadata: update.$set.metadata,
        };
        records.set(key, next);
        return next;
      }
      return current || null;
    },
    updateOne: async (query, update) => {
      const key = String(query.key);
      const owner = String(query.valueString || "");
      const current = records.get(key);
      if (!current) return { modifiedCount: 0 };
      if (String(current.valueString) !== owner) return { modifiedCount: 0 };
      current.valueNumber = update.$set.valueNumber;
      current.metadata = update.$set.metadata;
      records.set(key, current);
      return { modifiedCount: 1 };
    },
  };
};

test("two simulated instances contending for same lock produce single winner", async () => {
  const SettingModel = createSettingModel();
  const key = "trade_engine:settle_active_trades:v1";

  const [first, second] = await Promise.all([
    acquireDistributedLock({ key, ttlMs: 60000, owner: "instance-a", deps: { SettingModel } }),
    acquireDistributedLock({ key, ttlMs: 60000, owner: "instance-b", deps: { SettingModel } }),
  ]);

  assert.equal(Number(first.acquired) + Number(second.acquired), 1);
});

test("released lock can be reacquired safely", async () => {
  const SettingModel = createSettingModel();
  const key = "trade_engine:settle_active_trades:v1";

  const first = await acquireDistributedLock({ key, ttlMs: 60000, owner: "instance-a", deps: { SettingModel } });
  const release = await releaseDistributedLock({ key, owner: "instance-a", deps: { SettingModel } });
  const second = await acquireDistributedLock({ key, ttlMs: 60000, owner: "instance-b", deps: { SettingModel } });

  assert.equal(first.acquired, true);
  assert.equal(release.released, true);
  assert.equal(second.acquired, true);
});

test("lock can be extended only by current owner while unexpired", async () => {
  const SettingModel = createSettingModel();
  const key = "trade_engine:settle_active_trades:v1";

  const first = await acquireDistributedLock({ key, ttlMs: 60000, owner: "instance-a", deps: { SettingModel } });
  const extendByOwner = await extendDistributedLock({ key, owner: "instance-a", ttlMs: 60000, deps: { SettingModel } });
  const extendByOther = await extendDistributedLock({ key, owner: "instance-b", ttlMs: 60000, deps: { SettingModel } });

  assert.equal(first.acquired, true);
  assert.equal(extendByOwner.extended, true);
  assert.equal(extendByOther.extended, false);
});
