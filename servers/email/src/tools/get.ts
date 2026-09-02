import { z } from "zod";
import { findAccount } from "../credential-store.js";
import { providerFor } from "../email-client.js";
import { ok, fail } from "./shared.js";

const schema = z.object({
  account: z.string().min(1).describe("Account ID or email address"),
  id: z.string().min(1).describe("Email ID (from email_search)"),
  folder: z.string().optional().default("INBOX").describe("Folder containing the message"),
});

export const get = {
  name: "email_get",
  description: "Get a single email by ID — full headers, body, and attachment metadata.",
  schema,
  handler: async ({ account, id, folder }: z.infer<typeof schema>) => {
    let provider;
    try {
      const record = await findAccount(account);
      if (!record) {
        return fail("Failed to get email", new Error(`No account matching "${account}"`));
      }
      provider = providerFor(record);
      const email = await provider.getEmail(id, folder);
      const headers = email.headers.map((h) => `${h.name}: ${h.value}`).join("\n");
      const addrLine = (a: { name?: string; address: string }[]) =>
        a.length === 0 ? "(none)" : a.map((x) => `${x.name ?? ""} <${x.address}>`).join(", ");
      const att = email.attachments.length
        ? `\n\nAttachments (${email.attachments.length}):\n${email.attachments
            .map((a) => `  - ${a.filename} (${a.contentType}, ${a.size} bytes, id: \`${a.id}\`)`)
            .join("\n")}`
        : "";
      return ok(
        `**${email.subject}**\n` +
          `From: ${addrLine(email.from)}\n` +
          `To: ${addrLine(email.to)}\n` +
          (email.cc.length ? `Cc: ${addrLine(email.cc)}\n` : "") +
          `Date: ${email.date}\n` +
          `Folder: ${email.folder}\n` +
          `Flags: ${email.isRead ? "read" : "unread"}${email.isStarred ? ", starred" : ""}${email.isFlagged ? ", flagged" : ""}\n` +
          `\n--- Headers ---\n${headers}\n` +
          `\n--- Body (text) ---\n${email.textBody ?? email.snippet ?? "(no text body)"}\n` +
          att
      );
    } catch (err) {
      return fail("Failed to get email", err);
    } finally {
      if (provider) await provider.close().catch(() => {});
    }
  },
};
