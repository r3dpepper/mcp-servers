import { z } from "zod";
import { removeVolume } from "../docker-client.js";
import { clearCache } from "../cache.js";
import { ok, fail } from "./shared.js";

const schema = z.object({
  name: z.string().min(1).describe("Volume name"),
  force: z.boolean().optional().default(false).describe("Force remove even if in use"),
});

export const volume_remove = {
  name: "docker_volume_remove",
  description: "Remove a Docker volume. Data in the volume is lost.",
  schema,
  handler: async ({ name, force }: z.infer<typeof schema>) => {
    try {
      await removeVolume(name, force);
      clearCache();
      return ok(`Volume ${name} removed successfully.`);
    } catch (err) {
      return fail("Failed to remove volume", err);
    }
  },
};
