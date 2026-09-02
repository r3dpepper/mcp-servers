import { z } from "zod";
import { listImages, DockerImage } from "../docker-client.js";
import { getCached, setCached } from "../cache.js";
import { ok, fail } from "./shared.js";

const schema = z.object({});

export const images_list = {
  name: "docker_images_list",
  description: "List all Docker images on the host.",
  schema,
  handler: async () => {
    try {
      let images = getCached<DockerImage[]>("images_list");
      if (!images) {
        images = await listImages();
        setCached("images_list", images);
      }

      if (images.length === 0) {
        return ok("No images found.");
      }

      const lines = images.map((img) => {
        const tags = (img.RepoTags ?? []).join(", ") || "<none>";
        const sizeMB = (img.Size / (1024 * 1024)).toFixed(1);
        return [
          `**${tags}**`,
          `  ID: ${img.Id.substring(0, 12)}`,
          `  Size: ${sizeMB} MB`,
          `  Created: ${new Date(img.Created * 1000).toISOString()}`,
        ].join("\n");
      });

      return ok(lines.join("\n\n"));
    } catch (err) {
      return fail("Failed to list images", err);
    }
  },
};
