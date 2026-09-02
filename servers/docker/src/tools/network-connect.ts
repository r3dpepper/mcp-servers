import { z } from "zod";
import { connectNetwork } from "../docker-client.js";
import { clearCache } from "../cache.js";
import { ok, fail } from "./shared.js";

const schema = z.object({
  network: z.string().min(1).describe("Network name or ID"),
  container: z.string().min(1).describe("Container name or ID to attach"),
});

export const network_connect = {
  name: "docker_network_connect",
  description: "Connect a running container to a Docker network.",
  schema,
  handler: async ({ network, container }: z.infer<typeof schema>) => {
    try {
      await connectNetwork(network, container);
      clearCache();
      return ok(`Container ${container} connected to network ${network}.`);
    } catch (err) {
      return fail("Failed to connect container to network", err);
    }
  },
};
