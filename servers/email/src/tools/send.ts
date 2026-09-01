import { z } from "zod";
import { findAccount } from "../credential-store.js";
import { providerFor } from "../email-client.js";
import { ok, fail, blockedIfReadOnly } from "./shared.js";

const schema = z.object({
  account: z.string().min(1).describe("Account ID or email address to send from"),
  to: z.union([z.string().email(), z.array(z.string().email())]).describe("Recipient(s)"),
  subject: z.string().min(1).max(998),
  text: z.string().optional().describe("Plain text body"),
  html: z.string().optional().describe("HTML body (mutually exclusive with text unless both supplied)"),
  cc: z.union([z.string().email(), z.array(z.string().email())]).optional(),
  bcc: z.union([z.string().email(), z.array(z.string().email())]).optional(),
  attachments: z
    .array(
      z.object({
        filename: z.string(),
        content: z.string().describe("UTF-8 text content (binary uploads coming in v0.2)"),
        contentType: z.string().optional(),
      })
    )
    .optional(),
});

export const send = {
  name: "email_send",
  description:
    "Compose and send a new email. Requires EMAIL_READ_ONLY=false. " +
    "For threaded replies, use email_reply instead.",
  schema,
  handler: async (args: z.infer<typeof schema>) => {
    const blocked = blockedIfReadOnly("Failed to send email");
    if (blocked) return blocked;
    if (!args.text && !args.html) {
      return fail("Failed to send email", new Error("Either text or html body is required"));
    }
    let provider;
    try {
      const record = await findAccount(args.account);
      if (!record) {
        return fail("Failed to send email", new Error(`No account matching "${args.account}"`));
      }
      provider = providerFor(record);
      const result = await provider.send({
        to: args.to,
        cc: args.cc,
        bcc: args.bcc,
        subject: args.subject,
        text: args.text,
        html: args.html,
        attachments: args.attachments?.map((a) => ({ ...a, content: a.content })),
      });
      return ok(`Sent email **${args.subject}** to ${Array.isArray(args.to) ? args.to.join(", ") : args.to} (id: ${result.id})`);
    } catch (err) {
      return fail("Failed to send email", err);
    } finally {
      if (provider) await provider.close().catch(() => {});
    }
  },
};
