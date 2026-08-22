import { z } from "zod";
import { getSystemDf } from "../docker-client.js";
import { getCached, setCached } from "../cache.js";
import { ok, fail } from "./shared.js";

const schema = z.object({});

export const system_df = {
  name: "docker_system_df",
  description:
    "Show Docker disk usage (images, containers, volumes, build cache).",
  schema,
  handler: async () => {
    try {
      let df = getCached<unknown>("system_df");
      if (!df) {
        df = await getSystemDf();
        setCached("system_df", df);
      }
      return ok(JSON.stringify(df, null, 2));
    } catch (err) {
      return fail("Failed to get disk usage", err);
    }
  },
};
