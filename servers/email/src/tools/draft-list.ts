import { z } from "zod";
import { findAccount } from "../credential-store.js";
import { providerFor } from "../email-client.js";
import { config } from "../config.js";
import { ok, fail } from "./shared.js";

const schema = z.object({
  account: z.string().min(1),
  limit: z.number().int().min(1).max(100).optional().default(config.defaultSearchLimit),
});

export const draft_list = {
  name: "email_draft_list",
  description: "List drafts in the account's Drafts folder.",
  schema,
  handler: async ({ account, limit }: z.infer<typeof schema>) => {
    let provider;
    try {
      const record = await findAccount(account);
      if (!record) {
        return fail("Failed to list drafts", new Error(`No account matching "${account}"`));
      }
      provider = providerFor(record);
      const drafts = await provider.listDrafts(limit);
      if (drafts.length === 0) {
        return ok("No drafts.");
      }
      const lines = drafts.map(
        (d, i) =>
          `${i + 1}. **${d.subject}**\n   to: ${d.to.map((a) => a.address).join(", ") || "(none)"}\n   updated: ${d.date}\n   id: ${d.id}`
      );
      return ok(`${drafts.length} draft(s):\n\n${lines.join("\n\n")}`);
    } catch (err) {
      return fail("Failed to list drafts", err);
    } finally {
      if (provider) await provider.close().catch(() => {});
    }
  },
};
