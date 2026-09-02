import { z } from "zod";
import { findAccount } from "../credential-store.js";
import { providerFor } from "../email-client.js";
import { ok, fail, blockedIfReadOnly } from "./shared.js";

const schema = z.object({
  account: z.string().min(1).describe("Account ID or email address"),
  name: z.string().min(1).max(255).describe("Folder/label name to create"),
});

export const folder_create = {
  name: "email_folder_create",
  description: "Create a new folder (IMAP), label (Gmail), or category container (Outlook).",
  schema,
  handler: async ({ account, name }: z.infer<typeof schema>) => {
    const blocked = blockedIfReadOnly("Failed to create folder");
    if (blocked) return blocked;
    let provider;
    try {
      const record = await findAccount(account);
      if (!record) {
        return fail("Failed to create folder", new Error(`No account matching "${account}"`));
      }
      provider = providerFor(record);
      const folder = await provider.createFolder(name);
      return ok(`Created folder **${folder.name}** (path: \`${folder.path}\`)`);
    } catch (err) {
      return fail("Failed to create folder", err);
    } finally {
      if (provider) await provider.close().catch(() => {});
    }
  },
};
