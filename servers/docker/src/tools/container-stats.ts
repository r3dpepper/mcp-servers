import { z } from "zod";
import { getContainerStats } from "../docker-client.js";
import { ok, fail } from "./shared.js";

const schema = z.object({
  id: z.string().min(1).describe("Container ID or name"),
});

export const container_stats = {
  name: "docker_container_stats",
  description:
    "Get live resource usage stats for a container (CPU, memory, network I/O, block I/O) — like 'docker stats'.",
  schema,
  handler: async ({ id }: z.infer<typeof schema>) => {
    try {
      // Never cached: stats are a live snapshot
      const stats = await getContainerStats(id);

      const memUsage = stats.memory_stats?.usage ?? 0;
      const memLimit = stats.memory_stats?.limit ?? 1;
      const memPct = memLimit > 0 ? ((memUsage / memLimit) * 100).toFixed(1) : "0";
      const memUsageMB = (memUsage / (1024 * 1024)).toFixed(1);
      const memLimitMB = (memLimit / (1024 * 1024)).toFixed(1);

      const cpuUsage = stats.cpu_stats?.cpu_usage?.total_usage ?? 0;
      const sysCpu = stats.cpu_stats?.system_cpu_usage ?? 0;
      const onlineCpus = stats.cpu_stats?.online_cpus ?? 1;
      const cpuPct = sysCpu > 0 ? ((cpuUsage / sysCpu) * onlineCpus * 100).toFixed(1) : "0";

      const pids = stats.pids_stats?.current ?? 0;

      const netRx = Object.values(stats.networks ?? {}).reduce((sum, n) => sum + n.rx_bytes, 0);
      const netTx = Object.values(stats.networks ?? {}).reduce((sum, n) => sum + n.tx_bytes, 0);

      const lines = [
        `**Container Stats for ${id.substring(0, 12)}**`,
        `  CPU: ${cpuPct}%`,
        `  Memory: ${memUsageMB} MB / ${memLimitMB} MB (${memPct}%)`,
        `  PIDs: ${pids}`,
        `  Network I/O: ↓${(netRx / 1024).toFixed(1)} KB / ↑${(netTx / 1024).toFixed(1)} KB`,
      ];

      return ok(lines.join("\n"));
    } catch (err) {
      return fail("Failed to get stats", err);
    }
  },
};
