/**
 * Real-time email listener daemon.
 * Polls all configured accounts for new messages.
 * For IMAP accounts, uses IDLE when available.
 * For Gmail, uses history API polling.
 *
 * Saves new messages to data/messages/ for AI analysis.
 */

import { listAccounts, loadToken } from "./accounts.js";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getImapNewMessages, watchImapIdle } from "./imap-client.js";
import { getGmailNewMessages } from "./gmail-client.js";

const MESSAGES_DIR = "data/messages";
const STATE_FILE = "data/listen-state.json";
const POLL_INTERVAL = 30_000; // 30 seconds for polling fallback

function ensureDirs() {
    if (!existsSync("data")) mkdirSync("data", { recursive: true });
    if (!existsSync(MESSAGES_DIR)) mkdirSync(MESSAGES_DIR, { recursive: true });
}

function loadState() {
    if (!existsSync(STATE_FILE)) return { accountStates: {} };
    return JSON.parse(readFileSync(STATE_FILE, "utf-8"));
}

function saveState(state) {
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function saveMessage(msg) {
    const msgFile = join(MESSAGES_DIR, `listen-${msg.accountId}-${msg.id}.json`);
    writeFileSync(msgFile, JSON.stringify([msg], null, 2));
    return msgFile;
}

async function pollAccount(account, state) {
    const stateKey = account.id;
    const accountState = state.accountStates[stateKey] || {};
    let newMessages = [];

    try {
        if (account.authType === "gmail-oauth") {
            const token = loadToken(account.id);
            if (!token) return [];

            const msgs = await getGmailNewMessages(
                account.id,
                token,
                accountState.lastHistoryId
            );
            newMessages = msgs;

            // Update history ID if available
            const { google } = await import("googleapis");
            const { OAuth2Client } = await import("googleapis-common");
            const { readFileSync } = await import("node:fs");
            const creds = JSON.parse(readFileSync("data/google-credentials.json", "utf-8"));
            const auth = new OAuth2Client(
                creds.installed?.client_id || creds.web?.client_id,
                creds.installed?.client_secret || creds.web?.client_secret,
                "http://localhost:3000/callback"
            );
            auth.setCredentials(token);
            const gmail = google.gmail({ version: "v1", auth });
            const profile = await gmail.users.getProfile({ userId: "me" });
            accountState.lastHistoryId = profile.data.historyId;

        } else if (account.authType === "imap") {
            const msgs = await getImapNewMessages(account, accountState.lastUid);
            newMessages = msgs;
            if (msgs.length > 0) {
                accountState.lastUid = Math.max(...msgs.map(m => parseInt(m.id)));
            }
        }

        if (newMessages.length > 0) {
            for (const msg of newMessages) {
                const file = saveMessage(msg);
                console.log(`[${new Date().toISOString()}] [${account.email}] ${msg.from}: ${msg.subject}`);
                console.log(`  Saved: ${file}`);
            }
        }

        accountState.lastPoll = new Date().toISOString();
        state.accountStates[stateKey] = accountState;
    } catch (err) {
        console.error(`  ⚠️ Error polling ${account.email}: ${err.message}`);
    }

    return newMessages;
}

async function main() {
    console.log("=========================================");
    console.log("   Mail Watch - Real-Time Listener");
    console.log("=========================================\n");

    ensureDirs();
    const state = loadState();

    const accounts = listAccounts();
    if (accounts.length === 0) {
        console.log("No accounts configured. Run: npm run auth");
        process.exit(0);
    }

    console.log(`Watching ${accounts.length} account(s):`);
    for (const a of accounts) {
        console.log(`  - ${a.email} (${a.authType})`);
    }
    console.log(`Polling every ${POLL_INTERVAL / 1000}s...\n`);

    // Initial poll
    for (const account of accounts) {
        await pollAccount(account, state);
    }
    saveState(state);

    // Periodic polling loop
    setInterval(async () => {
        for (const account of accounts) {
            await pollAccount(account, state);
        }
        saveState(state);
    }, POLL_INTERVAL);

    // For IMAP accounts, also try IDLE
    const imapAccounts = accounts.filter(a => a.authType === "imap");
    for (const account of imapAccounts) {
        watchImapIdle(account, async (msg) => {
            const file = saveMessage(msg);
            console.log(`[${new Date().toISOString()}] [IDLE:${account.email}] ${msg.from}: ${msg.subject}`);
            console.log(`  Saved: ${file}`);
        }).catch(err => {
            console.error(`  ⚠️ IMAP IDLE error for ${account.email}: ${err.message}`);
        });
    }

    // Keep process alive
    process.on("SIGINT", () => {
        console.log("\nShutting down...");
        process.exit(0);
    });
}

main().catch((err) => {
    console.error("Fatal listener error:", err);
    process.exit(1);
});
