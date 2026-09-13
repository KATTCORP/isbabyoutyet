import * as z from "zod";
import { lazyGetter } from "./utils";

export const convexEnvSchema = z.object({
  BETTER_AUTH_SECRET: z.string().min(1),
  VAPID_PUBLIC_KEY: z.string().min(1),
  VAPID_PRIVATE_KEY: z.string().min(1),
  VAPID_SUBJECT: z.string().optional().default("mailto:admin@isbabyoutyet.com"),
  SITE_URL: z.url("SITE_URL must be a valid URL"),
});

export const convexEnv = lazyGetter(() => {
  return convexEnvSchema.parse(process.env);
});
