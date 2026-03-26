import api from "./api";

export type DemoBotFeedItem = {
  _id: string;
  asset: "BTC" | "BNB" | "ETH" | "SOL" | "XRP";
  resultType: "profit" | "loss";
  amount: number;
  createdAt: string;
  isDemo: true;
  visibilityScope: "global";
  status?: "live_demo";
};

export type DemoBotFeedResponse = {
  scope: "global";
  isDemoOnly: true;
  disclaimer: string;
  items: DemoBotFeedItem[];
};

export const fetchDemoBotFeed = (limit = 60) =>
  api.get<DemoBotFeedResponse>("/demo-bot/feed", {
    params: { limit },
  });
