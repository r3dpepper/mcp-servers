import { z } from "zod";
import { findAccount } from "../credential-store.js";
import { providerFor } from "../email-client.js";
import { ok, fail, blockedIfReadOnly } from "./shared.js";

const schema = z.object({
  account: z.string().min(1),
  to: z.union([z.string().email(), z.array(z.string().email())]),
  subject: z.string().min(1),
  text: z.string().optional(),
  html: z.string().optional(),
  cc: z.union([z.string().email(), z.array(z.string().email())]).optional(),
  bcc: z.union([z.string().email(), z.array(z.string().email())]).optional(),
});

export const draft_create = {
  name: "email_draft_create",
  description: "Save an email as a draft without sending it. Allowed even when EMAIL_READ_ONLY=true (drafts are not delivered).",
  schema,
  handler: async (args: z.infer<typeof schema>) => {
    if (!args.text && !args.html) {
      return fail("Failed to create draft", new Error("Either text or html body is required"));
    }
    let provider;
    try {
      const record = await findAccount(args.account);
      if (!record) {
        return fail("Failed to create draft", new Error(`No account matching "${args.account}"`));
      }
      provider = providerFor(record);
      const result = await provider.saveDraft({
        to: args.to,
        cc: args.cc,
        bcc: args.bcc,
        subject: args.subject,
        text: args.text,
        html: args.html,
      });
      return ok(`Saved draft **${args.subject}** (id: ${result.id})`);
    } catch (err) {
      return fail("Failed to create draft", err);
    } finally {
      if (provider) await provider.close().catch(() => {});
    }
  },
};
