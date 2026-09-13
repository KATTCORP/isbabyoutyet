import { createServerFn } from "@tanstack/react-start";
import { detectLocaleFromRequestHeaders } from "./locale-request-handler";

export const detectRequestLocale = createServerFn({ method: "GET" }).handler(
  detectLocaleFromRequestHeaders,
);
