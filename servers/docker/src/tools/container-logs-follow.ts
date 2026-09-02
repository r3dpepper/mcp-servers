import { z } from "zod";
import { getContainerLogsFollow } from "../docker-client.js";
import { ok, fail } from "./shared.js";

const schema = z.object({
  id: z.string().min(1).describe("Container ID or name"),
  since: z.string().optional().describe("Show logs since this timestamp"),
  until: z.string().optional().describe("Show logs until this timestamp"),
  tail: z.number().int().min(1).max(10000).optional().default(100).describe("Number of lines from the end to start with"),
});

export const container_logs_follow = {
  name: "docker_container_logs_follow",
  description:
    "Stream-follow container logs in real-time (like 'docker logs -f'). Collects logs for up to 10 seconds.",
  schema,
  handler: async ({ id, since, until, tail }: z.infer<typeof schema>) => {
    try {
      // Never cached: follows live output
      const logs = await getContainerLogsFollow(id, { since, until, tail });
      if (!logs.trim()) {
        return ok("No logs found.");
      }
      return ok(logs);
    } catch (err) {
      return fail("Failed to follow logs", err);
    }
  },
};
