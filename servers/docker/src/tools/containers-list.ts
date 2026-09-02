import { z } from "zod";
import { listContainers, DockerContainer } from "../docker-client.js";
import { getCached, setCached } from "../cache.js";
import { ok, fail } from "./shared.js";

const schema = z.object({
  all: z.boolean().optional().default(true).describe("Show all containers (true) or only running (false)"),
});

export const containers_list = {
  name: "docker_containers_list",
  description:
    "List Docker containers. By default shows all containers (running and stopped).",
  schema,
  handler: async ({ all }: z.infer<typeof schema>) => {
    try {
      const key = `containers_list:${all}`;
      let containers = getCached<DockerContainer[]>(key);
      if (!containers) {
        containers = await listContainers(all);
        setCached(key, containers);
      }

      if (containers.length === 0) {
        return ok("No containers found.");
      }

      const lines = containers.map((c) => {
        const names = (c.Names ?? []).map((n) => n.replace(/^\//, "")).join(", ");
        const ports = (c.Ports ?? []).length > 0
          ? (c.Ports ?? []).map((p) => `${p.PublicPort ?? ""}:${p.PrivatePort}/${p.Type}`).join(", ")
          : "none";
        return [
          `**${names || c.Id.substring(0, 12)}**`,
          `  ID: ${c.Id.substring(0, 12)}`,
          `  Image: ${c.Image}`,
          `  State: ${c.State} (${c.Status})`,
          `  Ports: ${ports}`,
        ].join("\n");
      });

      return ok(lines.join("\n\n"));
    } catch (err) {
      return fail("Failed to list containers", err);
    }
  },
};
