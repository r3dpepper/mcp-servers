import { z } from "zod";
import { findAccount } from "../credential-store.js";
import { providerFor } from "../email-client.js";
import { ok, fail, blockedIfReadOnly } from "./shared.js";

const schema = z.object({
  account: z.string().min(1).describe("Account ID or email address to forward from"),
  emailId: z.string().min(1).describe("ID of the message to forward"),
  folder: z.string().optional().default("INBOX"),
  to: z.union([z.string().email(), z.array(z.string().email())]).describe("New recipient(s)"),
  note: z.string().optional().describe("Optional comment prepended to the forwarded body"),
});

export const forward = {
  name: "email_forward",
  description: "Forward an email to new recipients. The original body is quoted below an optional note.",
  schema,
  handler: async (args: z.infer<typeof schema>) => {
    const blocked = blockedIfReadOnly("Failed to forward");
    if (blocked) return blocked;
    let provider;
    try {
      const record = await findAccount(args.account);
      if (!record) {
        return fail("Failed to forward", new Error(`No account matching "${args.account}"`));
      }
      provider = providerFor(record);
      const original = await provider.getEmail(args.emailId, args.folder);
      const subject = original.subject.toLowerCase().startsWith("fwd: ")
        ? original.subject
        : `Fwd: ${original.subject}`;
      const originalFrom = original.from.map((a) => a.address).join(", ");
      const originalDate = original.date;
      const quotedBody = `\n\n---------- Forwarded message ----------\nFrom: ${originalFrom}\nDate: ${originalDate}\nSubject: ${original.subject}\n\n${original.textBody ?? original.snippet ?? ""}`;
      const body = (args.note ?? "") + quotedBody;
      const result = await provider.send({
        to: args.to,
        subject,
        text: body,
      });
      return ok(`Forwarded **${original.subject}** to ${Array.isArray(args.to) ? args.to.join(", ") : args.to} (id: ${result.id})`);
    } catch (err) {
      return fail("Failed to forward", err);
    } finally {
      if (provider) await provider.close().catch(() => {});
    }
  },
};
