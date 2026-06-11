/**
 * Docker Engine API client.
 *
 * Communicates with the Docker daemon via Unix socket (/var/run/docker.sock)
 * using the Docker Engine REST API.
 */

import { request as httpRequest, IncomingMessage } from "http";
import { spawn } from "child_process";
import { config } from "./config.js";
import { logger } from "./logger.js";

/** Docker API v1.47 base path */
const API_PREFIX = `/${config.apiVersion}`;

// ─── Low-level HTTP request over Unix socket ────────────────────────────────

function dockerRequest<T>(
  method: string,
  path: string,
  body?: string | Buffer
): Promise<T> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string | number> = {
      Host: "localhost",
      Accept: "application/json",
    };

    if (body) {
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = Buffer.byteLength(body);
    }

    const options = {
      socketPath: config.socketPath,
      path: `${API_PREFIX}${path}`,
      method,
      headers,
      timeout: config.requestTimeoutMs,
    };

    const req = httpRequest(options, (res: IncomingMessage) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => {
        const data = Buffer.concat(chunks);
        const statusCode = res.statusCode ?? 0;

        if (statusCode >= 200 && statusCode < 300) {
          try {
            const parsed = data.length > 0 ? JSON.parse(data.toString()) : {};
            resolve(parsed as T);
          } catch {
            resolve(data.toString() as unknown as T);
          }
        } else {
          const message = data.length > 0 ? data.toString() : `HTTP ${statusCode}`;
          reject(new Error(`Docker API error (${statusCode}): ${message}`));
        }
      });
    });

    req.on("error", (err) => {
      logger.error("Docker API request failed", { error: err.message, method, path });
      reject(new Error(`Docker API connection error: ${err.message}`));
    });

    req.on("timeout", () => {
      req.destroy();
      reject(new Error(`Docker API request timed out after ${config.requestTimeoutMs}ms`));
    });

    if (body) {
      req.write(body);
    }
    req.end();
  });
}

// ─── Raw stream request (for logs) ───────────────────────────────────────────

function dockerRequestRaw(
  method: string,
  path: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    const options = {
      socketPath: config.socketPath,
      path: `${API_PREFIX}${path}`,
      method,
      headers: {
        Host: "localhost",
        Accept: "application/json",
      },
      timeout: config.requestTimeoutMs,
    };

    const req = httpRequest(options, (res: IncomingMessage) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => {
        const statusCode = res.statusCode ?? 0;
        const data = Buffer.concat(chunks);
        if (statusCode >= 200 && statusCode < 300) {
          resolve(data.toString());
        } else {
          const message = data.length > 0 ? data.toString() : `HTTP ${statusCode}`;
          reject(new Error(`Docker API error (${statusCode}): ${message}`));
        }
      });
    });

    req.on("error", (err) => {
      reject(new Error(`Docker API connection error: ${err.message}`));
    });

    req.on("timeout", () => {
      req.destroy();
      reject(new Error(`Docker API request timed out`));
    });

    req.end();
  });
}

// ─── Container operations ────────────────────────────────────────────────────

export interface DockerContainer {
  Id: string;
  Names: string[];
  Image: string;
  ImageID: string;
  Command: string;
  Created: number;
  State: string;
  Status: string;
  Ports: Array<{ PrivatePort: number; PublicPort?: number; Type: string }>;
  Labels: Record<string, string>;
}

export async function listContainers(all: boolean = true): Promise<DockerContainer[]> {
  const containers = await dockerRequest<DockerContainer[]>(
    "GET",
    `/containers/json${all ? "?all=true" : ""}`
  );
  return containers;
}

export async function inspectContainer(id: string): Promise<unknown> {
  return dockerRequest("GET", `/containers/${id}/json`);
}

export async function getContainerLogs(
  id: string,
  tail: number = 100
): Promise<string> {
  return dockerRequestRaw(
    "GET",
    `/containers/${id}/logs?stdout=true&stderr=true&tail=${tail}`
  );
}

export async function startContainer(id: string): Promise<void> {
  await dockerRequest<void>("POST", `/containers/${id}/start`);
}

export async function stopContainer(id: string): Promise<void> {
  await dockerRequest<void>("POST", `/containers/${id}/stop`);
}

export async function restartContainer(id: string): Promise<void> {
  await dockerRequest<void>("POST", `/containers/${id}/restart`);
}

export async function removeContainer(id: string, force: boolean = false): Promise<void> {
  await dockerRequest<void>(
    "DELETE",
    `/containers/${id}${force ? "?force=true" : ""}`
  );
}

// ─── Image operations ────────────────────────────────────────────────────────

export interface DockerImage {
  Id: string;
  ParentId: string;
  RepoTags: string[] | null;
  RepoDigests: string[] | null;
  Created: number;
  Size: number;
  VirtualSize: number;
  Labels: Record<string, string> | null;
}

export async function listImages(): Promise<DockerImage[]> {
  return dockerRequest<DockerImage[]>("GET", "/images/json");
}

export async function inspectImage(id: string): Promise<unknown> {
  return dockerRequest("GET", `/images/${id}/json`);
}

export async function removeImage(id: string, force: boolean = false): Promise<void> {
  await dockerRequest<void>(
    "DELETE",
    `/images/${id}${force ? "?force=true" : ""}`
  );
}

// ─── System operations ───────────────────────────────────────────────────────

export async function getSystemInfo(): Promise<unknown> {
  return dockerRequest("GET", "/info");
}

export async function getSystemDf(): Promise<unknown> {
  return dockerRequest("GET", "/system/df");
}

// ─── Build operations ────────────────────────────────────────────────────────

export interface BuildOptions {
  tag?: string;
  dockerfile?: string;
  buildArgs?: Record<string, string>;
  labels?: Record<string, string>;
}

/**
 * Build a Docker image from a local directory.
 * Creates a tar archive from the directory and POSTs to the Docker build API.
 */
export async function buildImage(
  contextPath: string,
  options: BuildOptions = {}
): Promise<string> {
  const queryParams = new URLSearchParams();
  if (options.tag) queryParams.set("t", options.tag);
  if (options.dockerfile) queryParams.set("dockerfile", options.dockerfile);
  if (options.buildArgs) queryParams.set("buildargs", JSON.stringify(options.buildArgs));
  if (options.labels) queryParams.set("labels", JSON.stringify(options.labels));

  const queryString = queryParams.toString();
  const apiPath = `/build${queryString ? "?" + queryString : ""}`;

  const headers: Record<string, string | number> = {
    Host: "localhost",
    "Content-Type": "application/x-tar",
    Accept: "application/json",
  };

  const reqOptions = {
    socketPath: config.socketPath,
    path: `${API_PREFIX}${apiPath}`,
    method: "POST",
    headers,
    timeout: 600_000, // 10 min for builds
  };

  return new Promise((resolve, reject) => {
    const req = httpRequest(reqOptions, (res: IncomingMessage) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => {
        const data = Buffer.concat(chunks);
        const statusCode = res.statusCode ?? 0;
        const output = data.toString();

        if (statusCode >= 200 && statusCode < 300) {
          // Build output is stream of JSON lines; return last line (contains image ID or error)
          const lines = output.trim().split("\n").filter(Boolean);
          resolve(lines[lines.length - 1]);
        } else {
          reject(new Error(`Docker build failed (${statusCode}): ${output}`));
        }
      });
    });

    req.on("error", (err) => {
      reject(new Error(`Docker build request error: ${err.message}`));
    });

    // Create tar from directory and pipe to request
    // --no-xattrs and --exclude macOS metadata (com.apple.provenance xattr causes Docker build failures)
    const tarCmd = spawn("tar", [
      "--no-xattrs",
      "--exclude", ".DS_Store",
      "--exclude", "__MACOSX",
      "--exclude", ".AppleDouble",
      "--exclude", ".Spotlight-V100",
      "--exclude", ".Trashes",
      "-C", contextPath,
      "-cf", "-",
      ".",
    ]);

    tarCmd.stderr.on("data", (data) => {
      logger.warn("tar stderr", { message: data.toString() });
    });

    tarCmd.on("error", (err) => {
      req.destroy();
      reject(new Error(`Failed to start tar: ${err.message}`));
    });

    tarCmd.on("close", (code) => {
      if (code !== 0) {
        logger.warn("tar exited with code", { code });
      }
    });

    if (!tarCmd.stdout) {
      req.destroy();
      reject(new Error("Failed to start tar process"));
      return;
    }

    tarCmd.stdout.pipe(req);
  });
}

// ─── Events ──────────────────────────────────────────────────────────────────

export interface EventOptions {
  since?: string;
  until?: string;
  filters?: Record<string, string[]>;
}

export interface DockerEvent {
  status: string;
  id: string;
  from?: string;
  Type: string;
  Action: string;
  Actor: {
    ID: string;
    Attributes?: Record<string, string>;
  };
  time: number;
  timeNano?: number;
}

/**
 * Get Docker system events. Returns recent events as an array.
 * Always uses a bounded time window: `since` defaults to 5 minutes ago,
 * `until` defaults to now, so the stream closes automatically.
 */
export async function getEvents(options: EventOptions = {}): Promise<DockerEvent[]> {
  const now = Math.floor(Date.now() / 1000);
  const since = options.since ?? String(now - 300); // default: last 5 min
  const until = options.until ?? String(now);

  const queryParams = new URLSearchParams();
  queryParams.set("since", since);
  queryParams.set("until", until);
  if (options.filters) queryParams.set("filters", JSON.stringify(options.filters));

  const path = `/events?${queryParams.toString()}`;

  // Events streams newline-delimited JSON until `until` timestamp is reached
  return new Promise((resolve, reject) => {
    const events: DockerEvent[] = [];

    const headers: Record<string, string | number> = {
      Host: "localhost",
      Accept: "application/json",
    };

    const reqOptions = {
      socketPath: config.socketPath,
      path: `${API_PREFIX}${path}`,
      method: "GET",
      headers,
      timeout: config.requestTimeoutMs,
    };

    const req = httpRequest(reqOptions, (res: IncomingMessage) => {
      let buffer = "";

      res.on("data", (chunk: Buffer) => {
        buffer += chunk.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (line.trim()) {
            try {
              events.push(JSON.parse(line) as DockerEvent);
            } catch {
              // Skip malformed lines
            }
          }
        }
      });

      res.on("end", () => {
        if (buffer.trim()) {
          try {
            events.push(JSON.parse(buffer) as DockerEvent);
          } catch {
            // Skip
          }
        }
        resolve(events);
      });
    });

    req.on("error", (err) => {
      reject(new Error(`Docker events request error: ${err.message}`));
    });

    req.on("timeout", () => {
      req.destroy();
      resolve(events);
    });

    req.end();
  });
}

// ─── Prune operations ────────────────────────────────────────────────────────

export interface PruneResult {
  ContainersDeleted?: string[];
  ImagesDeleted?: Array<{ Deleted?: string; Untagged?: string }>;
  VolumesDeleted?: string[];
  SpaceReclaimed: number;
}

/**
 * Prune unused Docker objects (containers, images, optionally volumes).
 * Calls the individual prune endpoints since /system/prune is not available in all API versions.
 */
export async function pruneSystem(volumes: boolean = false): Promise<PruneResult> {
  const result: PruneResult = {
    ContainersDeleted: [],
    ImagesDeleted: [],
    SpaceReclaimed: 0,
  };

  // Prune containers
  try {
    const containersResult = dockerRequest<{ ContainersDeleted: string[]; SpaceReclaimed: number }>(
      "POST", "/containers/prune"
    );
    const containers = await containersResult;
    result.ContainersDeleted = containers.ContainersDeleted ?? [];
    result.SpaceReclaimed += containers.SpaceReclaimed ?? 0;
  } catch (e) {
    logger.warn("Failed to prune containers", { error: String(e) });
  }

  // Prune images
  try {
    const imagesResult = dockerRequest<{ ImagesDeleted: Array<{ Deleted?: string; Untagged?: string }>; SpaceReclaimed: number }>(
      "POST", "/images/prune"
    );
    const images = await imagesResult;
    result.ImagesDeleted = images.ImagesDeleted ?? [];
    result.SpaceReclaimed += images.SpaceReclaimed ?? 0;
  } catch (e) {
    logger.warn("Failed to prune images", { error: String(e) });
  }

  // Prune networks
  try {
    const networksResult = dockerRequest<{ NetworksDeleted: string[] }>(
      "POST", "/networks/prune"
    );
    const networks = await networksResult;
    result.SpaceReclaimed += 0; // networks don't report space
  } catch (e) {
    logger.warn("Failed to prune networks", { error: String(e) });
  }

  // Prune volumes if requested
  if (volumes) {
    try {
      const volumesResult = dockerRequest<{ VolumesDeleted: string[]; SpaceReclaimed: number }>(
        "POST", "/volumes/prune"
      );
      const volResult = await volumesResult;
      result.VolumesDeleted = volResult.VolumesDeleted ?? [];
      result.SpaceReclaimed += volResult.SpaceReclaimed ?? 0;
    } catch (e) {
      logger.warn("Failed to prune volumes", { error: String(e) });
    }
  }

  return result;
}

/**
 * Prune Docker build cache.
 */
export async function pruneBuildCache(all: boolean = false): Promise<{ SpaceReclaimed: number }> {
  const queryParams = new URLSearchParams();
  if (all) queryParams.set("all", "true");

  const queryString = queryParams.toString();
  const path = `/build/prune${queryString ? "?" + queryString : ""}`;

  return dockerRequest<{ SpaceReclaimed: number }>("POST", path);
}

// ─── Container stats ─────────────────────────────────────────────────────────

export interface ContainerStats {
  read: string;
  preread: string;
  pids_stats: { current?: number };
  networks?: Record<string, {
    rx_bytes: number;
    tx_bytes: number;
    rx_packets: number;
    tx_packets: number;
  }>;
  memory_stats: {
    usage: number;
    max_usage: number;
    limit: number;
    stats?: Record<string, number>;
  };
  cpu_stats: {
    cpu_usage: {
      total_usage: number;
      usage_in_kernelmode: number;
      usage_in_usermode: number;
    };
    system_cpu_usage?: number;
    online_cpus?: number;
  };
  blkio_stats: {
    io_service_bytes_recursive?: Array<{
      major: number;
      minor: number;
      op: string;
      value: number;
    }>;
  };
}

/**
 * Get live resource usage stats for a container (single snapshot).
 */
export async function getContainerStats(id: string): Promise<ContainerStats> {
  return dockerRequest<ContainerStats>("GET", `/containers/${id}/stats?stream=false`);
}

// ─── Log follow ──────────────────────────────────────────────────────────────

export interface LogFollowOptions {
  since?: string;
  until?: string;
  tail?: number;
}

/**
 * Stream-follow container logs for a bounded time window.
 * Collects logs for up to 10 seconds or until the stream ends.
 */
export async function getContainerLogsFollow(
  id: string,
  options: LogFollowOptions = {}
): Promise<string> {
  const queryParams = new URLSearchParams();
  queryParams.set("follow", "true");
  queryParams.set("stdout", "true");
  queryParams.set("stderr", "true");
  if (options.since) queryParams.set("since", options.since);
  if (options.until) queryParams.set("until", options.until);
  if (options.tail) queryParams.set("tail", String(options.tail));

  const path = `/containers/${id}/logs?${queryParams.toString()}`;

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const COLLECT_MS = 10_000; // Collect for 10 seconds then return

    const headers: Record<string, string | number> = {
      Host: "localhost",
      Accept: "application/json",
    };

    const reqOptions = {
      socketPath: config.socketPath,
      path: `${API_PREFIX}${path}`,
      method: "GET",
      headers,
      timeout: COLLECT_MS + 5000,
    };

    const req = httpRequest(reqOptions, (res: IncomingMessage) => {
      const timer = setTimeout(() => {
        req.destroy();
        resolve(Buffer.concat(chunks).toString());
      }, COLLECT_MS);

      res.on("data", (chunk: Buffer) => {
        chunks.push(chunk);
      });

      res.on("end", () => {
        clearTimeout(timer);
        resolve(Buffer.concat(chunks).toString());
      });
    });

    req.on("error", (err) => {
      reject(new Error(`Docker log follow error: ${err.message}`));
    });

    req.end();
  });
}
