/**
 * Account manager — stores and loads email account configurations.
 * Supports two auth types:
 *   - "gmail-oauth": Google OAuth 2.0 (via googleapis)
 *   - "imap": Standard IMAP (Yandex, Mail.ru, Outlook, custom, etc.)
 *
 * Account data is stored in data/accounts.json.
 * OAuth tokens are stored in data/tokens/<accountId>.json.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const ACCOUNTS_FILE = "data/accounts.json";
const TOKENS_DIR = "data/tokens";

function ensureDirs() {
    if (!existsSync("data")) mkdirSync("data", { recursive: true });
    if (!existsSync(TOKENS_DIR)) mkdirSync(TOKENS_DIR, { recursive: true });
}

export function listAccounts() {
    if (!existsSync(ACCOUNTS_FILE)) return [];
    try {
        return JSON.parse(readFileSync(ACCOUNTS_FILE, "utf-8"));
    } catch {
        return [];
    }
}

export function getAccount(accountId) {
    const accounts = listAccounts();
    return accounts.find(a => a.id === accountId) || null;
}

export function addAccount(account) {
    const accounts = listAccounts();
    const id = account.email.replace(/[^a-zA-Z0-9]/g, "_");
    if (accounts.find(a => a.id === id)) {
        throw new Error(`Account ${id} already exists. Remove it first to re-add.`);
    }
    const newAccount = { ...account, id };
    accounts.push(newAccount);
    saveAccounts(accounts);
    console.log(`✅ Account added: ${account.email} (${id})`);
    return newAccount;
}

export function removeAccount(accountId) {
    let accounts = listAccounts();
    const account = accounts.find(a => a.id === accountId);
    if (!account) throw new Error(`Account ${accountId} not found.`);
    accounts = accounts.filter(a => a.id !== accountId);
    saveAccounts(accounts);
    // Remove token file if exists
    const tokenFile = join(TOKENS_DIR, `${accountId}.json`);
    if (existsSync(tokenFile)) {
        const { unlinkSync } = require("node:fs");
        unlinkSync(tokenFile);
    }
    console.log(`✅ Account removed: ${account.email} (${accountId})`);
    return account;
}

function saveAccounts(accounts) {
    ensureDirs();
    writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2));
}

export function saveToken(accountId, tokenData) {
    ensureDirs();
    writeFileSync(join(TOKENS_DIR, `${accountId}.json`), JSON.stringify(tokenData, null, 2));
}

export function loadToken(accountId) {
    const tokenFile = join(TOKENS_DIR, `${accountId}.json`);
    if (!existsSync(tokenFile)) return null;
    try {
        return JSON.parse(readFileSync(tokenFile, "utf-8"));
    } catch {
        return null;
    }
}

/**
 * Build default IMAP config for known providers.
 */
export function getImapDefaults(email) {
    const domain = email.split("@")[1]?.toLowerCase();
    switch (domain) {
        case "gmail.com":
            return { host: "imap.gmail.com", port: 993, secure: true };
        case "yandex.ru":
        case "yandex.com":
        case "ya.ru":
            return { host: "imap.yandex.ru", port: 993, secure: true };
        case "mail.ru":
        case "bk.ru":
        case "inbox.ru":
        case "list.ru":
            return { host: "imap.mail.ru", port: 993, secure: true };
        case "outlook.com":
        case "hotmail.com":
        case "live.com":
        case "msn.com":
            return { host: "outlook.office365.com", port: 993, secure: true };
        case "icloud.com":
        case "me.com":
            return { host: "imap.mail.me.com", port: 993, secure: true };
        default:
            return null; // unknown, user must specify manually
    }
}

/**
 * Print all accounts in a readable format.
 */
export function printAccounts() {
    const accounts = listAccounts();
    if (accounts.length === 0) {
        console.log("No accounts configured. Run: npm run auth --add");
        return;
    }
    console.log(`\nConfigured accounts (${accounts.length}):\n`);
    for (const a of accounts) {
        const authType = a.authType === "gmail-oauth" ? "Gmail OAuth" : "IMAP";
        console.log(`  [${a.id}]`);
        console.log(`    Email:    ${a.email}`);
        console.log(`    Type:     ${authType}`);
        if (a.authType === "imap") {
            console.log(`    IMAP:     ${a.imapHost}:${a.imapPort || 993}`);
        }
        console.log(`    Added:    ${a.addedAt || "unknown"}`);
        console.log();
    }
}
