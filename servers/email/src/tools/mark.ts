import { z } from "zod";
import { findAccount } from "../credential-store.js";
import { providerFor } from "../email-client.js";
import { ok, fail, blockedIfReadOnly } from "./shared.js";

const schema = z.object({
  account: z.string().min(1),
  id: z.string().min(1).describe("Email ID"),
  read: z.boolean().optional().describe("Set true to mark read, false to mark unread"),
  starred: z.boolean().optional().describe("Set true to star, false to unstar"),
  flagged: z.boolean().optional().describe("Set true to flag, false to unflag"),
  sourceFolder: z.string().optional().default("INBOX").describe("Folder containing the message (IMAP only)"),
});

export const mark = {
  name: "email_mark",
  description: "Set read/starred/flagged flags on an email. Only the flags you supply are changed.",
  schema,
  handler: async ({ account, id, read, starred, flagged, sourceFolder }: z.infer<typeof schema>) => {
    if (read === undefined && starred === undefined && flagged === undefined) {
      return fail("Failed to mark email", new Error("Supply at least one of read/starred/flagged"));
    }
    const blocked = blockedIfReadOnly("Failed to mark email");
    if (blocked) return blocked;
    let provider;
    try {
      const record = await findAccount(account);
      if (!record) {
        return fail("Failed to mark email", new Error(`No account matching "${account}"`));
      }
      provider = providerFor(record);
      await provider.mark(id, { read, starred, flagged }, sourceFolder);
      const flags = [
        read === true ? "read" : read === false ? "unread" : null,
        starred === true ? "starred" : starred === false ? "unstarred" : null,
        flagged === true ? "flagged" : flagged === false ? "unflagged" : null,
      ]
        .filter(Boolean)
        .join(", ");
      return ok(`Marked email ${id}: ${flags}`);
    } catch (err) {
      return fail("Failed to mark email", err);
    } finally {
      if (provider) await provider.close().catch(() => {});
    }
  },
};
