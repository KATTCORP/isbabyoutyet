import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";
import { ADMIN_TABS } from "@/routes/_auth/dashboard_.admin/route";

/** `?tab=` is the pre-route tab state; keep old bookmarks landing on the right tab. */
const adminIndexSearchSchema = z.object({
  tab: z.enum(ADMIN_TABS).default("babies"),
});

export const Route = createFileRoute("/_auth/dashboard_/admin/")({
  validateSearch: adminIndexSearchSchema,
  beforeLoad: (opts) => {
    throw redirect({ replace: true, to: `/dashboard/admin/${opts.search.tab}` });
  },
});
