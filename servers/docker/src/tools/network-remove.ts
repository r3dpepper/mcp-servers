import { z } from "zod";
import { removeNetwork } from "../docker-client.js";
import { clearCache } from "../cache.js";
import { ok, fail } from "./shared.js";

const schema = z.object({
  id: z.string().min(1).describe("Network name or ID"),
});

export const network_remove = {
  name: "docker_network_remove",
  description: "Remove a Docker network. Containers must be disconnected first.",
  schema,
  handler: async ({ id }: z.infer<typeof schema>) => {
    try {
      await removeNetwork(id);
      clearCache();
      return ok(`Network ${id} removed successfully.`);
    } catch (err) {
      return fail("Failed to remove network", err);
    }
  },
};
