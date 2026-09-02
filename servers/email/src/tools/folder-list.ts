import { z } from "zod";
import { findAccount } from "../credential-store.js";
import { providerFor } from "../email-client.js";
import { ok, fail } from "./shared.js";

const schema = z.object({
  account: z.string().min(1).describe("Account ID or email address"),
});

export const folder_list = {
  name: "email_list_folders",
  description: "List all folders/labels/categories for an account.",
  schema,
  handler: async ({ account }: z.infer<typeof schema>) => {
    let provider;
    try {
      const record = await findAccount(account);
      if (!record) {
        return fail("Failed to list folders", new Error(`No account matching "${account}"`));
      }
      provider = providerFor(record);
      const folders = await provider.listFolders();
      if (folders.length === 0) {
        return ok("No folders found.");
      }
      const lines = folders.map(
        (f) => `- **${f.name}** (path: \`${f.path}\`${
          f.messageCount != null ? `, ${f.messageCount} msg` : ""
        }${f.unreadCount != null ? `, ${f.unreadCount} unread` : ""})`
      );
      return ok(`${folders.length} folder(s):\n\n${lines.join("\n")}`);
    } catch (err) {
      return fail("Failed to list folders", err);
    } finally {
      if (provider) await provider.close().catch(() => {});
    }
  },
};
