import { z } from "zod";
import { getSystemInfo } from "../docker-client.js";
import { getCached, setCached } from "../cache.js";
import { ok, fail } from "./shared.js";

const schema = z.object({});

export const system_info = {
  name: "docker_system_info",
  description:
    "Get Docker system information (version, containers, images, plugins, etc.).",
  schema,
  handler: async () => {
    try {
      let info = getCached<unknown>("system_info");
      if (!info) {
        info = await getSystemInfo();
        setCached("system_info", info);
      }
      return ok(JSON.stringify(info, null, 2));
    } catch (err) {
      return fail("Failed to get system info", err);
    }
  },
};
