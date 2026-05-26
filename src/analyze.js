/**
 * Analyze collected messages from data/messages/ directory.
 * This is an AI helper — it prepares the data structure for AI parsing.
 *
 * What AI should extract from messages:
 * - **Tasks**: Action items (invoices to pay, documents to sign, follow-ups, etc.)
 * - **Agreements**: Commitments, decisions, confirmed plans
 * - **Important**: Urgent info, contacts, announcements, deadlines
 */

import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const MESSAGES_DIR = "data/messages";
const DATA_FILE = "data/mail-watch.json";

function loadData() {
    if (!existsSync(DATA_FILE)) {
        return { tasks: [], agreements: [], important: [], scannedMessageIds: {} };
    }
    return JSON.parse(readFileSync(DATA_FILE, "utf-8"));
}

function saveData(data) {
    writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function getUnprocessedMessages(data) {
    if (!existsSync(MESSAGES_DIR)) return [];
    const files = readdirSync(MESSAGES_DIR).filter(f => f.endsWith(".json"));
    const messages = [];

    for (const file of files) {
        try {
            const msgs = JSON.parse(readFileSync(join(MESSAGES_DIR, file), "utf-8"));
            if (Array.isArray(msgs)) {
                for (const msg of msgs) {
                    if (!data.scannedMessageIds?.[msg.id]) {
                        messages.push(msg);
                    }
                }
            }
        } catch (e) {
            // Skip malformed files
        }
    }

    return messages;
}

function mergeItems(existing, newItems, key) {
    const map = new Map(existing.map(item => [item[key], item]));
    for (const item of newItems) {
        if (!map.has(item[key])) {
            map.set(item[key], item);
        }
    }
    return Array.from(map.values());
}

/**
 * Format messages for AI analysis prompt.
 */
export function formatMessagesForAI(messages) {
    return messages.map((m, i) => {
        return "[" + (i + 1) + "] From: " + m.from + " | To: " + m.to + " | Subject: " + m.subject + " | Date: " + m.date + "\nAccount: " + m.accountEmail + " (" + m.accountId + ")\nBody: " + (m.body || "").slice(0, 3000) + "\n---";
    }).join("\n\n");
}

/**
 * Merge extracted items into the data store.
 */
export function mergeExtracted(data, extracted) {
    if (extracted.tasks?.length) {
        data.tasks = mergeItems(data.tasks, extracted.tasks, "msgId");
    }
    if (extracted.agreements?.length) {
        data.agreements = mergeItems(data.agreements, extracted.agreements, "msgId");
    }
    if (extracted.important?.length) {
        data.important = mergeItems(data.important, extracted.important, "msgId");
    }
    for (const msg of extracted._processedMessages || []) {
        if (!data.scannedMessageIds) data.scannedMessageIds = {};
        data.scannedMessageIds[msg.id] = true;
    }
    return data;
}

/**
 * Print summary of current data.
 */
export function printSummary(data) {
    console.log("\n=== Mail Watch Summary ===");
    var taskCount = data.tasks?.length || 0;
    var openCount = (data.tasks || []).filter(t => t.status === "open").length;
    var agrCount = data.agreements?.length || 0;
    var impCount = data.important?.length || 0;
    var lastScan = data.lastScan || "never";
    var procCount = Object.keys(data.scannedMessageIds || {}).length;
    console.log("Tasks:       " + taskCount + " (" + openCount + " open)");
    console.log("Agreements:  " + agrCount);
    console.log("Important:   " + impCount);
    console.log("Last scan:   " + lastScan);
    console.log("Processed:   " + procCount + " messages");
    console.log("===========================\n");

    if (data.tasks?.length) {
        console.log("Open tasks:");
        for (const t of data.tasks.filter(t => t.status === "open")) {
            var mid = t.msgId || "?";
            console.log("  - [" + mid + "] " + t.title + " (from: " + t.from + ", " + t.date + ")");
        }
        console.log();
    }

    if (data.agreements?.length) {
        console.log("Agreements:");
        for (const a of data.agreements.slice(-10)) {
            var amid = a.msgId || "?";
            console.log("  - [" + amid + "] " + a.title);
        }
        console.log();
    }

    if (data.important?.length) {
        console.log("Important:");
        for (const imp of data.important.slice(-10)) {
            var impid = imp.msgId || "?";
            console.log("  - [" + impid + "] " + imp.title);
        }
        console.log();
    }
}

/**
 * Main analysis — returns unprocessed messages for AI to parse.
 */
export function prepareAnalysis() {
    const data = loadData();
    const messages = getUnprocessedMessages(data);

    if (messages.length === 0) {
        console.log("No new messages to analyze.");
        printSummary(data);
        return null;
    }

    console.log("Found " + messages.length + " unprocessed message(s).\n");
    return { data, messages };
}

/**
 * Save results after AI extraction.
 */
export function saveAnalysis(data, extracted) {
    const merged = mergeExtracted(data, extracted);
    saveData(merged);
    printSummary(merged);
}

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
    const data = loadData();
    const messages = getUnprocessedMessages(data);

    if (messages.length === 0) {
        printSummary(data);
        console.log("No new messages to analyze.");
        process.exit(0);
    }

    console.log("\n=== " + messages.length + " New Email(s) to Analyze ===\n");
    console.log(formatMessagesForAI(messages));
    printSummary(data);
}
