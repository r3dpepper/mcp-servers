import { z } from "zod";
import { findAccount } from "../credential-store.js";
import { providerFor } from "../email-client.js";
import { config } from "../config.js";
import { ok, fail } from "./shared.js";

const schema = z.object({
  account: z.string().min(1).describe("Account ID or email address"),
  folder: z.string().optional().default("INBOX").describe("Folder/label to search in (default INBOX)"),
  query: z.string().optional().describe("Full query string (IMAP search syntax or Gmail query)"),
  from: z.string().optional(),
  to: z.string().optional(),
  subject: z.string().optional(),
  since: z.string().optional().describe("ISO date — only return messages after this date"),
  before: z.string().optional().describe("ISO date — only return messages before this date"),
  limit: z.number().int().min(1).max(200).optional().default(config.defaultSearchLimit),
  returnBody: z.boolean().optional().default(false)
    .describe("Set true to include the full message body. Default false (snippet only, faster + cheaper)."),
});

export const search = {
  name: "email_search",
  description:
    "Search emails with optional filters. Returns lightweight summaries by default " +
    "(~200 char snippet). Set returnBody=true to fetch full message bodies — " +
    "use sparingly, this can be slow and produce large responses.",
  schema,
  handler: async (args: z.infer<typeof schema>) => {
    let provider;
    try {
      const record = await findAccount(args.account);
      if (!record) {
        return fail("Failed to search", new Error(`No account matching "${args.account}"`));
      }
      provider = providerFor(record);
      const results = await provider.search({
        folder: args.folder,
        query: args.query,
        from: args.from,
        to: args.to,
        subject: args.subject,
        since: args.since,
        before: args.before,
        limit: args.limit,
        returnBody: args.returnBody,
      });
      if (results.length === 0) {
        return ok("No messages matched.");
      }
      const lines = results.map((r, i) => {
        const from = r.from.map((a) => a.name || a.address).join(", ") || "(unknown)";
        const flags = [
          r.isRead ? "" : "UNREAD",
          r.isStarred ? "★" : "",
          r.hasAttachments ? "📎" : "",
        ]
          .filter(Boolean)
          .join(" ");
        const flagStr = flags ? ` [${flags.trim()}]` : "";
        const body = args.returnBody
          ? `\n   ${(r.snippet ?? "").slice(0, 500)}`
          : `\n   ${r.snippet}`;
        return `${i + 1}. **${r.subject}**${flagStr}\n   from: ${from}\n   date: ${r.date}\n   id: ${r.id}${body}`;
      });
      return ok(`${results.length} message(s):\n\n${lines.join("\n\n")}`);
    } catch (err) {
      return fail("Failed to search", err);
    } finally {
      if (provider) await provider.close().catch(() => {});
    }
  },
};
