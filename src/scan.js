/**
 * Scan emails from all configured accounts.
 * For each account, fetches recent emails from INBOX (and optionally other folders).
 * Extracts basic metadata and saves raw messages for AI analysis.
 */

import { listAccounts, getAccount, loadToken } from "./accounts.js";
import { getGmailMessages } from "./gmail-client.js";
import { getImapMessages } from "./imap-client.js";
import { writeFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const MESSAGES_DIR = "data/messages";
const DATA_FILE = "data/mail-watch.json";
const SCAN_COUNT = 50; // emails per account per folder

function ensureDirs() {
    if (!existsSync("data")) mkdirSync("data", { recursive: true });
    if (!existsSync(MESSAGES_DIR)) mkdirSync(MESSAGES_DIR, { recursive: true });
}

function loadData() {
    if (!existsSync(DATA_FILE)) {
        return { tasks: [], agreements: [], important: [], lastScan: null, scannedMessageIds: {} };
    }
    return JSON.parse(readFileSync(DATA_FILE, "utf-8"));
}

function saveData(data) {
    data.lastScan = new Date().toISOString();
    writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function formatEmail(msg) {
    return {
        id: msg.id,
        accountId: msg.accountId,
        accountEmail: msg.accountEmail,
        folder: msg.folder || "INBOX",
        subject: msg.subject || "(no subject)",
        from: msg.from || "Unknown",
        to: msg.to || "",
        date: msg.date || new Date().toISOString(),
        snippet: msg.snippet || "",
        body: msg.body || "",
        isRead: msg.isRead || false,
        labels: msg.labels || [],
        threadId: msg.threadId || null,
    };
}

async function scanAccount(account, data) {
    console.log(`\n  Scanning: ${account.email} (${account.authType})`);
    const messages = [];

    try {
        let rawMessages = [];

        if (account.authType === "gmail-oauth") {
            const token = loadToken(account.id);
            if (!token) {
                console.log(`    ⚠️ No token found. Run: npm run auth`);
                return [];
            }
            rawMessages = await getGmailMessages(account.id, token, SCAN_COUNT);
        } else if (account.authType === "imap") {
            rawMessages = await getImapMessages(account, SCAN_COUNT);
        }

        for (const raw of rawMessages) {
            const msg = formatEmail(raw);

            // Deduplicate
            if (data.scannedMessageIds?.[msg.id]) continue;
            if (!data.scannedMessageIds) data.scannedMessageIds = {};
            data.scannedMessageIds[msg.id] = true;

            messages.push(msg);
        }

        if (messages.length > 0) {
            const msgFile = join(MESSAGES_DIR, `${account.id}-${Date.now()}.json`);
            writeFileSync(msgFile, JSON.stringify(messages, null, 2));
            console.log(`    ✅ ${messages.length} new emails saved to ${msgFile}`);
        } else {
            console.log(`    No new emails.`);
        }
    } catch (err) {
        console.error(`    ❌ Error: ${err.message}`);
    }

    return messages;
}

async function main() {
    console.log("=== Mail Watch - Scan ===\n");
    ensureDirs();

    const accounts = listAccounts();
    if (accounts.length === 0) {
        console.log("No accounts configured. Run: npm run auth");
        process.exit(0);
    }

    console.log(`Found ${accounts.length} account(s).`);
    const data = loadData();
    let totalMessages = 0;

    for (const account of accounts) {
        const msgs = await scanAccount(account, data);
        totalMessages += msgs.length;
    }

    saveData(data);

    console.log("\n=== Scan Complete ===");
    console.log(`Accounts scanned: ${accounts.length}`);
    console.log(`New emails collected: ${totalMessages}`);
    console.log(`Data saved to ${DATA_FILE}`);
    console.log(`Raw messages saved to ${MESSAGES_DIR}/`);
}

main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
});
