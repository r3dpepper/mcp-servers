import { z } from "zod";
import { pruneSystem } from "../docker-client.js";
import { clearCache } from "../cache.js";
import { ok, fail } from "./shared.js";

const schema = z.object({
  volumes: z.boolean().optional().default(false).describe("Also prune unused volumes (default: false)"),
});

export const system_prune = {
  name: "docker_system_prune",
  description:
    "Prune unused Docker objects (containers, images, networks). Optionally prune volumes too. Returns reclaimed space.",
  schema,
  handler: async ({ volumes }: z.infer<typeof schema>) => {
    try {
      const result = await pruneSystem(volumes);
      clearCache();

      const spaceMB = (result.SpaceReclaimed / (1024 * 1024)).toFixed(2);
      const parts = [`**Space reclaimed: ${spaceMB} MB**`];

      if (result.ContainersDeleted && result.ContainersDeleted.length > 0) {
        parts.push(`Containers deleted: ${result.ContainersDeleted.length}`);
      }
      if (result.ImagesDeleted && result.ImagesDeleted.length > 0) {
        parts.push(`Images deleted: ${result.ImagesDeleted.length}`);
      }
      if (result.VolumesDeleted && result.VolumesDeleted.length > 0) {
        parts.push(`Volumes deleted: ${result.VolumesDeleted.length}`);
      }

      return ok(parts.join("\n"));
    } catch (err) {
      return fail("Failed to prune", err);
    }
  },
};
