import { createServerFn } from "@tanstack/react-start";

import { detectLocaleFromRequestHeaders } from "@/lib/detect-locale.server";

export const detectRequestLocale = createServerFn({ method: "GET" }).handler(() => {
  return detectLocaleFromRequestHeaders();
});
