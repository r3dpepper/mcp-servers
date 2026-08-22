import { z } from "zod";
import { listNetworks, DockerNetwork } from "../docker-client.js";
import { getCached, setCached } from "../cache.js";
import { ok, fail } from "./shared.js";

const schema = z.object({});

export const networks_list = {
  name: "docker_networks_list",
  description: "List all Docker networks with their attached containers.",
  schema,
  handler: async () => {
    try {
      let networks = getCached<DockerNetwork[]>("networks_list");
      if (!networks) {
        networks = await listNetworks();
        setCached("networks_list", networks);
      }

      const lines = networks.map((n) => {
        const containers = Object.values(n.Containers ?? {})
          .map((c) => c.Name ?? "(unnamed)")
          .join(", ");
        return [
          `**${n.Name}**`,
          `  Driver: ${n.Driver} · Scope: ${n.Scope}`,
          `  Containers: ${containers || "none"}`,
        ].join("\n");
      });

      return ok(lines.join("\n\n"));
    } catch (err) {
      return fail("Failed to list networks", err);
    }
  },
};
