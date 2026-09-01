/**
 * Email client facade.
 *
 * Each tool handler calls one of the methods on `emailClient`, which picks
 * the right provider implementation (IMAP/SMTP, Gmail REST, Outlook Graph)
 * based on the account's `provider` field.
 *
 * Provider implementations live in their own files (`providers/imap.ts`,
 * `providers/gmail.ts`, `providers/outlook.ts`) and all implement the
 * `EmailProvider` interface.
 */

import { ImapFlow } from "imapflow";
import nodemailer, { type Transporter } from "nodemailer";
import { simpleParser, type Attachment, type EmailAddress, type ParsedMail } from "mailparser";
import { google, type gmail_v1 } from "googleapis";
import { Client } from "@microsoft/microsoft-graph-client";
import { logger } from "./logger.js";
import { config } from "./config.js";
import { type AccountRecord, type AccountSecret } from "./credential-store.js";

// ─── Public data shapes (shared across providers) ──────────────────────────

export interface EmailHeader {
  name: string;
  value: string;
}

export interface EmailAddressObj {
  name?: string;
  address: string;
}

export interface EmailSummary {
  id: string;
  threadId?: string;
  folder: string;
  from: EmailAddressObj[];
  to: EmailAddressObj[];
  cc: EmailAddressObj[];
  bcc: EmailAddressObj[];
  subject: string;
  date: string;          // ISO timestamp
  snippet: string;       // ~200 chars preview
  hasAttachments: boolean;
  isRead: boolean;
  isStarred: boolean;
  isFlagged: boolean;
  labels: string[];      // Gmail/Outlook categories
  size?: number;         // bytes
}

export interface EmailDetail extends EmailSummary {
  headers: EmailHeader[];
  textBody?: string;
  htmlBody?: string;
  attachments: Array<{
    id: string;
    filename: string;
    contentType: string;
    size: number;
  }>;
}

export interface EmailFolder {
  name: string;
  path: string;
  delimiter?: string;
  flags?: string[];
  messageCount?: number;
  unreadCount?: number;
}

export interface SendOptions {
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject: string;
  text?: string;
  html?: string;
  attachments?: Array<{
    filename: string;
    content: Buffer | string; // string is treated as utf8 text
    contentType?: string;
  }>;
  inReplyTo?: string;
  references?: string[];
  /** Folder to append the saved copy to (defaults to "Sent"). */
  sentFolder?: string;
}

export interface AttachmentData {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  /** Base64-encoded bytes — tool returns this directly. */
  data: string;
}

export interface SearchOptions {
  folder?: string;
  query?: string;            // IMAP search syntax or Gmail query
  from?: string;
  to?: string;
  subject?: string;
  since?: string;            // ISO date
  before?: string;           // ISO date
  limit?: number;
  /** When true, search results include bodies; otherwise only snippets. */
  returnBody?: boolean;
}

export interface BatchResult {
  succeeded: string[];
  failed: Array<{ id: string; error: string }>;
  total: number;
}

// ─── Provider interface ────────────────────────────────────────────────────

export interface EmailProvider {
  /** Verify the credential is still valid. Returns true on success. */
  testConnection(): Promise<boolean>;

  listFolders(): Promise<EmailFolder[]>;

  createFolder(name: string): Promise<EmailFolder>;

  search(opts: SearchOptions): Promise<EmailSummary[]>;

  getEmail(id: string, folder?: string): Promise<EmailDetail>;

  getAttachment(emailId: string, attachmentId: string, folder?: string): Promise<AttachmentData>;

  send(opts: SendOptions): Promise<{ id: string; folder: string }>;

  /** Save a draft without sending. */
  saveDraft(opts: SendOptions): Promise<{ id: string }>;

  listDrafts(limit?: number): Promise<EmailSummary[]>;

  move(id: string, targetFolder: string, sourceFolder?: string): Promise<void>;

  deleteEmail(id: string, permanent?: boolean, sourceFolder?: string): Promise<void>;

  mark(
    id: string,
    flags: { read?: boolean; starred?: boolean; flagged?: boolean },
    sourceFolder?: string
  ): Promise<void>;

  /** Batch variants run sequentially with per-item error capture. */
  batchMove(ids: string[], targetFolder: string, sourceFolder?: string): Promise<BatchResult>;
  batchDelete(ids: string[], permanent?: boolean, sourceFolder?: string): Promise<BatchResult>;
  batchMark(
    ids: string[],
    flags: { read?: boolean; starred?: boolean; flagged?: boolean },
    sourceFolder?: string
  ): Promise<BatchResult>;

  /** Release any held resources (open IMAP connections, etc.). */
  close(): Promise<void>;
}

// ─── IMAP/SMTP provider ────────────────────────────────────────────────────

class ImapEmailProvider implements EmailProvider {
  private imap: ImapFlow;
  private smtp: Transporter;
  private readonly secret: Extract<AccountSecret, { kind: "imap" }>;

  constructor(account: AccountRecord) {
    if (account.secret.kind !== "imap") {
      throw new Error("ImapEmailProvider requires an imap secret");
    }
    this.secret = account.secret;
    this.imap = new ImapFlow({
      host: this.secret.imapHost,
      port: this.secret.imapPort,
      secure: this.secret.imapSecure,
      auth: { user: this.secret.user, pass: this.secret.password },
      logger: false,
    });
    this.smtp = nodemailer.createTransport({
      host: this.secret.smtpHost,
      port: this.secret.smtpPort,
      secure: this.secret.smtpSecure,
      auth: { user: this.secret.user, pass: this.secret.password },
      requireTLS: !this.secret.smtpSecure ? false : true,
    });
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.imap.connect();
      await this.imap.logout();
      await this.smtp.verify();
      return true;
    } catch (err) {
      logger.warn("IMAP/SMTP connection test failed", {
        email: this.secret.user,
        err: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  }

  async listFolders(): Promise<EmailFolder[]> {
    const lock = await this.imap.getMailboxLock("INBOX");
    try {
      const list = await this.imap.list();
      return list.map((b) => ({
        name: b.name,
        path: b.path,
        delimiter: b.delimiter,
        flags: b.flags ? Array.from(b.flags) : undefined,
      }));
    } finally {
      lock.release();
    }
  }

  async createFolder(name: string): Promise<EmailFolder> {
    await this.imap.mailboxCreate(name);
    return { name, path: name };
  }

  private buildSearchCriteria(opts: SearchOptions): Record<string, unknown> {
    const criteria: Record<string, unknown> = {};
    if (opts.query) criteria.text = opts.query;
    if (opts.from) criteria.from = opts.from;
    if (opts.to) criteria.to = opts.to;
    if (opts.subject) criteria.subject = opts.subject;
    if (opts.since) criteria.since = new Date(opts.since);
    if (opts.before) criteria.before = new Date(opts.before);
    return criteria;
  }

  async search(opts: SearchOptions): Promise<EmailSummary[]> {
    const folder = opts.folder ?? "INBOX";
    const lock = await this.imap.getMailboxLock(folder);
    try {
      const criteria = this.buildSearchCriteria(opts);
      const searchResult = await this.imap.search(criteria);
      const uids: number[] = Array.isArray(searchResult) ? searchResult : [];
      const limit = opts.limit ?? config.defaultSearchLimit;
      const slice = uids.slice(-limit).reverse();
      if (slice.length === 0) return [];

      const messages = await this.imap.fetchAll(
        slice,
        { uid: true, envelope: true, flags: true, bodyStructure: true, internalDate: true, size: true },
        { changedSince: undefined }
      );
      return messages.map((msg) => imapToSummary(msg, folder));
    } finally {
      lock.release();
    }
  }

  async getEmail(id: string, folder: string = "INBOX"): Promise<EmailDetail> {
    const lock = await this.imap.getMailboxLock(folder);
    try {
      const uid = Number(id);
      const result = await this.imap.fetchOne(
        uid,
        { uid: true, source: true, envelope: true, flags: true, bodyStructure: true, internalDate: true, size: true },
        { uid: true }
      );
      if (!result || !result.source) {
        throw new Error(`Email ${id} not found in ${folder}`);
      }
      const parsed = await simpleParser(result.source);
      const flags = result.flags ? new Set(Array.from(result.flags)) : new Set<string>();
      return parsedToDetail(parsed, {
        id: String(result.uid),
        folder,
        flags,
        size: result.size,
        threadId: undefined,
        labels: [],
      });
    } finally {
      lock.release();
    }
  }

  async getAttachment(
    emailId: string,
    attachmentId: string,
    folder: string = "INBOX"
  ): Promise<AttachmentData> {
    const lock = await this.imap.getMailboxLock(folder);
    try {
      const result = await this.imap.fetchOne(
        Number(emailId),
        { uid: true, source: true },
        { uid: true }
      );
      if (!result || !result.source) {
        throw new Error(`Email ${emailId} not found`);
      }
      const message = await simpleParser(result.source);
      const target = message.attachments.find(
        (a: Attachment) => a.contentId === attachmentId || a.filename === attachmentId
      );
      if (!target) {
        throw new Error(`Attachment ${attachmentId} not found on email ${emailId}`);
      }
      const data = target.content as Buffer;
      if (data.length > config.attachmentMaxBytes) {
        throw new Error(
          `Attachment ${data.length} bytes exceeds EMAIL_ATTACHMENT_MAX_BYTES (${config.attachmentMaxBytes})`
        );
      }
      return {
        id: target.contentId ?? target.filename ?? attachmentId,
        filename: target.filename ?? "attachment",
        contentType: target.contentType ?? "application/octet-stream",
        size: data.length,
        data: data.toString("base64"),
      };
    } finally {
      lock.release();
    }
  }

  async send(opts: SendOptions): Promise<{ id: string; folder: string }> {
    const info = await this.smtp.sendMail({
      from: this.secret.user,
      to: arrayify(opts.to),
      cc: opts.cc ? arrayify(opts.cc) : undefined,
      bcc: opts.bcc ? arrayify(opts.bcc) : undefined,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
      attachments: opts.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType,
      })),
      inReplyTo: opts.inReplyTo,
      references: opts.references,
    });
    return { id: info.messageId, folder: opts.sentFolder ?? "Sent" };
  }

  async saveDraft(opts: SendOptions): Promise<{ id: string }> {
    const lock = await this.imap.getMailboxLock("Drafts");
    try {
      const raw = await buildRawMime(opts, this.secret.user);
      const result = await this.imap.append("Drafts", raw, ["\\Draft"]);
      const appended = result && typeof result === "object" ? result : null;
      return { id: String(appended?.uid ?? Date.now()) };
    } finally {
      lock.release();
    }
  }

  async listDrafts(limit: number = 20): Promise<EmailSummary[]> {
    return this.search({ folder: "Drafts", limit });
  }

  async move(id: string, targetFolder: string, sourceFolder: string = "INBOX"): Promise<void> {
    const lock = await this.imap.getMailboxLock(sourceFolder);
    try {
      await this.imap.messageMove(Number(id), targetFolder, { uid: true });
    } finally {
      lock.release();
    }
  }

  async deleteEmail(id: string, permanent: boolean = false, sourceFolder: string = "INBOX"): Promise<void> {
    const lock = await this.imap.getMailboxLock(sourceFolder);
    try {
      if (permanent) {
        await this.imap.messageDelete([Number(id)], { uid: true });
      } else {
        await this.imap.messageMove(Number(id), "Trash", { uid: true });
      }
    } finally {
      lock.release();
    }
  }

  async mark(
    id: string,
    flags: { read?: boolean; starred?: boolean; flagged?: boolean },
    sourceFolder: string = "INBOX"
  ): Promise<void> {
    const lock = await this.imap.getMailboxLock(sourceFolder);
    try {
      const newFlags = new Set<string>();
      if (flags.read === true) newFlags.add("\\Seen");
      if (flags.starred === true) newFlags.add("\\Flagged");
      const existing = await this.imap.fetchOne(Number(id), { uid: true, flags: true }, { uid: true });
      const current = existing && existing.flags
        ? new Set(Array.from(existing.flags))
        : new Set<string>();
      if (flags.read === false) current.delete("\\Seen");
      if (flags.starred === false) current.delete("\\Flagged");
      if (flags.flagged === true) newFlags.add("$Forwarded");
      for (const f of newFlags) current.add(f);
      await this.imap.messageFlagsAdd([Number(id)], Array.from(current), { uid: true });
    } finally {
      lock.release();
    }
  }

  async batchMove(
    ids: string[],
    targetFolder: string,
    sourceFolder: string = "INBOX"
  ): Promise<BatchResult> {
    return runBatch(ids, async (id) => {
      await this.move(id, targetFolder, sourceFolder);
    });
  }

  async batchDelete(
    ids: string[],
    permanent: boolean = false,
    sourceFolder: string = "INBOX"
  ): Promise<BatchResult> {
    return runBatch(ids, async (id) => {
      await this.deleteEmail(id, permanent, sourceFolder);
    });
  }

  async batchMark(
    ids: string[],
    flags: { read?: boolean; starred?: boolean; flagged?: boolean },
    sourceFolder: string = "INBOX"
  ): Promise<BatchResult> {
    return runBatch(ids, async (id) => {
      await this.mark(id, flags, sourceFolder);
    });
  }

  async close(): Promise<void> {
    try {
      if (this.imap.authenticated) await this.imap.logout();
    } catch {
      /* connection may already be closed */
    }
    this.smtp.close();
  }
}

// ─── Gmail REST provider (OAuth) ───────────────────────────────────────────

class GmailEmailProvider implements EmailProvider {
  private gmail: gmail_v1.Gmail;

  constructor(account: AccountRecord) {
    if (account.secret.kind !== "gmail-oauth") {
      throw new Error("GmailEmailProvider requires a gmail-oauth secret");
    }
    const secret = account.secret;
    const oauth2 = new google.auth.OAuth2(
      config.gmailClientId,
      config.gmailClientSecret
    );
    oauth2.setCredentials({
      access_token: secret.accessToken,
      refresh_token: secret.refreshToken,
      expiry_date: secret.expiresAt,
    });
    this.gmail = google.gmail({ version: "v1", auth: oauth2 });
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.gmail.users.getProfile({ userId: "me" });
      return true;
    } catch {
      return false;
    }
  }

  async listFolders(): Promise<EmailFolder[]> {
    const res = await this.gmail.users.labels.list({ userId: "me" });
    return (res.data.labels ?? []).map((l) => ({
      name: l.name ?? l.id ?? "unknown",
      path: l.id ?? l.name ?? "unknown",
    }));
  }

  async createFolder(name: string): Promise<EmailFolder> {
    const res = await this.gmail.users.labels.create({
      userId: "me",
      requestBody: { name, labelListVisibility: "labelShow", messageListVisibility: "show" },
    });
    return { name: res.data.name ?? name, path: res.data.id ?? name };
  }

  private buildQuery(opts: SearchOptions): string {
    const parts: string[] = [];
    if (opts.query) parts.push(opts.query);
    if (opts.from) parts.push(`from:${opts.from}`);
    if (opts.to) parts.push(`to:${opts.to}`);
    if (opts.subject) parts.push(`subject:${opts.subject}`);
    if (opts.since) parts.push(`after:${new Date(opts.since).getTime() / 1000 | 0}`);
    if (opts.before) parts.push(`before:${new Date(opts.before).getTime() / 1000 | 1}`);
    return parts.join(" ");
  }

  async search(opts: SearchOptions): Promise<EmailSummary[]> {
    const q = this.buildQuery(opts);
    const res = await this.gmail.users.messages.list({
      userId: "me",
      q: q || undefined,
      maxResults: opts.limit ?? config.defaultSearchLimit,
      labelIds: opts.folder ? [opts.folder] : undefined,
    });
    const messages = res.data.messages ?? [];
    if (messages.length === 0) return [];

    const format = opts.returnBody ? "full" : "metadata";
    const headers = ["From", "To", "Cc", "Bcc", "Subject", "Date"];
    const detailed = await Promise.all(
      messages.map((m) =>
        this.gmail.users.messages.get({
          userId: "me",
          id: m.id!,
          format,
          metadataHeaders: headers,
        })
      )
    );
    return detailed.map((r) => gmailToSummary(r.data));
  }

  async getEmail(id: string, _folder?: string): Promise<EmailDetail> {
    const res = await this.gmail.users.messages.get({
      userId: "me",
      id,
      format: "full",
    });
    return gmailToDetail(res.data);
  }

  async getAttachment(emailId: string, attachmentId: string): Promise<AttachmentData> {
    const res = await this.gmail.users.messages.attachments.get({
      userId: "me",
      messageId: emailId,
      id: attachmentId,
    });
    const size = res.data.size ?? 0;
    if (size > config.attachmentMaxBytes) {
      throw new Error(`Attachment ${size} bytes exceeds EMAIL_ATTACHMENT_MAX_BYTES (${config.attachmentMaxBytes})`);
    }
    return {
      id: attachmentId,
      filename: attachmentId,
      contentType: "application/octet-stream",
      size,
      data: res.data.data ?? "",
    };
  }

  async send(opts: SendOptions): Promise<{ id: string; folder: string }> {
    const raw = await buildRawMime(opts, "");
    const res = await this.gmail.users.messages.send({
      userId: "me",
      requestBody: { raw },
    });
    return { id: res.data.id ?? "", folder: "SENT" };
  }

  async saveDraft(opts: SendOptions): Promise<{ id: string }> {
    const raw = await buildRawMime(opts, "");
    const res = await this.gmail.users.drafts.create({
      userId: "me",
      requestBody: { message: { raw } },
    });
    return { id: res.data.id ?? "" };
  }

  async listDrafts(limit: number = 20): Promise<EmailSummary[]> {
    const res = await this.gmail.users.drafts.list({ userId: "me", maxResults: limit });
    const drafts = res.data.drafts ?? [];
    if (drafts.length === 0) return [];
    const detailed = await Promise.all(
      drafts.map((d) =>
        this.gmail.users.drafts.get({ userId: "me", id: d.id!, format: "metadata" })
      )
    );
    return detailed.map((r) => gmailToSummary(r.data.message!));
  }

  async move(id: string, targetFolder: string, _sourceFolder?: string): Promise<void> {
    await this.gmail.users.messages.modify({
      userId: "me",
      id,
      requestBody: { addLabelIds: [targetFolder], removeLabelIds: ["INBOX"] },
    });
  }

  async deleteEmail(id: string, permanent: boolean = false): Promise<void> {
    if (permanent) {
      await this.gmail.users.messages.delete({ userId: "me", id });
    } else {
      await this.gmail.users.messages.modify({
        userId: "me",
        id,
        requestBody: { addLabelIds: ["TRASH"], removeLabelIds: ["INBOX"] },
      });
    }
  }

  async mark(id: string, flags: { read?: boolean; starred?: boolean; flagged?: boolean }): Promise<void> {
    const add: string[] = [];
    const remove: string[] = [];
    if (flags.read === true) add.push("UNREAD");
    if (flags.read === false) remove.push("UNREAD");
    if (flags.starred === true) add.push("STARRED");
    if (flags.starred === false) remove.push("STARRED");
    if (flags.flagged === true) add.push("FLAGGED");
    if (add.length || remove.length) {
      await this.gmail.users.messages.modify({
        userId: "me",
        id,
        requestBody: { addLabelIds: add, removeLabelIds: remove },
      });
    }
  }

  async batchMove(ids: string[], targetFolder: string): Promise<BatchResult> {
    return runBatch(ids, async (id) => this.move(id, targetFolder));
  }
  async batchDelete(ids: string[], permanent: boolean = false): Promise<BatchResult> {
    return runBatch(ids, async (id) => this.deleteEmail(id, permanent));
  }
  async batchMark(ids: string[], flags: { read?: boolean; starred?: boolean; flagged?: boolean }): Promise<BatchResult> {
    return runBatch(ids, async (id) => this.mark(id, flags));
  }

  async close(): Promise<void> {
    /* nothing to close for REST client */
  }
}

// ─── Outlook Graph provider (OAuth) ────────────────────────────────────────

class OutlookEmailProvider implements EmailProvider {
  private client: Client;

  constructor(account: AccountRecord) {
    if (account.secret.kind !== "outlook-oauth") {
      throw new Error("OutlookEmailProvider requires an outlook-oauth secret");
    }
    const secret = account.secret;
    // For MVP we rely on access/refresh tokens issued through the OAuth flow
    // that tool handlers will run. Graph accepts a bearer token directly.
    this.client = Client.init({
      authProvider: (done) => done(null, secret.accessToken),
    });
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.client.api("/me").get();
      return true;
    } catch {
      return false;
    }
  }

  async listFolders(): Promise<EmailFolder[]> {
    const res = await this.client.api("/me/mailFolders").get();
    return (res.value as Array<{ displayName: string; id: string; totalItemCount?: number; unreadItemCount?: number }>).map((f) => ({
      name: f.displayName,
      path: f.id,
      messageCount: f.totalItemCount,
      unreadCount: f.unreadItemCount,
    }));
  }

  async createFolder(name: string): Promise<EmailFolder> {
    const res = await this.client.api("/me/mailFolders").post({ displayName: name });
    return { name: res.displayName, path: res.id };
  }

  async search(opts: SearchOptions): Promise<EmailSummary[]> {
    const filters: string[] = [];
    if (opts.query) filters.push(`contains(subject,'${escapeOData(opts.query)}')`);
    if (opts.from) filters.push(`from/emailAddress/address eq '${escapeOData(opts.from)}'`);
    if (opts.since) filters.push(`receivedDateTime ge ${new Date(opts.since).toISOString()}`);
    if (opts.before) filters.push(`receivedDateTime lt ${new Date(opts.before).toISOString()}`);

    const params: Record<string, string> = {
      $top: String(opts.limit ?? config.defaultSearchLimit),
      $select: "id,conversationId,subject,from,to,receivedDateTime,preview,hasAttachments,isRead,flag,body",
    };
    if (filters.length) params.$filter = filters.join(" and ");
    if (opts.folder) params.$filter = (params.$filter ? params.$filter + " and " : "") + `parentFolderId eq '${escapeOData(opts.folder)}'`;

    const res = await this.client.api("/me/messages").query(params).get();
    return (res.value as Array<Record<string, unknown>>).map(outlookToSummary);
  }

  async getEmail(id: string): Promise<EmailDetail> {
    const res = await this.client.api(`/me/messages/${id}`).get();
    return outlookToDetail(res);
  }

  async getAttachment(emailId: string, attachmentId: string): Promise<AttachmentData> {
    const res = await this.client.api(`/me/messages/${emailId}/attachments/${attachmentId}`).get();
    const size = res.size ?? 0;
    if (size > config.attachmentMaxBytes) {
      throw new Error(`Attachment ${size} bytes exceeds EMAIL_ATTACHMENT_MAX_BYTES (${config.attachmentMaxBytes})`);
    }
    return {
      id: attachmentId,
      filename: res.name ?? attachmentId,
      contentType: res.contentType ?? "application/octet-stream",
      size,
      data: res.contentBytes ?? "",
    };
  }

  async send(opts: SendOptions): Promise<{ id: string; folder: string }> {
    const message = buildGraphMessage(opts);
    await this.client.api("/me/sendMail").post({ message, saveToSentItems: true });
    return { id: "sent", folder: "sentitems" };
  }

  async saveDraft(opts: SendOptions): Promise<{ id: string }> {
    const message = buildGraphMessage(opts);
    const res = await this.client.api("/me/messages").post(message);
    return { id: res.id };
  }

  async listDrafts(limit: number = 20): Promise<EmailSummary[]> {
    const res = await this.client
      .api("/me/messages")
      .query({ $filter: "isDraft eq true", $top: String(limit) })
      .get();
    return (res.value as Array<Record<string, unknown>>).map(outlookToSummary);
  }

  async move(id: string, targetFolder: string): Promise<void> {
    await this.client.api(`/me/messages/${id}/move`).post({ destinationId: targetFolder });
  }

  async deleteEmail(id: string, permanent: boolean = false): Promise<void> {
    if (permanent) {
      await this.client.api(`/me/messages/${id}`).delete();
    } else {
      await this.client.api(`/me/messages/${id}/move`).post({ destinationId: "deleteditems" });
    }
  }

  async mark(id: string, flags: { read?: boolean; starred?: boolean; flagged?: boolean }): Promise<void> {
    const body: Record<string, unknown> = {};
    if (flags.read !== undefined) body.isRead = flags.read;
    if (flags.flagged !== undefined) {
      body.flag = { flagStatus: flags.flagged ? "flagged" : "notFlagged" };
    }
    await this.client.api(`/me/messages/${id}`).patch(body);
  }

  async batchMove(ids: string[], targetFolder: string): Promise<BatchResult> {
    return runBatch(ids, async (id) => this.move(id, targetFolder));
  }
  async batchDelete(ids: string[], permanent: boolean = false): Promise<BatchResult> {
    return runBatch(ids, async (id) => this.deleteEmail(id, permanent));
  }
  async batchMark(ids: string[], flags: { read?: boolean; starred?: boolean; flagged?: boolean }): Promise<BatchResult> {
    return runBatch(ids, async (id) => this.mark(id, flags));
  }

  async close(): Promise<void> {
    /* nothing to close */
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function arrayify(v: string | string[]): string[] {
  return Array.isArray(v) ? v : [v];
}

/**
 * mailparser's AddressObject can be a single object OR an array of objects.
 * Each one has `.value: EmailAddress[]`. Normalize to a flat address list.
 */
function addressListValues(addr: unknown): EmailAddressObj[] {
  if (!addr) return [];
  const objects = Array.isArray(addr) ? addr : [addr];
  const out: EmailAddressObj[] = [];
  for (const obj of objects) {
    const value = (obj as { value?: EmailAddress[] }).value ?? [];
    for (const a of value) {
      out.push({ name: a.name, address: a.address ?? "" });
    }
  }
  return out;
}

async function runBatch(
  ids: string[],
  fn: (id: string) => Promise<void>
): Promise<BatchResult> {
  const succeeded: string[] = [];
  const failed: Array<{ id: string; error: string }> = [];
  for (const id of ids) {
    try {
      await fn(id);
      succeeded.push(id);
    } catch (err) {
      failed.push({ id, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return { succeeded, failed, total: ids.length };
}

function escapeOData(s: string): string {
  return s.replace(/'/g, "''");
}

async function buildRawMime(opts: SendOptions, from: string): Promise<string> {
  // Delegate to nodemailer to produce a clean RFC 5322 message
  const transport = nodemailer.createTransport({ jsonTransport: true });
  const info = await transport.sendMail({
    from: from || undefined,
    to: arrayify(opts.to),
    cc: opts.cc ? arrayify(opts.cc) : undefined,
    bcc: opts.bcc ? arrayify(opts.bcc) : undefined,
    subject: opts.subject,
    text: opts.text,
    html: opts.html,
    attachments: opts.attachments?.map((a) => ({
      filename: a.filename,
      content: a.content,
      contentType: a.contentType,
    })),
    inReplyTo: opts.inReplyTo,
    references: opts.references,
  });
  return Buffer.from(String(info.message), "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function buildGraphMessage(opts: SendOptions): Record<string, unknown> {
  return {
    subject: opts.subject,
    body: { contentType: opts.html ? "HTML" : "Text", content: opts.html ?? opts.text ?? "" },
    toRecipients: arrayify(opts.to).map((a) => ({ emailAddress: { address: a } })),
    ccRecipients: opts.cc ? arrayify(opts.cc).map((a) => ({ emailAddress: { address: a } })) : [],
    bccRecipients: opts.bcc ? arrayify(opts.bcc).map((a) => ({ emailAddress: { address: a } })) : [],
  };
}

// ─── IMAP result converters ────────────────────────────────────────────────

function imapToSummary(msg: unknown, folder: string): EmailSummary {
  // ImapFlow envelope shape (loose typing; the lib's types are not always exported)
  const m = msg as {
    uid: number;
    envelope?: {
      subject?: string;
      from?: Array<{ name?: string; address?: string }>;
      to?: Array<{ name?: string; address?: string }>;
      cc?: Array<{ name?: string; address?: string }>;
      bcc?: Array<{ name?: string; address?: string }>;
      date?: Date;
      messageId?: string;
    };
    flags?: Set<string> | string[];
    bodyStructure?: { childNodes?: unknown[] };
    internalDate?: Date;
    size?: number;
  };

  const flags = m.flags instanceof Set ? m.flags : new Set(m.flags ?? []);
  const from = (m.envelope?.from ?? []).map((a) => ({ name: a.name, address: a.address ?? "" }));
  const to = (m.envelope?.to ?? []).map((a) => ({ name: a.name, address: a.address ?? "" }));
  const cc = (m.envelope?.cc ?? []).map((a) => ({ name: a.name, address: a.address ?? "" }));
  const bcc = (m.envelope?.bcc ?? []).map((a) => ({ name: a.name, address: a.address ?? "" }));
  const subject = m.envelope?.subject ?? "(no subject)";
  const date = (m.envelope?.date ?? m.internalDate ?? new Date()).toISOString();
  const hasAttachments = Boolean(
    m.bodyStructure && Array.isArray(m.bodyStructure.childNodes) && m.bodyStructure.childNodes.length > 1
  );

  return {
    id: String(m.uid),
    folder,
    from,
    to,
    cc,
    bcc,
    subject,
    date,
    snippet: subject,
    hasAttachments,
    isRead: flags.has("\\Seen"),
    isStarred: flags.has("\\Flagged"),
    isFlagged: flags.has("$Forwarded"),
    labels: Array.from(flags),
    size: m.size,
  };
}

function parsedToDetail(
  parsed: ParsedMail,
  ctx: { id: string; folder: string; flags: Set<string>; size?: number; threadId?: string; labels: string[] }
): EmailDetail {
  const from = addressListValues(parsed.from);
  const to = addressListValues(parsed.to);
  const cc = addressListValues(parsed.cc);
  const bcc = addressListValues(parsed.bcc);
  const headers: EmailHeader[] = Object.entries(parsed.headers ?? new Map()).map(([name, value]) => ({
    name,
    value: typeof value === "string" ? value : JSON.stringify(value),
  }));
  return {
    id: ctx.id,
    folder: ctx.folder,
    threadId: ctx.threadId,
    from,
    to,
    cc,
    bcc,
    subject: parsed.subject ?? "(no subject)",
    date: (parsed.date ?? new Date()).toISOString(),
    snippet: (parsed.text ?? "").slice(0, 200),
    hasAttachments: (parsed.attachments?.length ?? 0) > 0,
    isRead: ctx.flags.has("\\Seen"),
    isStarred: ctx.flags.has("\\Flagged"),
    isFlagged: ctx.flags.has("$Forwarded"),
    labels: ctx.labels,
    size: typeof ctx.size === "number" ? ctx.size : undefined,
    headers,
    textBody: typeof parsed.text === "string" ? parsed.text : undefined,
    htmlBody: typeof parsed.html === "string" ? parsed.html : undefined,
    attachments: (parsed.attachments ?? []).map((a: Attachment) => ({
      id: a.contentId ?? a.filename ?? "",
      filename: a.filename ?? "attachment",
      contentType: a.contentType ?? "application/octet-stream",
      size: (a.content as Buffer)?.length ?? 0,
    })),
  };
}

function gmailToSummary(msg: gmail_v1.Schema$Message): EmailSummary {
  const headers = parseGmailHeaders(msg.payload?.headers);
  const labels = msg.labelIds ?? [];
  return {
    id: msg.id ?? "",
    threadId: msg.threadId ?? undefined,
    folder: labels.includes("INBOX") ? "INBOX" : (labels[0] ?? "INBOX"),
    from: parseGmailAddresses(headers.From),
    to: parseGmailAddresses(headers.To),
    cc: parseGmailAddresses(headers.Cc),
    bcc: parseGmailAddresses(headers.Bcc),
    subject: headers.Subject ?? "(no subject)",
    date: headers.Date ? new Date(headers.Date).toISOString() : new Date().toISOString(),
    snippet: msg.snippet ?? "",
    hasAttachments: hasGmailAttachments(msg.payload),
    isRead: !labels.includes("UNREAD"),
    isStarred: labels.includes("STARRED"),
    isFlagged: labels.includes("FLAGGED"),
    labels,
    size: msg.sizeEstimate ?? undefined,
  };
}

function gmailToDetail(msg: gmail_v1.Schema$Message): EmailDetail {
  const summary = gmailToSummary(msg);
  const headers = parseGmailHeaders(msg.payload?.headers);
  const textBody = findGmailPart(msg.payload, "text/plain");
  const htmlBody = findGmailPart(msg.payload, "text/html");
  const attachments = collectGmailAttachments(msg.payload, []);
  return {
    ...summary,
    headers: Object.entries(headers).map(([name, value]) => ({ name, value })),
    textBody,
    htmlBody,
    attachments,
  };
}

function parseGmailHeaders(headers?: gmail_v1.Schema$MessagePartHeader[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const h of headers ?? []) {
    if (h.name && h.value) out[h.name] = h.value;
  }
  return out;
}

function parseGmailAddresses(value?: string): EmailAddressObj[] {
  if (!value) return [];
  return value.split(",").map((entry) => {
    const m = entry.trim().match(/^(?:"?([^"<]*?)"?\s*)?<?([^>]+)>?$/);
    if (!m) return { address: entry.trim() };
    return { name: m[1]?.trim() || undefined, address: (m[2] ?? entry).trim() };
  });
}

function hasGmailAttachments(part?: gmail_v1.Schema$MessagePart): boolean {
  if (!part) return false;
  if (part.filename && part.filename.length > 0) return true;
  return (part.parts ?? []).some(hasGmailAttachments);
}

function findGmailPart(part: gmail_v1.Schema$MessagePart | undefined, mime: string): string | undefined {
  if (!part) return undefined;
  if (part.mimeType === mime && part.body?.data) {
    return Buffer.from(part.body.data, "base64").toString("utf8");
  }
  for (const child of part.parts ?? []) {
    const found = findGmailPart(child, mime);
    if (found) return found;
  }
  return undefined;
}

function collectGmailAttachments(
  part: gmail_v1.Schema$MessagePart | undefined,
  acc: Array<{ id: string; filename: string; contentType: string; size: number }>
): Array<{ id: string; filename: string; contentType: string; size: number }> {
  if (!part) return acc;
  if (part.filename && part.body?.attachmentId) {
    acc.push({
      id: part.body.attachmentId,
      filename: part.filename,
      contentType: part.mimeType ?? "application/octet-stream",
      size: part.body.size ?? 0,
    });
  }
  for (const child of part.parts ?? []) {
    collectGmailAttachments(child, acc);
  }
  return acc;
}

function outlookToSummary(msg: Record<string, unknown>): EmailSummary {
  const from = ((msg.from as { emailAddress: { name?: string; address: string } })?.emailAddress) ?? {
    name: undefined,
    address: "",
  };
  return {
    id: String(msg.id ?? ""),
    threadId: (msg.conversationId as string) ?? undefined,
    folder: (msg.parentFolderId as string) ?? "inbox",
    from: [{ name: from.name, address: from.address }],
    to: ((msg.toRecipients as Array<{ emailAddress: { name?: string; address: string } }>) ?? []).map((r) => ({
      name: r.emailAddress.name,
      address: r.emailAddress.address,
    })),
    cc: ((msg.ccRecipients as Array<{ emailAddress: { name?: string; address: string } }>) ?? []).map((r) => ({
      name: r.emailAddress.name,
      address: r.emailAddress.address,
    })),
    bcc: ((msg.bccRecipients as Array<{ emailAddress: { name?: string; address: string } }>) ?? []).map((r) => ({
      name: r.emailAddress.name,
      address: r.emailAddress.address,
    })),
    subject: (msg.subject as string) ?? "(no subject)",
    date: (msg.receivedDateTime as string) ?? new Date().toISOString(),
    snippet: (msg.bodyPreview as string) ?? "",
    hasAttachments: Boolean(msg.hasAttachments),
    isRead: Boolean(msg.isRead),
    isStarred: Boolean((msg.flag as { flagStatus?: string })?.flagStatus === "flagged"),
    isFlagged: Boolean((msg.flag as { flagStatus?: string })?.flagStatus === "flagged"),
    labels: ((msg.categories as string[]) ?? []),
    size: undefined,
  };
}

function outlookToDetail(msg: Record<string, unknown>): EmailDetail {
  const summary = outlookToSummary(msg);
  return {
    ...summary,
    headers: [],
    textBody: (msg.body as { contentType?: string; content?: string })?.contentType === "Text"
      ? (msg.body as { content?: string }).content
      : undefined,
    htmlBody: (msg.body as { contentType?: string; content?: string })?.contentType === "HTML"
      ? (msg.body as { content?: string }).content
      : undefined,
    attachments: [],
  };
}

// ─── Public factory ────────────────────────────────────────────────────────

/** Build a provider from a stored account. Caller is responsible for close(). */
export function providerFor(account: AccountRecord): EmailProvider {
  switch (account.secret.kind) {
    case "imap":
      return new ImapEmailProvider(account);
    case "gmail-oauth":
      return new GmailEmailProvider(account);
    case "outlook-oauth":
      return new OutlookEmailProvider(account);
  }
}
