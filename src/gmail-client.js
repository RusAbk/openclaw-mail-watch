/**
 * Gmail API client using googleapis.
 * Fetches messages via Gmail API with OAuth.
 */

import { google } from "googleapis";
import { OAuth2Client } from "googleapis-common";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CREDENTIALS_PATH = join(__dirname, "..", "data", "google-credentials.json");

function getCredentials() {
    const content = readFileSync(CREDENTIALS_PATH, "utf-8");
    const creds = JSON.parse(content);
    return {
        clientId: creds.installed?.client_id || creds.web?.client_id,
        clientSecret: creds.installed?.client_secret || creds.web?.client_secret,
    };
}

function getOAuth2Client(tokens) {
    const { clientId, clientSecret } = getCredentials();
    const client = new OAuth2Client(clientId, clientSecret, "http://localhost:3000/callback");
    client.setCredentials(tokens);
    return client;
}

/**
 * Fetch recent messages from Gmail.
 */
export async function getGmailMessages(accountId, tokens, maxResults = 50) {
    const auth = getOAuth2Client(tokens);
    const gmail = google.gmail({ version: "v1", auth });

    // List messages
    const listRes = await gmail.users.messages.list({
        userId: "me",
        maxResults: maxResults,
        labelIds: ["INBOX"],
    });

    const messages = [];
    const msgList = listRes.data.messages || [];

    for (const { id, threadId } of msgList) {
        try {
            const msgRes = await gmail.users.messages.get({
                userId: "me",
                id: id,
                format: "full",
            });

            const msg = msgRes.data;
            const headers = msg.payload?.headers || [];

            const getHeader = (name) => {
                const h = headers.find(h => h.name.toLowerCase() === name.toLowerCase());
                return h?.value || "";
            };

            // Extract body
            let body = "";
            const extractBody = (part) => {
                if (part.mimeType === "text/plain" && part.body?.data) {
                    body += Buffer.from(part.body.data, "base64").toString("utf-8");
                } else if (part.mimeType === "text/html" && part.body?.data && !body) {
                    // Fallback to HTML if no plain text
                    const html = Buffer.from(part.body.data, "base64").toString("utf-8");
                    // Strip HTML tags for readability
                    body = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
                } else if (part.parts) {
                    for (const sub of part.parts) extractBody(sub);
                }
            };

            if (msg.payload) extractBody(msg.payload);

            messages.push({
                id: msg.id,
                accountId,
                accountEmail: "",
                folder: "INBOX",
                subject: getHeader("Subject"),
                from: getHeader("From"),
                to: getHeader("To"),
                date: new Date(parseInt(msg.internalDate)).toISOString(),
                snippet: msg.snippet || "",
                body: body.slice(0, 10000), // Limit body size
                isRead: !msg.labelIds?.includes("UNREAD"),
                labels: msg.labelIds || [],
                threadId: threadId,
            });
        } catch (err) {
            console.error(`    ⚠️ Error fetching message ${id}: ${err.message}`);
        }
    }

    return messages;
}

/**
 * Watch Gmail for new messages (uses Gmail watch/push notification).
 * For polling fallback, we just check for new messages since last check.
 */
export async function getGmailNewMessages(accountId, tokens, sinceHistoryId) {
    const auth = getOAuth2Client(tokens);
    const gmail = google.gmail({ version: "v1", auth });

    if (!sinceHistoryId) {
        // First run — just get recent messages
        return getGmailMessages(accountId, tokens, 10);
    }

    // Use history list to get changes since last check
    try {
        const historyRes = await gmail.users.history.list({
            userId: "me",
            startHistoryId: sinceHistoryId,
            historyTypes: ["messageAdded"],
        });

        const messages = [];
        const history = historyRes.data.history || [];

        for (const item of history) {
            for (const msg of (item.messagesAdded || [])) {
                const fullMsg = await gmail.users.messages.get({
                    userId: "me",
                    id: msg.message.id,
                    format: "full",
                });
                // ... same extraction as above
                const headers = fullMsg.data.payload?.headers || [];
                const getHeader = (name) => headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || "";

                let body = "";
                const extractBody = (part) => {
                    if (part.mimeType === "text/plain" && part.body?.data) {
                        body += Buffer.from(part.body.data, "base64").toString("utf-8");
                    } else if (part.parts) {
                        for (const sub of part.parts) extractBody(sub);
                    }
                };
                if (fullMsg.data.payload) extractBody(fullMsg.data.payload);

                messages.push({
                    id: fullMsg.data.id,
                    accountId,
                    accountEmail: "",
                    folder: "INBOX",
                    subject: getHeader("Subject"),
                    from: getHeader("From"),
                    to: getHeader("To"),
                    date: new Date(parseInt(fullMsg.data.internalDate)).toISOString(),
                    snippet: fullMsg.data.snippet || "",
                    body: body.slice(0, 10000),
                    isRead: !fullMsg.data.labelIds?.includes("UNREAD"),
                    labels: fullMsg.data.labelIds || [],
                    threadId: fullMsg.data.threadId,
                });
            }
        }

        return messages;
    } catch (err) {
        // If history ID is invalid, fall back to full scan
        if (err.message?.includes("invalid") || err.code === 404) {
            console.log("    History ID invalid, doing full scan...");
            return getGmailMessages(accountId, tokens, 10);
        }
        throw err;
    }
}
