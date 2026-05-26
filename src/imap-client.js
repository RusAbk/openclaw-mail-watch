/**
 * IMAP client using imapflow.
 * Supports Yandex, Mail.ru, Outlook, Gmail (app password), custom servers.
 */

import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

/**
 * Fetch recent messages from an IMAP account.
 */
export async function getImapMessages(account, count = 50) {
    const client = new ImapFlow({
        host: account.imapHost,
        port: account.imapPort || 993,
        secure: account.imapSecure !== false,
        auth: {
            user: account.imapUser || account.email,
            pass: account.imapPass,
        },
        logger: false,
    });

    await client.connect();

    try {
        const lock = await client.getMailboxLock("INBOX");
        try {
            // Get the total count
            const status = client.mailbox;
            const total = status.exists || 0;
            if (total === 0) return [];

            // Fetch last N messages
            const start = Math.max(1, total - count + 1);
            const messages = [];

            for await (const msg of client.fetch(`${start}:*`, {
                envelope: true,
                source: true,
                flags: true,
                uid: true,
                labels: true,
            })) {
                const parsed = await simpleParser(msg.source);

                messages.push({
                    id: String(msg.uid),
                    accountId: account.id,
                    accountEmail: account.email,
                    folder: "INBOX",
                    subject: parsed.subject || "(no subject)",
                    from: parsed.from?.text || "Unknown",
                    to: parsed.to?.text || "",
                    date: parsed.date?.toISOString() || new Date().toISOString(),
                    snippet: (parsed.text || "").slice(0, 200),
                    body: (parsed.text || "").slice(0, 10000),
                    isRead: msg.flags.has("\\Seen"),
                    labels: [...(msg.labels ? Array.from(msg.labels) : [])],
                    threadId: parsed.messageId || null,
                });
            }

            return messages;
        } finally {
            lock.release();
        }
    } finally {
        await client.logout();
    }
}

/**
 * Poll IMAP for new messages (using IDLE if available, otherwise fetch by UID).
 */
export async function getImapNewMessages(account, lastUid = null) {
    const client = new ImapFlow({
        host: account.imapHost,
        port: account.imapPort || 993,
        secure: account.imapSecure !== false,
        auth: {
            user: account.imapUser || account.email,
            pass: account.imapPass,
        },
        logger: false,
    });

    await client.connect();

    try {
        const lock = await client.getMailboxLock("INBOX");
        try {
            const status = client.mailbox;
            const total = status.exists || 0;
            if (total === 0) return [];

            let fetchRange;
            if (lastUid) {
                // Fetch messages with UID > lastUid
                fetchRange = `${lastUid + 1}:*`;
            } else {
                // First run — get last 10
                const start = Math.max(1, total - 10 + 1);
                fetchRange = `${start}:*`;
            }

            const messages = [];
            for await (const msg of client.fetch(fetchRange, {
                envelope: true,
                source: true,
                flags: true,
                uid: true,
                labels: true,
            })) {
                if (lastUid && msg.uid <= lastUid) continue;

                const parsed = await simpleParser(msg.source);
                messages.push({
                    id: String(msg.uid),
                    accountId: account.id,
                    accountEmail: account.email,
                    folder: "INBOX",
                    subject: parsed.subject || "(no subject)",
                    from: parsed.from?.text || "Unknown",
                    to: parsed.to?.text || "",
                    date: parsed.date?.toISOString() || new Date().toISOString(),
                    snippet: (parsed.text || "").slice(0, 200),
                    body: (parsed.text || "").slice(0, 10000),
                    isRead: msg.flags.has("\\Seen"),
                    labels: [...(msg.labels ? Array.from(msg.labels) : [])],
                    threadId: parsed.messageId || null,
                });
            }

            return messages;
        } finally {
            lock.release();
        }
    } finally {
        await client.logout();
    }
}

/**
 * Start IMAP IDLE for real-time notifications.
 * Calls onNewMessage callback when new mail arrives.
 */
export async function watchImapIdle(account, onNewMessage) {
    const client = new ImapFlow({
        host: account.imapHost,
        port: account.imapPort || 993,
        secure: account.imapSecure !== false,
        auth: {
            user: account.imapUser || account.email,
            pass: account.imapPass,
        },
        logger: false,
    });

    await client.connect();

    client.on("exists", async (data) => {
        // New message arrived
        try {
            const lock = await client.getMailboxLock("INBOX");
            try {
                const msg = await client.fetchOne(data.count, {
                    envelope: true,
                    source: true,
                    flags: true,
                    uid: true,
                });
                if (msg) {
                    const parsed = await simpleParser(msg.source);
                    await onNewMessage({
                        id: String(msg.uid),
                        accountId: account.id,
                        accountEmail: account.email,
                        folder: "INBOX",
                        subject: parsed.subject || "(no subject)",
                        from: parsed.from?.text || "Unknown",
                        to: parsed.to?.text || "",
                        date: parsed.date?.toISOString() || new Date().toISOString(),
                        snippet: (parsed.text || "").slice(0, 200),
                        body: (parsed.text || "").slice(0, 10000),
                        isRead: msg.flags.has("\\Seen"),
                        threadId: parsed.messageId || null,
                    });
                }
            } finally {
                lock.release();
            }
        } catch (err) {
            console.error(`  ⚠️ IMAP IDLE fetch error: ${err.message}`);
        }
    });

    // Keep alive
    const lock = await client.getMailboxLock("INBOX");
    try {
        await client.idle();
    } finally {
        lock.release();
    }

    return client;
}
