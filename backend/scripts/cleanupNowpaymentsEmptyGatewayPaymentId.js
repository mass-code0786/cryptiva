import mongoose from "mongoose";

import { MONGO_URI } from "../src/config/env.js";
import Deposit from "../src/models/Deposit.js";

const run = async () => {
  await mongoose.connect(MONGO_URI);

  const filter = {
    gateway: "nowpayments",
    gatewayPaymentId: { $in: ["", "null", "undefined"] },
  };

  const before = await Deposit.countDocuments(filter);
  const result = await Deposit.updateMany(filter, { $unset: { gatewayPaymentId: 1 } });
  const after = await Deposit.countDocuments(filter);

  console.log(
    JSON.stringify(
      {
        matched: before,
        modified: Number(result?.modifiedCount || 0),
        remainingInvalid: after,
      },
      null,
      2
    )
  );

  await mongoose.disconnect();
};

run().catch(async (error) => {
  console.error(error);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});

