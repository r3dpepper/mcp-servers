import { z } from "zod";
import { inspectImage } from "../docker-client.js";
import { getCached, setCached } from "../cache.js";
import { ok, fail } from "./shared.js";

const schema = z.object({
  id: z.string().min(1).describe("Image ID, name, or tag"),
});

export const image_inspect = {
  name: "docker_image_inspect",
  description:
    "Inspect a Docker image by ID or name. Returns detailed image configuration.",
  schema,
  handler: async ({ id }: z.infer<typeof schema>) => {
    try {
      const key = `image_inspect:${id}`;
      let info = getCached<unknown>(key);
      if (!info) {
        info = await inspectImage(id);
        setCached(key, info);
      }
      return ok(JSON.stringify(info, null, 2));
    } catch (err) {
      return fail("Failed to inspect image", err);
    }
  },
};
