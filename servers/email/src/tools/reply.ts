import { z } from "zod";
import { findAccount } from "../credential-store.js";
import { providerFor } from "../email-client.js";
import { ok, fail, blockedIfReadOnly } from "./shared.js";

const schema = z.object({
  account: z.string().min(1).describe("Account ID or email address to reply from"),
  emailId: z.string().min(1).describe("ID of the message being replied to"),
  folder: z.string().optional().default("INBOX"),
  text: z.string().optional(),
  html: z.string().optional(),
  replyAll: z.boolean().optional().default(false).describe("Reply to all original recipients (Cc included)"),
});

export const reply = {
  name: "email_reply",
  description:
    "Reply to an existing email. Preserves the thread via In-Reply-To / References headers. " +
    "Set replyAll=true to include the original Cc list.",
  schema,
  handler: async (args: z.infer<typeof schema>) => {
    const blocked = blockedIfReadOnly("Failed to send reply");
    if (blocked) return blocked;
    if (!args.text && !args.html) {
      return fail("Failed to send reply", new Error("Either text or html body is required"));
    }
    let provider;
    try {
      const record = await findAccount(args.account);
      if (!record) {
        return fail("Failed to send reply", new Error(`No account matching "${args.account}"`));
      }
      provider = providerFor(record);
      const original = await provider.getEmail(args.emailId, args.folder);

      // Build subject with Re: prefix (RFC 5256)
      const subject = original.subject.toLowerCase().startsWith("re: ")
        ? original.subject
        : `Re: ${original.subject}`;

      // To: original sender; Cc: original Cc (only when replyAll=true)
      const to = original.from.map((a) => a.address);
      const cc = args.replyAll ? original.to.concat(original.cc).map((a) => a.address) : undefined;

      // In-Reply-To and References for threading (use the first Message-ID header if present)
      const messageId = original.headers.find((h) => h.name.toLowerCase() === "message-id")?.value;
      const references = original.headers
        .find((h) => h.name.toLowerCase() === "references")?.value
        ?.split(/\s+/)
        .filter(Boolean) ?? [];
      if (messageId) references.push(messageId.replace(/^<|>$/g, ""));

      const result = await provider.send({
        to,
        cc,
        subject,
        text: args.text,
        html: args.html,
        inReplyTo: messageId,
        references,
      });
      return ok(`Sent reply **${subject}** (id: ${result.id})`);
    } catch (err) {
      return fail("Failed to send reply", err);
    } finally {
      if (provider) await provider.close().catch(() => {});
    }
  },
};
