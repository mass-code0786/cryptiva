import assert from "node:assert/strict";
import test from "node:test";

import { ACTIVATION_MIN_TRADE_AMOUNT } from "./activationService.js";
import { getActivationAudienceExpression, NOTIFICATION_AUDIENCES, NOTIFICATION_TYPES } from "./notificationService.js";

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
