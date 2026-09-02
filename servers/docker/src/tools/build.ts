import { z } from "zod";
import { buildImage } from "../docker-client.js";
import { clearCache } from "../cache.js";
import { ok, fail } from "./shared.js";

const schema = z.object({
  path: z.string().min(1).describe("Path to the build context directory (must contain a Dockerfile)"),
  tag: z.string().optional().describe("Image tag (e.g. 'myapp:latest')"),
  dockerfile: z.string().optional().describe("Path to Dockerfile relative to context (default: Dockerfile)"),
  build_args: z.record(z.string()).optional().describe("Build arguments (ARG values)"),
});

export const build = {
  name: "docker_build",
  description:
    "Build a Docker image from a local directory containing a Dockerfile. Returns the build output including image ID.",
  schema,
  handler: async ({ path, tag, dockerfile, build_args }: z.infer<typeof schema>) => {
    try {
      const output = await buildImage(path, {
        tag,
        dockerfile,
        buildArgs: build_args,
      });
      clearCache();
      return ok(output);
    } catch (err) {
      return fail("Build failed", err);
    }
  },
};
