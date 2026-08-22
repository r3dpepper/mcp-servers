import { z } from "zod";
import { removeImage } from "../docker-client.js";
import { clearCache } from "../cache.js";
import { ok, fail } from "./shared.js";

const schema = z.object({
  id: z.string().min(1).describe("Image ID, name, or tag"),
  force: z.boolean().optional().default(false).describe("Force remove even if in use"),
});

export const image_remove = {
  name: "docker_image_remove",
  description:
    "Remove a Docker image. Use force=true to remove even if used by containers.",
  schema,
  handler: async ({ id, force }: z.infer<typeof schema>) => {
    try {
      await removeImage(id, force);
      clearCache();
      return ok(`Image ${id} removed successfully.`);
    } catch (err) {
      return fail("Failed to remove image", err);
    }
  },
};
