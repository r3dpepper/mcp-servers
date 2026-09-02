import { z } from "zod";
import { addAccount, accountId, type AccountRecord, type Provider } from "../credential-store.js";
import { config } from "../config.js";
import { ok, fail } from "./shared.js";

/**
 * Auto-pick a provider when the user supplies an email but no provider.
 * Gmail and Outlook get a recommendation but the user can override.
 */
function autoDetectProvider(email: string): Provider {
  const lower = email.toLowerCase();
  if (lower.endsWith("@gmail.com") || lower.endsWith("@googlemail.com")) return "gmail-oauth";
  if (
    lower.endsWith("@outlook.com") ||
    lower.endsWith("@hotmail.com") ||
    lower.endsWith("@live.com") ||
    lower.endsWith("@msn.com")
  ) {
    return "outlook-oauth";
  }
  return "imap";
}

const schema = z.object({
  provider: z.enum(["imap", "gmail-oauth", "outlook-oauth"]).optional()
    .describe("Provider. Auto-detected from email domain if omitted."),
  email: z.string().email().describe("Primary email address for the account"),

  // IMAP-only fields
  imapHost: z.string().optional(),
  imapPort: z.number().int().min(1).max(65535).optional().default(993),
  imapSecure: z.boolean().optional().default(true),
  imapUser: z.string().optional().describe("IMAP login; defaults to email if omitted"),
  password: z.string().optional().describe("App password (recommended) or account password"),
  smtpHost: z.string().optional(),
  smtpPort: z.number().int().min(1).max(65535).optional().default(465),
  smtpSecure: z.boolean().optional().default(true),
});

export const account_add = {
  name: "email_add_account",
  description:
    "Add an email account. For IMAP/SMTP providers (Yahoo, iCloud, Fastmail, custom), supply " +
    "host/port/user/password. For Gmail or Outlook, OAuth setup is required separately — " +
    "use provider='gmail-oauth' or 'outlook-oauth' after configuring EMAIL_GMAIL_CLIENT_ID / " +
    "EMAIL_OUTLOOK_CLIENT_ID in .env.",
  schema,
  handler: async (args: z.infer<typeof schema>) => {
    try {
      const provider: Provider = args.provider ?? autoDetectProvider(args.email);

      if (provider === "imap") {
        if (!args.imapHost || !args.smtpHost || !args.password) {
          return fail(
            "Failed to add account",
            new Error("IMAP provider requires imapHost, smtpHost, and password (app password recommended)")
          );
        }
        const record: AccountRecord = {
          id: accountId(args.email, "imap"),
          email: args.email,
          provider: "imap",
          addedAt: new Date().toISOString(),
          secret: {
            kind: "imap",
            user: args.imapUser ?? args.email,
            password: args.password,
            imapHost: args.imapHost,
            imapPort: args.imapPort ?? 993,
            imapSecure: args.imapSecure ?? true,
            smtpHost: args.smtpHost,
            smtpPort: args.smtpPort ?? 465,
            smtpSecure: args.smtpSecure ?? true,
          },
        };
        await addAccount(record);
        return ok(`Added IMAP account **${args.email}** (host: ${args.imapHost})`);
      }

      if (provider === "gmail-oauth") {
        if (!config.gmailClientId || !config.gmailClientSecret) {
          return fail(
            "Failed to add Gmail account",
            new Error(
              "Gmail OAuth requires EMAIL_GMAIL_CLIENT_ID and EMAIL_GMAIL_CLIENT_SECRET in .env"
            )
          );
        }
        return fail(
          "Gmail OAuth setup not yet implemented",
          new Error(
            "Run the OAuth flow manually (open Google's OAuth playground, exchange a code, " +
            "then call email_test_account with the resulting access/refresh tokens). " +
            "Full browser-based OAuth flow coming in v0.2."
          )
        );
      }

      if (provider === "outlook-oauth") {
        if (!config.outlookClientId || !config.outlookClientSecret) {
          return fail(
            "Failed to add Outlook account",
            new Error(
              "Outlook OAuth requires EMAIL_OUTLOOK_CLIENT_ID and EMAIL_OUTLOOK_CLIENT_SECRET in .env"
            )
          );
        }
        return fail(
          "Outlook OAuth setup not yet implemented",
          new Error("Full browser-based OAuth flow coming in v0.3 — use IMAP for now.")
        );
      }

      return fail("Failed to add account", new Error(`Unknown provider: ${provider}`));
    } catch (err) {
      return fail("Failed to add account", err);
    }
  },
};
