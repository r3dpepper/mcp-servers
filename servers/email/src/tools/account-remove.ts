import { z } from "zod";
import { removeAccount } from "../credential-store.js";
import { ok, fail } from "./shared.js";

const schema = z.object({
  account: z.string().min(1).describe("Account ID or email address"),
});

export const account_remove = {
  name: "email_remove_account",
  description: "Remove an account and delete its stored credentials.",
  schema,
  handler: async ({ account }: z.infer<typeof schema>) => {
    try {
      const removed = await removeAccount(account);
      if (!removed) {
        return fail("Failed to remove account", new Error(`No account matching "${account}"`));
      }
      return ok(`Removed account **${account}**.`);
    } catch (err) {
      return fail("Failed to remove account", err);
    }
  },
};
