import { z } from "zod";
import { removeContainer } from "../docker-client.js";
import { clearCache } from "../cache.js";
import { ok, fail } from "./shared.js";

const schema = z.object({
  id: z.string().min(1).describe("Container ID or name"),
  force: z.boolean().optional().default(false).describe("Force remove even if running"),
});

export const container_remove = {
  name: "docker_container_remove",
  description:
    "Remove a Docker container. Container must be stopped first unless force=true.",
  schema,
  handler: async ({ id, force }: z.infer<typeof schema>) => {
    try {
      await removeContainer(id, force);
      clearCache();
      return ok(`Container ${id} removed successfully.`);
    } catch (err) {
      return fail("Failed to remove container", err);
    }
  },
};
