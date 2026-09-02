import { z } from "zod";
import { stopContainer } from "../docker-client.js";
import { clearCache } from "../cache.js";
import { ok, fail } from "./shared.js";

const schema = z.object({
  id: z.string().min(1).describe("Container ID or name"),
});

export const container_stop = {
  name: "docker_container_stop",
  description: "Stop a running Docker container.",
  schema,
  handler: async ({ id }: z.infer<typeof schema>) => {
    try {
      await stopContainer(id);
      clearCache();
      return ok(`Container ${id} stopped successfully.`);
    } catch (err) {
      return fail("Failed to stop container", err);
    }
  },
};
