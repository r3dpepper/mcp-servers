import { z } from "zod";
import { findAccount } from "../credential-store.js";
import { providerFor } from "../email-client.js";
import { ok, fail, blockedIfReadOnly } from "./shared.js";

const schema = z.object({
  account: z.string().min(1),
  ids: z.array(z.string().min(1)).min(1).max(100).describe("Email IDs to mark (max 100)"),
  read: z.boolean().optional(),
  starred: z.boolean().optional(),
  flagged: z.boolean().optional(),
  sourceFolder: z.string().optional().default("INBOX"),
});

export const batch_mark = {
  name: "email_batch_mark",
  description: "Set read/starred/flagged flags on up to 100 emails in a single call.",
  schema,
  handler: async ({ account, ids, read, starred, flagged, sourceFolder }: z.infer<typeof schema>) => {
    if (read === undefined && starred === undefined && flagged === undefined) {
      return fail("Failed to batch-mark", new Error("Supply at least one of read/starred/flagged"));
    }
    const blocked = blockedIfReadOnly("Failed to batch-mark emails");
    if (blocked) return blocked;
    let provider;
    try {
      const record = await findAccount(account);
      if (!record) {
        return fail("Failed to batch-mark", new Error(`No account matching "${account}"`));
      }
      provider = providerFor(record);
      const result = await provider.batchMark(ids, { read, starred, flagged }, sourceFolder);
      const summary = `${result.succeeded.length}/${result.total} marked (${result.failed.length} failed)`;
      const failures = result.failed.length
        ? `\n\nFailures:\n${result.failed.map((f) => `  - ${f.id}: ${f.error}`).join("\n")}`
        : "";
      return ok(`Batch mark: ${summary}${failures}`);
    } catch (err) {
      return fail("Failed to batch-mark", err);
    } finally {
      if (provider) await provider.close().catch(() => {});
    }
  },
};
