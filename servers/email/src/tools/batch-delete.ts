import { z } from "zod";
import { findAccount } from "../credential-store.js";
import { providerFor } from "../email-client.js";
import { ok, fail, blockedIfReadOnly } from "./shared.js";

const schema = z.object({
  account: z.string().min(1),
  ids: z.array(z.string().min(1)).min(1).max(100).describe("Email IDs to delete (max 100)"),
  permanent: z.boolean().optional().default(false),
  sourceFolder: z.string().optional().default("INBOX"),
});

export const batch_delete = {
  name: "email_batch_delete",
  description: "Delete up to 100 emails in a single call. Returns a summary of successes and failures.",
  schema,
  handler: async ({ account, ids, permanent, sourceFolder }: z.infer<typeof schema>) => {
    const blocked = blockedIfReadOnly("Failed to batch-delete emails");
    if (blocked) return blocked;
    let provider;
    try {
      const record = await findAccount(account);
      if (!record) {
        return fail("Failed to batch-delete", new Error(`No account matching "${account}"`));
      }
      provider = providerFor(record);
      const result = await provider.batchDelete(ids, permanent, sourceFolder);
      const summary = `${result.succeeded.length}/${result.total} deleted (${result.failed.length} failed)`;
      const failures = result.failed.length
        ? `\n\nFailures:\n${result.failed.map((f) => `  - ${f.id}: ${f.error}`).join("\n")}`
        : "";
      return ok(`Batch delete: ${summary}${failures}`);
    } catch (err) {
      return fail("Failed to batch-delete", err);
    } finally {
      if (provider) await provider.close().catch(() => {});
    }
  },
};
