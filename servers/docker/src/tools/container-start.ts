import { z } from "zod";
import { startContainer } from "../docker-client.js";
import { clearCache } from "../cache.js";
import { ok, fail } from "./shared.js";

const schema = z.object({
  id: z.string().min(1).describe("Container ID or name"),
});

export const container_start = {
  name: "docker_container_start",
  description: "Start a stopped Docker container.",
  schema,
  handler: async ({ id }: z.infer<typeof schema>) => {
    try {
      await startContainer(id);
      clearCache();
      return ok(`Container ${id} started successfully.`);
    } catch (err) {
      return fail("Failed to start container", err);
    }
  },
};
