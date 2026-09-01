import { z } from "zod";
import { findAccount } from "../credential-store.js";
import { providerFor } from "../email-client.js";
import { ok, fail, blockedIfReadOnly } from "./shared.js";

const schema = z.object({
  account: z.string().min(1),
  id: z.string().min(1).describe("Email ID to move"),
  targetFolder: z.string().min(1).describe("Destination folder/label name or ID"),
  sourceFolder: z.string().optional().default("INBOX").describe("Where the message currently lives (IMAP only)"),
});

export const move = {
  name: "email_move",
  description: "Move an email to a different folder/label.",
  schema,
  handler: async ({ account, id, targetFolder, sourceFolder }: z.infer<typeof schema>) => {
    const blocked = blockedIfReadOnly("Failed to move email");
    if (blocked) return blocked;
    let provider;
    try {
      const record = await findAccount(account);
      if (!record) {
        return fail("Failed to move email", new Error(`No account matching "${account}"`));
      }
      provider = providerFor(record);
      await provider.move(id, targetFolder, sourceFolder);
      return ok(`Moved email ${id} → **${targetFolder}**`);
    } catch (err) {
      return fail("Failed to move email", err);
    } finally {
      if (provider) await provider.close().catch(() => {});
    }
  },
};
