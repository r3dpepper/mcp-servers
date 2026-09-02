import { z } from "zod";
import { getContainerTop } from "../docker-client.js";
import { ok, fail } from "./shared.js";

const schema = z.object({
  id: z.string().min(1).describe("Container ID or name"),
});

export const container_top = {
  name: "docker_container_top",
  description: "List the processes running inside a container (like 'docker top').",
  schema,
  handler: async ({ id }: z.infer<typeof schema>) => {
    try {
      const top = await getContainerTop(id);

      if (!top.Processes || top.Processes.length === 0) {
        return ok("No processes found.");
      }

      const rows = [
        top.Titles.join("\t"),
        ...top.Processes.map((p) => p.join("\t")),
      ];
      return ok(rows.join("\n"));
    } catch (err) {
      return fail("Failed to get container processes", err);
    }
  },
};
