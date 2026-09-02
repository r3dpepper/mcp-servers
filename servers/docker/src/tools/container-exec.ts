import { z } from "zod";
import { execInContainer } from "../docker-client.js";
import { config } from "../config.js";
import { ok, okAsError, fail } from "./shared.js";

const schema = z.object({
  id: z.string().min(1).describe("Container ID or name"),
  cmd: z.array(z.string()).min(1).describe("Command to run, as an argument array (e.g. ['ls','-la','/app'])"),
  workdir: z.string().optional().describe("Working directory inside the container"),
  env: z.record(z.string()).optional().describe("Environment variables for the command"),
  user: z.string().optional().describe("User to run the command as (e.g. 'node' or '1000:1000')"),
});

export const container_exec = {
  name: "docker_container_exec",
  description:
    "Execute a command inside a running container and return its output and exit code. " +
    "Disabled unless DOCKER_ENABLE_EXEC=true.",
  schema,
  handler: async ({ id, cmd, workdir, env, user }: z.infer<typeof schema>) => {
    // Arbitrary in-container execution is opt-in
    if (!config.enableExec) {
      return fail("Exec is disabled", new Error(
        "Set DOCKER_ENABLE_EXEC=true in .env to allow running commands inside containers"
      ));
    }

    try {
      const result = await execInContainer(id, cmd, { workdir, env, user });
      const header = `exit code: ${result.exitCode}`;
      const body = result.output.trim() || "(no output)";
      // Non-zero exits are reported through the normal channel but flagged
      return result.exitCode === 0 ? ok(`${header}\n${body}`) : okAsError(`${header}\n${body}`);
    } catch (err) {
      return fail("Failed to exec in container", err);
    }
  },
};
