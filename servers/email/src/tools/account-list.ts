import { z } from "zod";
import { listAccounts, credentialBackend } from "../credential-store.js";
import { ok, fail } from "./shared.js";

const schema = z.object({});

export const account_list = {
  name: "email_list_accounts",
  description: "List all configured email accounts. Does not include secrets.",
  schema,
  handler: async () => {
    try {
      const accounts = await listAccounts();
      if (accounts.length === 0) {
        return ok("No email accounts configured. Use email_add_account to add one.");
      }
      const lines = accounts.map(
        (a) =>
          `**${a.email}** (${a.provider})\n  id: ${a.id}\n  added: ${a.addedAt}${
            a.displayName ? `\n  name: ${a.displayName}` : ""
          }`
      );
      return ok(
        `${accounts.length} account(s) configured (backend: ${credentialBackend()})\n\n${lines.join("\n\n")}`
      );
    } catch (err) {
      return fail("Failed to list accounts", err);
    }
  },
};
