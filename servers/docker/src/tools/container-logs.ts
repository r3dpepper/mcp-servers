import { z } from "zod";
import { getContainerLogs } from "../docker-client.js";
import { ok, fail } from "./shared.js";

const schema = z.object({
  id: z.string().min(1).describe("Container ID or name"),
  tail: z.number().int().min(1).max(10000).optional().default(100).describe("Number of lines from the end"),
});

export const container_logs = {
  name: "docker_container_logs",
  description: "Get logs from a Docker container (stdout and stderr).",
  schema,
  handler: async ({ id, tail }: z.infer<typeof schema>) => {
    try {
      // Never cached: logs are live data
      const logs = await getContainerLogs(id, tail);
      if (!logs.trim()) {
        return ok("No logs found.");
      }
      return ok(logs);
    } catch (err) {
      return fail("Failed to get logs", err);
    }
  },
};
