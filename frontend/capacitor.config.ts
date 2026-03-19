import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "world.cryptiva.app",
  appName: "Cryptiva",
  webDir: "dist",
  server: {
    androidScheme: "https",
  },
};

export default config;
