import { z } from "zod";
import { findAccount } from "../credential-store.js";
import { providerFor } from "../email-client.js";
import { ok, okAsError, fail } from "./shared.js";

const schema = z.object({
  account: z.string().min(1).describe("Account ID or email address"),
});

export const account_test = {
  name: "email_test_account",
  description: "Test the connection to a configured account. Returns a brief status line.",
  schema,
  handler: async ({ account }: z.infer<typeof schema>) => {
    let provider;
    try {
      const record = await findAccount(account);
      if (!record) {
        return fail("Failed to test account", new Error(`No account matching "${account}"`));
      }
      provider = providerFor(record);
      const okConnect = await provider.testConnection();
      const summary = okConnect
        ? `Account **${record.email}** (${record.provider}) — connection OK`
        : `Account **${record.email}** (${record.provider}) — connection FAILED (credentials rejected or host unreachable)`;
      return okConnect ? ok(summary) : okAsError(summary);
    } catch (err) {
      return fail("Failed to test account", err);
    } finally {
      if (provider) {
        try {
          await provider.close();
        } catch {
          /* ignore close errors */
        }
      }
    }
  },
};
