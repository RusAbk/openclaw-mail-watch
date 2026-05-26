/**
 * Authentication entry point.
 * Supports:
 *   npm run auth          — interactive setup (add account wizard)
 *   npm run auth --add    — same as above
 *   npm run auth --list   — list configured accounts
 *   npm run auth --remove <id> — remove an account
 */

import { createInterface } from "node:readline";
import { listAccounts, addAccount, removeAccount, getImapDefaults, saveToken } from "./accounts.js";
import { authenticateGmail } from "./gmail-oauth.js";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);

// --list
if (args.includes("--list")) {
    const { printAccounts } = await import("./accounts.js");
    printAccounts();
    process.exit(0);
}

// --remove <id>
if (args.includes("--remove")) {
    const id = args[args.indexOf("--remove") + 1];
    if (!id) {
        console.error("Usage: npm run auth --remove <accountId>");
        console.error("Run 'npm run auth --list' to see account IDs.");
        process.exit(1);
    }
    try {
        removeAccount(id);
    } catch (err) {
        console.error(`❌ ${err.message}`);
        process.exit(1);
    }
    process.exit(0);
}

// Interactive add account wizard
async function prompt(rl, question) {
    return new Promise(resolve => rl.question(question, resolve));
}

async function addAccountWizard() {
    const rl = createInterface({ input: process.stdin, output: process.stdout });

    console.log("\n=== Mail Watch — Add Account ===\n");

    const email = (await prompt(rl, "Email address: ")).trim();
    if (!email || !email.includes("@")) {
        console.error("❌ Invalid email address.");
        rl.close();
        process.exit(1);
    }

    // Check if already configured
    const existing = listAccounts();
    if (existing.find(a => a.email.toLowerCase() === email.toLowerCase())) {
        console.error(`❌ Account ${email} is already configured.`);
        rl.close();
        process.exit(1);
    }

    // Determine auth type
    const domain = email.split("@")[1].toLowerCase();
    const isGmail = domain === "gmail.com";

    console.log(`\nDetected domain: ${domain}`);
    if (isGmail) {
        console.log("Choose authentication method:");
        console.log("  1) Google OAuth 2.0 (recommended — supports Gmail-specific features)");
        console.log("  2) IMAP (standard, works with app password)");
    } else {
        console.log("Choose authentication method:");
        console.log("  1) IMAP (standard — requires IMAP to be enabled in mail settings)");
        console.log("  2) IMAP with manual host/port (for custom servers)");
    }

    const choice = (await prompt(rl, "\nChoice (1/2): ")).trim();

    let account;

    if (isGmail && choice === "1") {
        // Gmail OAuth
        console.log("\nStarting Google OAuth flow...");
        console.log("A browser window will open. Log in and grant access.\n");
        rl.close();

        try {
            const { tokens, userInfo } = await authenticateGmail();
            account = {
                email: userInfo.email,
                authType: "gmail-oauth",
                name: userInfo.name || userInfo.email,
                addedAt: new Date().toISOString(),
            };
            const newAcc = addAccount(account);
            saveToken(newAcc.id, tokens);
            console.log(`\n✅ Gmail account connected: ${userInfo.email}`);
            console.log(`   Name: ${userInfo.name || "N/A"}`);
            console.log(`   Account ID: ${newAcc.id}`);
        } catch (err) {
            console.error(`\n❌ OAuth failed: ${err.message}`);
            process.exit(1);
        }
    } else if (choice === "1" || choice === "2" || !isGmail) {
        // IMAP
        const isManual = choice === "2" && !isGmail;
        const defaults = getImapDefaults(email);

        let imapHost, imapPort, imapSecure;

        if (!isManual && defaults) {
            console.log(`\nAuto-detected IMAP server: ${defaults.host}:${defaults.port}`);
            const useDefault = (await prompt(rl, "Use this server? (Y/n): ")).trim().toLowerCase();
            if (useDefault === "n") {
                imapHost = (await prompt(rl, "IMAP host: ")).trim();
                imapPort = parseInt((await prompt(rl, "IMAP port (993): ")).trim() || "993");
                imapSecure = (await prompt(rl, "SSL/TLS? (Y/n): ")).trim().toLowerCase() !== "n";
            } else {
                imapHost = defaults.host;
                imapPort = defaults.port;
                imapSecure = defaults.secure;
            }
        } else if (isManual || !defaults) {
            if (!defaults && !isManual) {
                console.log(`\n⚠️ Unknown provider for ${domain}. Manual IMAP configuration required.`);
            }
            imapHost = (await prompt(rl, "IMAP host (e.g. imap.example.com): ")).trim();
            imapPort = parseInt((await prompt(rl, "IMAP port (993): ")).trim() || "993");
            imapSecure = (await prompt(rl, "SSL/TLS? (Y/n): ")).trim().toLowerCase() !== "n";
        }

        const username = (await prompt(rl, `IMAP username (Enter for ${email}): `)).trim() || email;
        const password = (await prompt(rl, "IMAP password/app-password: ")).trim();

        if (!imapHost || !username || !password) {
            console.error("❌ IMAP host, username and password are required.");
            rl.close();
            process.exit(1);
        }

        // Test connection
        console.log("\nTesting IMAP connection...");
        try {
            const { ImapFlow } = await import("imapflow");
            const client = new ImapFlow({
                host: imapHost,
                port: imapPort,
                secure: imapSecure,
                auth: { user: username, pass: password },
                logger: false,
            });
            await client.connect();
            const mailboxes = [];
            for await (const box of client.list()) {
                mailboxes.push(box.name);
            }
            await client.logout();
            console.log(`✅ Connection successful! Found ${mailboxes.length} mailboxes.`);
        } catch (err) {
            console.error(`❌ Connection failed: ${err.message}`);
            const proceed = (await prompt(rl, "Save anyway? (y/N): ")).trim().toLowerCase();
            if (proceed !== "y") {
                rl.close();
                process.exit(1);
            }
        }

        account = {
            email,
            authType: "imap",
            imapHost,
            imapPort: imapPort || 993,
            imapSecure: imapSecure !== false,
            imapUser: username,
            // Note: password is stored in accounts.json. For production, consider using keytar.
            imapPass: password,
            addedAt: new Date().toISOString(),
        };

        addAccount(account);
        console.log(`\n✅ IMAP account added: ${email}`);
        console.log(`   Server: ${imapHost}:${imapPort || 993}`);
        console.log(`   Account ID: ${account.email.replace(/[^a-zA-Z0-9]/g, "_")}`);

        console.log("\n💡 Tip: If using Gmail without OAuth, generate an App Password at:");
        console.log("   https://myaccount.google.com/apppasswords");
    }

    rl.close();
    console.log("\nDone. Run 'npm run auth --list' to see all accounts.\n");
}

// List accounts summary if no args
if (args.length === 0 || args[0] === "--add") {
    const { printAccounts } = await import("./accounts.js");
    const accounts = listAccounts();
    if (accounts.length > 0) {
        printAccounts();
        console.log("Run 'npm run auth' to add another account.\n");
    } else {
        await addAccountWizard();
    }
}
