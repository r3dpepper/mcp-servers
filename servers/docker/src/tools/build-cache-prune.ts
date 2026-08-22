import { z } from "zod";
import { pruneBuildCache } from "../docker-client.js";
import { clearCache } from "../cache.js";
import { ok, fail } from "./shared.js";

const schema = z.object({
  all: z.boolean().optional().default(false).describe("Remove all cache, not just dangling (default: false)"),
});

export const build_cache_prune = {
  name: "docker_build_cache_prune",
  description: "Clear Docker build cache. Returns reclaimed disk space.",
  schema,
  handler: async ({ all }: z.infer<typeof schema>) => {
    try {
      const result = await pruneBuildCache(all);
      clearCache();
      const spaceMB = (result.SpaceReclaimed / (1024 * 1024)).toFixed(2);
      return ok(`Build cache pruned. Space reclaimed: ${spaceMB} MB`);
    } catch (err) {
      return fail("Failed to prune build cache", err);
    }
  },
};
