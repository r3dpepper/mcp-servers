import { z } from "zod";
import { createVolume } from "../docker-client.js";
import { clearCache } from "../cache.js";
import { ok, fail } from "./shared.js";

const schema = z.object({
  name: z.string().min(1).describe("Volume name"),
  driver: z.string().optional().describe("Volume driver (default: local)"),
  labels: z.record(z.string()).optional().describe("Labels to apply"),
});

export const volume_create = {
  name: "docker_volume_create",
  description: "Create a Docker volume.",
  schema,
  handler: async ({ name, driver, labels }: z.infer<typeof schema>) => {
    try {
      await createVolume(name, driver, labels);
      clearCache();
      return ok(`Volume ${name} created successfully.`);
    } catch (err) {
      return fail("Failed to create volume", err);
    }
  },
};
