import { z } from "zod";
import { restartContainer } from "../docker-client.js";
import { clearCache } from "../cache.js";
import { ok, fail } from "./shared.js";

const schema = z.object({
  id: z.string().min(1).describe("Container ID or name"),
});

export const container_restart = {
  name: "docker_container_restart",
  description: "Restart a Docker container.",
  schema,
  handler: async ({ id }: z.infer<typeof schema>) => {
    try {
      await restartContainer(id);
      clearCache();
      return ok(`Container ${id} restarted successfully.`);
    } catch (err) {
      return fail("Failed to restart container", err);
    }
  },
};
