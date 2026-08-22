import { z } from "zod";
import { pullImage } from "../docker-client.js";
import { clearCache } from "../cache.js";
import { ok, fail } from "./shared.js";

const schema = z.object({
  image: z.string().min(1).describe("Image name (e.g. 'nginx' or 'ghcr.io/owner/repo')"),
  tag: z.string().optional().default("latest").describe("Tag to pull (default: latest)"),
});

export const image_pull = {
  name: "docker_image_pull",
  description:
    "Pull a Docker image from a registry. Returns the final status line; may take a while for large images.",
  schema,
  handler: async ({ image, tag }: z.infer<typeof schema>) => {
    try {
      const lastLine = await pullImage(image, tag);
      clearCache();
      let pretty = lastLine;
      try {
        // Progress lines are JSON like {"status":"Download complete","id":"abc123"}
        const parsed = JSON.parse(lastLine) as { status?: string; id?: string };
        if (parsed.status) {
          pretty = `${parsed.id ? `[${parsed.id}] ` : ""}${parsed.status}`;
        }
      } catch {
        // Not JSON — return as-is
      }
      return ok(`Pulled ${image}:${tag}\n${pretty}`);
    } catch (err) {
      return fail("Failed to pull image", err);
    }
  },
};
