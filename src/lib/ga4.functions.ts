/**
 * Thin server-function wrapper for the internal GA4 snapshot.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const fetchGaSnapshot = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ passcode: z.string().min(1).max(200) }).parse(data))
  .handler(async ({ data }) => {
    const { getGaSnapshot, passcodeMatches } = await import("./ga4.server");
    if (!passcodeMatches(data.passcode)) {
      throw new Error("Invalid passcode");
    }
    return getGaSnapshot();
  });
