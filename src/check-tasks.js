/**
 * Check task completion by scanning recent emails for completion indicators.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { listAccounts, loadToken } from "./accounts.js";
import { getGmailMessages } from "./gmail-client.js";
import { getImapMessages } from "./imap-client.js";

const DATA_FILE = "data/mail-watch.json";

const COMPLETION_PHRASES = [
    "done", "completed", "finished", "resolved", "closed",
    "готово", "сделано", "выполнено", "завершено", "закрыто",
    "sent", "delivered", "shipped", "confirmed", "approved",
    "отправлено", "доставлено", "подтверждено", "согласовано",
    "paid", "received", "оплачено", "получено",
];

function loadData() {
    if (!existsSync(DATA_FILE)) return { tasks: [], agreements: [], important: [] };
    return JSON.parse(readFileSync(DATA_FILE, "utf-8"));
}

function saveData(data) {
    writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function checkCompletion(emailBody, subject) {
    const text = (subject + " " + emailBody).toLowerCase();
    return COMPLETION_PHRASES.some(phrase => text.includes(phrase));
}

async function main() {
    console.log("=== Mail Watch - Check Task Completion ===\n");

    const data = loadData();
    const openTasks = data.tasks?.filter(t => t.status === "open") || [];

    if (openTasks.length === 0) {
        console.log("No open tasks to check.");
        return;
    }

    console.log(`Checking ${openTasks.length} open task(s)...\n`);

    const accounts = listAccounts();
    let updated = 0;

    for (const account of accounts) {
        try {
            let messages = [];
            if (account.authType === "gmail-oauth") {
                const token = loadToken(account.id);
                if (token) messages = await getGmailMessages(account.id, token, 20);
            } else if (account.authType === "imap") {
                messages = await getImapMessages(account, 20);
            }

            for (const task of openTasks) {
                if (task.status !== "open") continue;

                // Check if any recent email references this task
                const related = messages.filter(m => {
                    const text = (m.subject + " " + m.body + " " + m.from).toLowerCase();
                    const taskRef = (task.title + " " + task.description + " " + task.from).toLowerCase();
                    // Simple keyword overlap check
                    const keywords = taskRef.split(/\s+/).filter(w => w.length > 4);
                    return keywords.some(kw => text.includes(kw));
                });

                for (const email of related) {
                    if (checkCompletion(email.body, email.subject)) {
                        task.status = "done";
                        task.completedAt = new Date().toISOString();
                        task.completedVia = `Email from ${email.from}: ${email.subject}`;
                        console.log(`  ✅ Task completed: "${task.title}"`);
                        console.log(`     Via: ${email.from} — ${email.subject}`);
                        updated++;
                        break;
                    }
                }
            }
        } catch (err) {
            console.error(`  ⚠️ Error checking ${account.email}: ${err.message}`);
        }
    }

    saveData(data);
    console.log(`\n=== Done: ${updated} task(s) marked as completed ===`);
}

main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
});
