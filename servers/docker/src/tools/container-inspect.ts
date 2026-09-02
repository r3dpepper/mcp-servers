import { z } from "zod";
import { inspectContainer } from "../docker-client.js";
import { getCached, setCached } from "../cache.js";
import { ok, fail } from "./shared.js";

const schema = z.object({
  id: z.string().min(1).describe("Container ID or name"),
});

export const container_inspect = {
  name: "docker_container_inspect",
  description:
    "Inspect a Docker container by ID or name. Returns detailed container configuration.",
  schema,
  handler: async ({ id }: z.infer<typeof schema>) => {
    try {
      const key = `container_inspect:${id}`;
      let info = getCached<unknown>(key);
      if (!info) {
        info = await inspectContainer(id);
        setCached(key, info);
      }
      return ok(JSON.stringify(info, null, 2));
    } catch (err) {
      return fail("Failed to inspect container", err);
    }
  },
};
