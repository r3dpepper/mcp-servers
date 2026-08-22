import { z } from "zod";
import { getEvents } from "../docker-client.js";
import { ok, fail } from "./shared.js";

const schema = z.object({
  since: z.string().optional().describe("Show events since this timestamp (e.g. '2024-01-01T00:00:00Z' or '10m' or Unix timestamp)"),
  until: z.string().optional().describe("Show events until this timestamp then stop"),
  tail: z.number().int().min(1).max(500).optional().default(50).describe("Maximum number of recent events to return"),
});

export const events = {
  name: "docker_events",
  description:
    "Get Docker system events (container start/stop/create/destroy, image pull, etc.).",
  schema,
  handler: async ({ since, until, tail }: z.infer<typeof schema>) => {
    try {
      // Never cached: events are live data
      // Default: last 5 minutes if no since specified
      const effectiveSince = since ?? Math.floor((Date.now() / 1000) - 300).toString();
      const events = await getEvents({ since: effectiveSince, until });

      if (events.length === 0) {
        return ok("No events found.");
      }

      const sliced = events.slice(-tail);
      const lines = sliced.map((e) => {
        const time = new Date(e.time * 1000).toISOString();
        const actor = e.Actor?.ID?.substring(0, 12) ?? "";
        const attrs = e.Actor?.Attributes
          ? Object.entries(e.Actor.Attributes).map(([k, v]) => `${k}=${v}`).join(", ")
          : "";
        return `[${time}] ${e.Type} ${e.Action} ${actor}${attrs ? " (" + attrs + ")" : ""}`;
      });

      return ok(lines.join("\n"));
    } catch (err) {
      return fail("Failed to get events", err);
    }
  },
};
