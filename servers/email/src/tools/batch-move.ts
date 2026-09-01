import { z } from "zod";
import { findAccount } from "../credential-store.js";
import { providerFor } from "../email-client.js";
import { ok, fail, blockedIfReadOnly } from "./shared.js";

const schema = z.object({
  account: z.string().min(1),
  ids: z.array(z.string().min(1)).min(1).max(100).describe("Email IDs to move (max 100)"),
  targetFolder: z.string().min(1),
  sourceFolder: z.string().optional().default("INBOX"),
});

export const batch_move = {
  name: "email_batch_move",
  description: "Move up to 100 emails to a target folder/label in a single call.",
  schema,
  handler: async ({ account, ids, targetFolder, sourceFolder }: z.infer<typeof schema>) => {
    const blocked = blockedIfReadOnly("Failed to batch-move emails");
    if (blocked) return blocked;
    let provider;
    try {
      const record = await findAccount(account);
      if (!record) {
        return fail("Failed to batch-move", new Error(`No account matching "${account}"`));
      }
      provider = providerFor(record);
      const result = await provider.batchMove(ids, targetFolder, sourceFolder);
      const summary = `${result.succeeded.length}/${result.total} moved to **${targetFolder}** (${result.failed.length} failed)`;
      const failures = result.failed.length
        ? `\n\nFailures:\n${result.failed.map((f) => `  - ${f.id}: ${f.error}`).join("\n")}`
        : "";
      return ok(`Batch move: ${summary}${failures}`);
    } catch (err) {
      return fail("Failed to batch-move", err);
    } finally {
      if (provider) await provider.close().catch(() => {});
    }
  },
};
