/**
 * Tiny `convex deploy --cmd` so start_push runs immediately after claim.
 * The real web build runs after a successful push (see deploy-convex.ts).
 */
import fs from "node:fs";

const urlFile = process.env.CONVEX_URL_FILE;
const convexUrl = process.env.VITE_CONVEX_URL;
if (!urlFile) {
  throw new Error("CONVEX_URL_FILE is not set");
}
if (!convexUrl) {
  throw new Error("VITE_CONVEX_URL is not set (expected from convex deploy --cmd)");
}
fs.writeFileSync(urlFile, convexUrl);
