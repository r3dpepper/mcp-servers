import { z } from "zod";
import { findAccount } from "../credential-store.js";
import { providerFor } from "../email-client.js";
import { ok, fail, blockedIfReadOnly } from "./shared.js";

const schema = z.object({
  account: z.string().min(1),
  id: z.string().min(1).describe("Email ID to delete"),
  permanent: z.boolean().optional().default(false)
    .describe("Set true to permanently delete (skip the Trash folder). Default false moves to Trash."),
  sourceFolder: z.string().optional().default("INBOX").describe("Folder containing the message (IMAP only)"),
});

export const delete_email = {
  name: "email_delete",
  description: "Delete an email. By default moves to Trash; set permanent=true to skip Trash.",
  schema,
  handler: async ({ account, id, permanent, sourceFolder }: z.infer<typeof schema>) => {
    const blocked = blockedIfReadOnly("Failed to delete email");
    if (blocked) return blocked;
    let provider;
    try {
      const record = await findAccount(account);
      if (!record) {
        return fail("Failed to delete email", new Error(`No account matching "${account}"`));
      }
      provider = providerFor(record);
      await provider.deleteEmail(id, permanent, sourceFolder);
      return ok(permanent ? `Permanently deleted email ${id}` : `Moved email ${id} to Trash`);
    } catch (err) {
      return fail("Failed to delete email", err);
    } finally {
      if (provider) await provider.close().catch(() => {});
    }
  },
};
