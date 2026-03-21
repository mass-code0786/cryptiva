import assert from "node:assert/strict";
import test from "node:test";

import { ACTIVATION_MIN_TRADE_AMOUNT } from "./activationService.js";
import { getActivationAudienceExpression, NOTIFICATION_AUDIENCES, NOTIFICATION_TYPES, sendNotificationBroadcast } from "./notificationService.js";

const id = (suffix) => `507f1f77bcf86cd7994390${suffix}`;
const SENDER_ID = id("00");

const createFindMock = ({ allUsers = [], selectedUsers = [] } = {}) => (query = {}) => ({
  select() {
    return {
      lean: async () => {
        if (query?._id?.$in) {
          return selectedUsers;
        }
        return allUsers;
      },
    };
  },
});

const createBroadcastModelMock = () => {
  const records = [];

  return {
    records,
    async findOne(query) {
      return (
        records.find(
          (row) =>
            String(row.senderId) === String(query.senderId) &&
            String(row.idempotencyKey || "") === String(query.idempotencyKey || "")
        ) || null
      );
    },
    async create(payload) {
      const doc = {
        ...payload,
        _id: id(String(records.length + 10)),
        createdAt: new Date(),
        updatedAt: new Date(),
        async save() {
          this.updatedAt = new Date();
          return this;
        },
      };
      records.push(doc);
      return doc;
    },
  };
};

const createNotificationModelMock = () => {
  const deliveredKeys = new Set();
  const batches = [];

  return {
    deliveredKeys,
    batches,
    async bulkWrite(operations) {
      batches.push(operations);
      let upsertedCount = 0;
      for (const op of operations) {
        const filter = op?.updateOne?.filter || {};
        const key = `${String(filter.broadcastId)}:${String(filter.userId)}`;
        if (!deliveredKeys.has(key)) {
          deliveredKeys.add(key);
          upsertedCount += 1;
        }
      }
      return { upsertedCount };
    },
  };
};

test("notification audience/type enums include required options", () => {
  assert.deepEqual(NOTIFICATION_AUDIENCES, ["all", "selected", "active", "inactive"]);
  assert.deepEqual(NOTIFICATION_TYPES, ["announcement", "system", "admin"]);
});

test("activation audience expression keeps existing activation rule signals", () => {
  const pipeline = getActivationAudienceExpression();
  assert.ok(Array.isArray(pipeline));
  assert.ok(pipeline.length >= 4);

  const addFieldsStage = pipeline.find((entry) => entry.$addFields);
  assert.ok(addFieldsStage);
  const activationOr = addFieldsStage.$addFields?.isActivated?.$or || [];
  const asText = JSON.stringify(activationOr);

  assert.ok(asText.includes("mlmEligible"));
  assert.ok(asText.includes("packageStatus"));
  assert.ok(asText.includes(String(ACTIVATION_MIN_TRADE_AMOUNT)));
});

test("send notification to all users succeeds and tracks delivered count", async () => {
  const UserModel = {
    find: createFindMock({
      allUsers: [{ _id: id("01") }, { _id: id("02") }],
    }),
    aggregate: async () => [],
  };
  const NotificationBroadcastModel = createBroadcastModelMock();
  const NotificationModel = createNotificationModelMock();
  let activityCalls = 0;

  const { broadcast, insertedCount, deduplicated } = await sendNotificationBroadcast({
    senderId: SENDER_ID,
    title: "All Users",
    message: "Hello everyone",
    audienceType: "all",
    type: "announcement",
    idempotencyKey: "all-users-1",
    deps: {
      UserModel,
      NotificationModel,
      NotificationBroadcastModel,
      createActivityLogFn: async () => {
        activityCalls += 1;
      },
    },
  });

  assert.equal(deduplicated, false);
  assert.equal(insertedCount, 2);
  assert.equal(broadcast.recipientCount, 2);
  assert.equal(broadcast.deliveredCount, 2);
  assert.equal(activityCalls, 1);
});

test("send notification to selected users only", async () => {
  const selected = [{ _id: id("11") }, { _id: id("12") }];
  const UserModel = {
    find: createFindMock({ selectedUsers: selected }),
    aggregate: async () => [],
  };
  const NotificationBroadcastModel = createBroadcastModelMock();
  const NotificationModel = createNotificationModelMock();

  const { broadcast, insertedCount } = await sendNotificationBroadcast({
    senderId: SENDER_ID,
    title: "Selected Users",
    message: "Hello selected",
    audienceType: "selected",
    selectedUserIds: [id("11"), id("12"), id("13")],
    idempotencyKey: "selected-users-1",
    deps: {
      UserModel,
      NotificationModel,
      NotificationBroadcastModel,
      createActivityLogFn: async () => {},
    },
  });

  assert.equal(insertedCount, 2);
  assert.equal(broadcast.recipientCount, 2);
  assert.deepEqual(
    broadcast.selectedUserIds.map((value) => String(value)),
    [id("11"), id("12"), id("13")]
  );
});

test("send notification to active users uses aggregate audience", async () => {
  const UserModel = {
    find: createFindMock({}),
    aggregate: async () => [{ _id: id("21") }, { _id: id("22") }, { _id: id("23") }],
  };
  const NotificationBroadcastModel = createBroadcastModelMock();
  const NotificationModel = createNotificationModelMock();

  const { insertedCount, broadcast } = await sendNotificationBroadcast({
    senderId: SENDER_ID,
    title: "Active Users",
    message: "Hello active",
    audienceType: "active",
    idempotencyKey: "active-users-1",
    deps: {
      UserModel,
      NotificationModel,
      NotificationBroadcastModel,
      createActivityLogFn: async () => {},
    },
  });

  assert.equal(insertedCount, 3);
  assert.equal(broadcast.recipientCount, 3);
});

test("send notification to inactive users uses aggregate audience", async () => {
  const UserModel = {
    find: createFindMock({}),
    aggregate: async () => [{ _id: id("31") }],
  };
  const NotificationBroadcastModel = createBroadcastModelMock();
  const NotificationModel = createNotificationModelMock();

  const { insertedCount, broadcast } = await sendNotificationBroadcast({
    senderId: SENDER_ID,
    title: "Inactive Users",
    message: "Hello inactive",
    audienceType: "inactive",
    idempotencyKey: "inactive-users-1",
    deps: {
      UserModel,
      NotificationModel,
      NotificationBroadcastModel,
      createActivityLogFn: async () => {},
    },
  });

  assert.equal(insertedCount, 1);
  assert.equal(broadcast.recipientCount, 1);
});

test("same idempotency key reuses existing broadcast safely", async () => {
  const UserModel = {
    find: createFindMock({ allUsers: [{ _id: id("41") }] }),
    aggregate: async () => [],
  };
  const NotificationBroadcastModel = createBroadcastModelMock();
  const NotificationModel = createNotificationModelMock();

  const first = await sendNotificationBroadcast({
    senderId: SENDER_ID,
    title: "Idempotent",
    message: "First send",
    audienceType: "all",
    idempotencyKey: "same-key",
    deps: {
      UserModel,
      NotificationModel,
      NotificationBroadcastModel,
      createActivityLogFn: async () => {},
    },
  });

  const second = await sendNotificationBroadcast({
    senderId: SENDER_ID,
    title: "Idempotent",
    message: "Second send retry",
    audienceType: "all",
    idempotencyKey: "same-key",
    deps: {
      UserModel,
      NotificationModel,
      NotificationBroadcastModel,
      createActivityLogFn: async () => {},
    },
  });

  assert.equal(first.deduplicated, false);
  assert.equal(second.deduplicated, true);
  assert.equal(NotificationBroadcastModel.records.length, 1);
  assert.equal(second.insertedCount, 0);
});

test("bulk upsert payload does not manually set updatedAt/createdAt to avoid timestamp conflict", async () => {
  const UserModel = {
    find: createFindMock({ allUsers: [{ _id: id("51") }] }),
    aggregate: async () => [],
  };
  const NotificationBroadcastModel = createBroadcastModelMock();
  const NotificationModel = createNotificationModelMock();

  await sendNotificationBroadcast({
    senderId: SENDER_ID,
    title: "Timestamp Check",
    message: "No updatedAt conflict",
    audienceType: "all",
    idempotencyKey: "timestamp-check",
    deps: {
      UserModel,
      NotificationModel,
      NotificationBroadcastModel,
      createActivityLogFn: async () => {},
    },
  });

  const firstBatch = NotificationModel.batches[0] || [];
  assert.ok(firstBatch.length > 0);
  const setOnInsert = firstBatch[0]?.updateOne?.update?.$setOnInsert || {};
  assert.equal(Object.prototype.hasOwnProperty.call(setOnInsert, "updatedAt"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(setOnInsert, "createdAt"), false);
});
