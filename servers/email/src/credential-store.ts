/**
 * Credential store for email accounts.
 *
 * Tries the OS keychain first (macOS Keychain, Linux libsecret, Windows
 * Credential Manager) via `keytar`. If keytar fails to load (native build
 * missing — common in Docker, headless Linux, or fresh installs), falls back
 * to an AES-256-GCM encrypted file on disk, with a key derived from a
 * machine-specific ID + a project-wide salt.
 *
 * The keychain path is preferred because the OS keeps secrets out of the
 * filesystem; the encrypted-file path is a safe fallback for environments
 * where no system keychain is available.
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";
import { hostname, userInfo } from "os";
import { readFile, writeFile, mkdir } from "fs/promises";
import { dirname, join } from "path";
import { logger } from "./logger.js";
import { config } from "./config.js";

/** Service name used in the OS keychain. */
const KEYCHAIN_SERVICE = "mcp-hub-email";

/** Salt mixed into the file-fallback key derivation. Stable per project. */
const FILE_SALT = "mcp-hub-email-v1";

export type Provider = "imap" | "gmail-oauth" | "outlook-oauth";

/** Public account metadata (no secrets). */
export interface AccountMeta {
  id: string;            // stable, derived from email + provider
  email: string;         // primary email address
  provider: Provider;
  displayName?: string;  // human-friendly label
  addedAt: string;       // ISO timestamp
}

/** Full account record including secret material. */
export interface AccountRecord extends AccountMeta {
  secret: AccountSecret;
}

export type AccountSecret =
  | { kind: "imap"; user: string; password: string; imapHost: string; imapPort: number; imapSecure: boolean; smtpHost: string; smtpPort: number; smtpSecure: boolean }
  | { kind: "gmail-oauth"; accessToken: string; refreshToken: string; expiresAt: number; scope: string }
  | { kind: "outlook-oauth"; accessToken: string; refreshToken: string; expiresAt: number; scope: string };

// ─── Keychain backend (optional native dep) ────────────────────────────────

let keytar: typeof import("keytar") | null = null;
let keytarLoadError: string | null = null;
try {
  keytar = (await import("keytar")).default ?? (await import("keytar"));
} catch (err) {
  keytarLoadError = err instanceof Error ? err.message : String(err);
  logger.warn("keytar unavailable, using encrypted-file credential store", {
    error: keytarLoadError,
  });
}

function keychainAvailable(): boolean {
  return keytar !== null;
}

// ─── File-fallback backend (AES-256-GCM) ───────────────────────────────────

interface EncryptedFile {
  version: 1;
  /** Argon2-style scrypt salt; random per file write. */
  salt: string;
  /** AES-256-GCM IV; 12 bytes, base64. */
  iv: string;
  /** Auth tag from GCM; base64. */
  authTag: string;
  /** Base64 ciphertext. */
  data: string;
}

/**
 * Derive a 32-byte AES key from a stable per-machine ID. We use hostname +
 * username + the project salt so the same machine unlocks the same file.
 * Not as strong as a real user-supplied passphrase, but adequate for an
 * at-rest fallback when the OS keychain is missing.
 */
function deriveKey(salt: Buffer): Buffer {
  const machineId = `${hostname()}|${userInfo().username}`;
  // scryptSync: 32-byte key, salt applied externally
  return scryptSync(machineId, salt, 32, {
    N: 16384,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
}

async function readEncryptedFile(): Promise<AccountRecord[]> {
  try {
    const raw = await readFile(config.credentialFile, "utf8");
    const envelope = JSON.parse(raw) as EncryptedFile;
    const salt = Buffer.from(envelope.salt, "base64");
    const iv = Buffer.from(envelope.iv, "base64");
    const authTag = Buffer.from(envelope.authTag, "base64");
    const key = deriveKey(salt);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(envelope.data, "base64"), decipher.final()]);
    return JSON.parse(decrypted.toString("utf8")) as AccountRecord[];
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    logger.warn("Failed to read encrypted credential file", { err });
    return [];
  }
}

async function writeEncryptedFile(records: AccountRecord[]): Promise<void> {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = deriveKey(salt);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(records), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const envelope: EncryptedFile = {
    version: 1,
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
    data: ciphertext.toString("base64"),
  };

  await mkdir(dirname(config.credentialFile), { recursive: true });
  await writeFile(config.credentialFile, JSON.stringify(envelope, null, 2), {
    mode: 0o600, // owner read/write only
  });
}

// ─── Public API ────────────────────────────────────────────────────────────

/** Stable account ID — same email + provider always produces the same id. */
export function accountId(email: string, provider: Provider): string {
  return `${provider}::${email.toLowerCase()}`;
}

async function listAll(): Promise<AccountRecord[]> {
  if (keychainAvailable()) {
    const creds = await keytar!.findCredentials(KEYCHAIN_SERVICE);
    return creds
      .map((c) => {
        try {
          return JSON.parse(c.password) as AccountRecord;
        } catch {
          return null;
        }
      })
      .filter((r): r is AccountRecord => r !== null);
  }
  return readEncryptedFile();
}

async function saveAll(records: AccountRecord[]): Promise<void> {
  if (keychainAvailable()) {
    // Wipe and rewrite: simplest correct sync between in-memory and keychain
    const existing = await keytar!.findCredentials(KEYCHAIN_SERVICE);
    for (const c of existing) {
      await keytar!.deletePassword(KEYCHAIN_SERVICE, c.account);
    }
    for (const r of records) {
      await keytar!.setPassword(KEYCHAIN_SERVICE, r.id, JSON.stringify(r));
    }
    return;
  }
  await writeEncryptedFile(records);
}

export async function listAccounts(): Promise<AccountMeta[]> {
  const all = await listAll();
  return all.map(({ secret: _secret, ...meta }) => meta);
}

export async function getAccount(id: string): Promise<AccountRecord | null> {
  const all = await listAll();
  return all.find((r) => r.id === id) ?? null;
}

/**
 * Find an account by email, or by id. Used by tool handlers to look up the
 * credential when the user passes `account: "alice@example.com"`.
 */
export async function findAccount(idOrEmail: string): Promise<AccountRecord | null> {
  const all = await listAll();
  const target = idOrEmail.toLowerCase();
  return (
    all.find((r) => r.id.toLowerCase() === target) ??
    all.find((r) => r.email.toLowerCase() === target) ??
    null
  );
}

export async function addAccount(record: AccountRecord): Promise<void> {
  const all = await listAll();
  const idx = all.findIndex((r) => r.id === record.id);
  if (idx >= 0) all[idx] = record;
  else all.push(record);
  await saveAll(all);
  logger.info("Account added", { id: record.id, provider: record.provider });
}

export async function removeAccount(id: string): Promise<boolean> {
  const all = await listAll();
  const next = all.filter((r) => r.id !== id);
  if (next.length === all.length) return false;
  await saveAll(next);
  logger.info("Account removed", { id });
  return true;
}

/** Diagnostic: which backend is active. */
export function credentialBackend(): "keychain" | "encrypted-file" {
  return keychainAvailable() ? "keychain" : "encrypted-file";
}

export function credentialBackendReason(): string | null {
  return keytarLoadError;
}

// Common MIME / charset helpers used by the email client when parsing
// multipart messages. Exported for tools that need to reuse them.
export { join };
