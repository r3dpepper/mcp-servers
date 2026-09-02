import { z } from "zod";
import { listVolumes, DockerVolume } from "../docker-client.js";
import { getCached, setCached } from "../cache.js";
import { ok, fail } from "./shared.js";

const schema = z.object({});

export const volumes_list = {
  name: "docker_volumes_list",
  description: "List all Docker volumes on the host.",
  schema,
  handler: async () => {
    try {
      let volumes = getCached<DockerVolume[]>("volumes_list");
      if (!volumes) {
        volumes = await listVolumes();
        setCached("volumes_list", volumes);
      }

      if (volumes.length === 0) {
        return ok("No volumes found.");
      }

      const lines = volumes.map((v) => {
        const created = v.CreatedAt ? `\n  Created: ${v.CreatedAt}` : "";
        return `**${v.Name}**\n  Driver: ${v.Driver}\n  Mount: ${v.Mountpoint}${created}`;
      });

      return ok(lines.join("\n\n"));
    } catch (err) {
      return fail("Failed to list volumes", err);
    }
  },
};
