import { z } from "zod";
import { findAccount } from "../credential-store.js";
import { providerFor } from "../email-client.js";
import { config } from "../config.js";
import { ok, fail } from "./shared.js";

const schema = z.object({
  account: z.string().min(1).describe("Account ID or email address"),
  emailId: z.string().min(1).describe("Email ID containing the attachment"),
  attachmentId: z.string().min(1).describe(
    "Attachment ID (from email_get output) or filename (IMAP)"
  ),
  folder: z.string().optional().default("INBOX").describe("Folder containing the email"),
});

export const get_attachment = {
  name: "email_get_attachment",
  description:
    "Download an attachment by ID. Returns base64-encoded data. " +
    `Subject to EMAIL_ATTACHMENT_MAX_BYTES (${config.attachmentMaxBytes} bytes).`,
  schema,
  handler: async ({ account, emailId, attachmentId, folder }: z.infer<typeof schema>) => {
    let provider;
    try {
      const record = await findAccount(account);
      if (!record) {
        return fail("Failed to get attachment", new Error(`No account matching "${account}"`));
      }
      provider = providerFor(record);
      const att = await provider.getAttachment(emailId, attachmentId, folder);
      return ok(
        `Attachment: **${att.filename}**\n` +
          `Content-Type: ${att.contentType}\n` +
          `Size: ${att.size} bytes\n` +
          `ID: ${att.id}\n\n` +
          `Base64:\n${att.data}`
      );
    } catch (err) {
      return fail("Failed to get attachment", err);
    } finally {
      if (provider) await provider.close().catch(() => {});
    }
  },
};
