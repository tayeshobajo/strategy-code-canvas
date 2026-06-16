import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";

export const getRequestOrigin = createServerFn({ method: "GET" }).handler(async () => {
  const proto = getRequestHeader("x-forwarded-proto") ?? "https";
  const host = getRequestHeader("host") ?? "";
  return host ? `${proto}://${host}` : "";
});
