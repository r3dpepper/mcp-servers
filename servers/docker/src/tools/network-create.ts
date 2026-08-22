import { z } from "zod";
import { createNetwork } from "../docker-client.js";
import { clearCache } from "../cache.js";
import { ok, fail } from "./shared.js";

const schema = z.object({
  name: z.string().min(1).describe("Network name"),
  driver: z.string().optional().default("bridge").describe("Network driver (bridge, host, overlay)"),
});

export const network_create = {
  name: "docker_network_create",
  description: "Create a Docker network.",
  schema,
  handler: async ({ name, driver }: z.infer<typeof schema>) => {
    try {
      await createNetwork(name, driver);
      clearCache();
      return ok(`Network ${name} created successfully (${driver}).`);
    } catch (err) {
      return fail("Failed to create network", err);
    }
  },
};
