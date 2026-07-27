import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Phase-one native shell.
 *
 * The existing Next.js application depends on Vercel server routes and
 * middleware, so device builds currently load the stable production origin.
 * `server.url` should be removed once the client UI is emitted as a local
 * bundle; Capacitor documents it as a live-reload option, not a final App
 * Store deployment strategy.
 */
const config: CapacitorConfig = {
  appId: "com.cyrus.memeus",
  appName: "Meme Us",
  webDir: "native-web",
  backgroundColor: "#FFF8EC",
  loggingBehavior: "production",
  server: {
    url: process.env.CAPACITOR_SERVER_URL || "https://meme-us.vercel.app",
    cleartext: false,
    errorPath: "offline.html",
  },
  ios: {
    backgroundColor: "#FFF8EC",
    preferredContentMode: "mobile",
    contentInset: "never",
    allowsLinkPreview: false,
    handleApplicationNotifications: true,
  },
};

export default config;
