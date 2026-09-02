import { z } from "zod";
import { disconnectNetwork } from "../docker-client.js";
import { clearCache } from "../cache.js";
import { ok, fail } from "./shared.js";

const schema = z.object({
  network: z.string().min(1).describe("Network name or ID"),
  container: z.string().min(1).describe("Container name or ID to detach"),
  force: z.boolean().optional().default(false).describe("Force disconnect even if container is using it"),
});

export const network_disconnect = {
  name: "docker_network_disconnect",
  description: "Disconnect a container from a Docker network.",
  schema,
  handler: async ({ network, container, force }: z.infer<typeof schema>) => {
    try {
      await disconnectNetwork(network, container, force);
      clearCache();
      return ok(`Container ${container} disconnected from network ${network}.`);
    } catch (err) {
      return fail("Failed to disconnect container from network", err);
    }
  },
};
