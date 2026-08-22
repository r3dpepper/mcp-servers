import { z } from "zod";
import { renameContainer } from "../docker-client.js";
import { clearCache } from "../cache.js";
import { ok, fail } from "./shared.js";

const schema = z.object({
  id: z.string().min(1).describe("Container ID or current name"),
  name: z.string().min(1).describe("New container name"),
});

export const container_rename = {
  name: "docker_container_rename",
  description: "Rename a Docker container.",
  schema,
  handler: async ({ id, name }: z.infer<typeof schema>) => {
    try {
      await renameContainer(id, name);
      clearCache();
      return ok(`Container ${id} renamed to ${name}.`);
    } catch (err) {
      return fail("Failed to rename container", err);
    }
  },
};
