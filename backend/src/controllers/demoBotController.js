import { asyncHandler } from "../middleware/errorHandler.js";
import { createNextGlobalDemoBotEntry, listGlobalDemoBotFeed } from "../services/demoBotSimulationService.js";

export const getGlobalDemoBotFeed = asyncHandler(async (req, res) => {
  const limit = Number(req.query.limit) || 60;
  const items = await listGlobalDemoBotFeed({ limit });

  res.json({
    scope: "global",
    isDemoOnly: true,
    disclaimer:
      "Demo Only - This is a shared simulated activity feed for presentation purposes. It is not real trading and does not affect your wallet or account.",
    items,
  });
});

export const generateNextDemoBotEntry = asyncHandler(async (_req, res) => {
  const item = await createNextGlobalDemoBotEntry();
  res.status(201).json({
    message: "Global demo bot entry generated",
    item,
  });
});
