/**
 * Payment detection and extraction from emails.
 * Parses bank notification emails to extract transaction details.
 * Stores payment records for expense tracking and reporting.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const PAYMENTS_DIR = "data/payments";
const PAYMENTS_FILE = "data/payments/all.json";

function ensureDirs() {
    if (!existsSync("data/payments")) mkdirSync("data/payments", { recursive: true });
}

function loadPayments() {
    if (!existsSync(PAYMENTS_FILE)) return [];
    return JSON.parse(readFileSync(PAYMENTS_FILE, "utf-8"));
}

function savePayments(payments) {
    writeFileSync(PAYMENTS_FILE, JSON.stringify(payments, null, 2));
}

/**
 * Known bank/payment sender patterns.
 */
const BANK_PATTERNS = [
    { sender: "vpbank", bank: "VPBank", country: "VN" },
    { sender: "tpbank", bank: "TPBank", country: "VN" },
    { sender: "acb.com.vn", bank: "ACB", country: "VN" },
    { sender: "techcombank.com.vn", bank: "Techcombank", country: "VN" },
    { sender: "vietcombank.com.vn", bank: "Vietcombank", country: "VN" },
    { sender: "bidv.com.vn", bank: "BIDV", country: "VN" },
    { sender: "mbbank.com.vn", bank: "MBBank", country: "VN" },
];

const PAYMENT_SUBJECTS = [
    "Transfer successful",
    "Payment successful",
    "Transaction successful",
    "Giao dịch thành công",
    "Thanh toán thành công",
    "Chuyển khoản thành công",
    "Debit notification",
    "Credit notification",
    "缴费成功",  // Chinese
    "支付成功",
];

/**
 * Check if an email is a payment notification.
 */
export function isPaymentEmail(email) {
    const from = (email.from || "").toLowerCase();
    const subject = (email.subject || "").toLowerCase();

    const knownBank = BANK_PATTERNS.some(p => from.includes(p.sender));
    const paymentSubject = PAYMENT_SUBJECTS.some(s => subject.includes(s.toLowerCase()));

    return knownBank && paymentSubject;
}

/**
 * Parse payment details from email body.
 * Handles VPBank and generic formats.
 */
export function parsePayment(email) {
    const body = email.body || "";
    const from = email.from || "";

    // Detect bank
    let bank = "Unknown";
    for (const p of BANK_PATTERNS) {
        if (from.toLowerCase().includes(p.sender)) {
            bank = p.bank;
            break;
        }
    }

    // Parse VPBank format
    if (bank === "VPBank") {
        return parseVPBankPayment(email, body);
    }

    // Generic fallback
    return {
        id: email.id,
        date: email.date,
        bank,
        from,
        subject: email.subject,
        amount: null,
        currency: null,
        type: "unknown",
        details: email.snippet || body.slice(0, 200),
        raw: body.slice(0, 2000),
    };
}

/**
 * Parse VPBank transaction notification.
 * Format example:
 *   Mã giao dịch: FT26141636829963/212131524295
 *   Ngày, giờ giao dịch: 21/05/2026 21:10:19
 *   Tài khoản trích nợ: 275112798
 *   Số tiền trích nợ: 80,000 VND
 *   Tài khoản ghi có: 1066609853
 *   Số tiền ghi có: 80,000 VND
 *   Tên người hưởng: HO KINH DOANH BENH VIEN THU Y HOMEVET
 *   Nội dung chuyển tiền: ABKADIROV RUSLAN transfer
 */
function parseVPBankPayment(email, body) {
    // VPBank body is one long line. Extract fields by known patterns.
    const extract = (patterns, body) => {
        for (const pat of patterns) {
            const m = body.match(pat);
            if (m && m[1]) return m[1].trim();
        }
        return null;
    };

    const txCode = extract([
        /Mã giao dịch[:]?\s*([A-Z0-9/]+)/i,
        /Transaction code[:]?\s*([A-Z0-9/]+)/i
    ], body);

    const txDate = extract([
        /Ngày, giờ giao dịch[:]?\s*(\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2})/i,
        /Transaction date, time[:]?\s*(\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2})/i
    ], body);

    const debitAccount = extract([
        /Tài khoản trích nợ[:]?\s*(\d+)/i,
        /Debit Account[:]?\s*(\d+)/i
    ], body);

    const debitAmount = extract([
        /Số tiền trích nợ[:]?\s*([0-9,.]+\s*[A-Z]{3})/i,
        /Debit Amount[:]?\s*([0-9,.]+\s*[A-Z]{3})/i
    ], body);

    const creditAccount = extract([
        /Tài khoản ghi có[:]?\s*(\d+)/i,
        /Credit Account[:]?\s*(\d+)/i
    ], body);

    const creditAmount = extract([
        /Số tiền ghi có[:]?\s*([0-9,.]+\s*[A-Z]{3})/i,
        /Credit Amount[:]?\s*([0-9,.]+\s*[A-Z]{3})/i
    ], body);

    const beneficiary = extract([
        /Tên người hưởng[:]?\s*(.+?)(?:Beneficiary Name|$)/i,
        /Beneficiary Name[:]?\s*(.+?)(?:Loại phí|Charge|$)/i
    ], body);

    const description = extract([
        /Nội dung chuyển tiền[:]?\s*(.+?)(?:Details of Payment|$)/i,
        /Details of Payment[:]?\s*(.+)$/i
    ], body);

    const feeAmount = extract([/Số tiền phí[:]?\s*([0-9,.]+\s*[A-Z]{3})/i], body) || '0 VND';

    // Parse amount (e.g. "80,000 VND")
    let amount = null;
    let currency = null;
    const amountStr = debitAmount || creditAmount || '';
    const amountMatch = amountStr.match(/([0-9,.]+)\s*([A-Z]{3})?/);
    if (amountMatch) {
        const numStr = amountMatch[1].replace(/,/g, '');
        amount = parseFloat(numStr);
        currency = amountMatch[2] || 'VND';
    }

    return {
        id: email.id,
        date: email.date,
        bank: "VPBank",
        from: email.from,
        subject: email.subject,
        txCode,
        txDate,
        debitAccount,
        creditAccount,
        beneficiary,
        amount,
        currency,
        feeAmount,
        description,
        type: "outgoing_transfer",
        raw: body.slice(0, 2000),
    };
}

/**
 * Extract and save payments from an email.
 * Returns the payment record if found, null otherwise.
 */
export function extractAndSavePayment(email) {
    if (!isPaymentEmail(email)) return null;

    const payment = parsePayment(email);
    const payments = loadPayments();

    // Deduplicate by email ID
    if (payments.find(p => p.id === email.id)) return null;

    ensureDirs();
    payments.push(payment);
    savePayments(payments);

    // Also save individual record
    const payFile = join(PAYMENTS_DIR, `${email.id}.json`);
    writeFileSync(payFile, JSON.stringify(payment, null, 2));

    return payment;
}

/**
 * Generate expense report from stored payments.
 */
export function generateReport(options = {}) {
    const payments = loadPayments();
    const { fromDate, toDate, groupBy = "month" } = options;

    let filtered = payments;
    if (fromDate) {
        filtered = filtered.filter(p => !p.date || new Date(p.date) >= new Date(fromDate));
    }
    if (toDate) {
        filtered = filtered.filter(p => !p.date || new Date(p.date) <= new Date(toDate));
    }

    const report = {
        totalPayments: filtered.length,
        totalAmountVND: 0,
        totalAmountByCurrency: {},
        byBank: {},
        byMonth: {},
        byCategory: {},
        payments: filtered,
    };

    for (const p of filtered) {
        // By bank
        if (!report.byBank[p.bank]) report.byBank[p.bank] = { count: 0, total: 0 };
        report.byBank[p.bank].count++;

        // By currency
        const cur = p.currency || "unknown";
        if (!report.totalAmountByCurrency[cur]) report.totalAmountByCurrency[cur] = 0;
        if (p.amount) {
            report.totalAmountByCurrency[cur] += p.amount;
            if (cur === "VND") report.totalAmountVND += p.amount;
            report.byBank[p.bank].total += p.amount;
        }

        // By month
        if (p.date) {
            const month = p.date.slice(0, 7); // YYYY-MM
            if (!report.byMonth[month]) report.byMonth[month] = { count: 0, total: 0 };
            report.byMonth[month].count++;
            if (p.amount) report.byMonth[month].total += p.amount;
        }

        // By beneficiary (rough category)
        if (p.beneficiary) {
            const cat = categorizePayment(p);
            if (!report.byCategory[cat]) report.byCategory[cat] = { count: 0, total: 0 };
            report.byCategory[cat].count++;
            if (p.amount) report.byCategory[cat].total += p.amount;
        }
    }

    return report;
}

/**
 * Rough categorization by beneficiary/description.
 */
function categorizePayment(payment) {
    const text = ((payment.beneficiary || "") + " " + (payment.description || "")).toUpperCase();

    if (text.includes("TIỆC") || text.includes("BUFFET") || text.includes("RESTAURANT") || text.includes("FOOD") || text.includes("CF")) return "food";
    if (text.includes("HOMEVET") || text.includes("VETERINARY") || text.includes("PET")) return "pets";
    if (text.includes("GRAB") || text.includes("BE") || text.includes("TAXI")) return "transport";
    if (text.includes("TIỀN TRỌ") || text.includes("RENT") || text.includes("COWORKING") || text.includes("OFFICE")) return "rent_office";
    if (text.includes("ĐIỆN") || text.includes("NƯỚC") || text.includes("ELECTRIC") || text.includes("WATER")) return "utilities";
    if (text.includes("VIETTEL") || text.includes("MOBIFONE") || text.includes("PHONE") || text.includes("TOPUP")) return "phone";
    if (text.includes("BẢO HIỂM") || text.includes("INSURANCE")) return "insurance";
    if (text.includes("THUẾ") || text.includes("TAX")) return "tax";
    if (text.includes("LƯƠNG") || text.includes("SALARY") || text.includes("PAYROLL")) return "salary";
    if (text.includes("NHÀ CUNG CẤP") || text.includes("SUPPLIER") || text.includes("VENDOR")) return "suppliers";

    return "other";
}

/**
 * Print a readable expense report.
 */
export function printReport(report) {
    console.log("\n=== Payment Report ===");
    console.log("Total payments: " + report.totalPayments);
    console.log("Total (VND): " + report.totalAmountVND.toLocaleString());

    console.log("\nBy currency:");
    for (const [cur, total] of Object.entries(report.totalAmountByCurrency)) {
        console.log("  " + cur + ": " + total.toLocaleString());
    }

    console.log("\nBy bank:");
    for (const [bank, data] of Object.entries(report.byBank)) {
        console.log("  " + bank + ": " + data.count + " txns, total " + (data.total || 0).toLocaleString());
    }

    console.log("\nBy month:");
    for (const [month, data] of Object.entries(report.byMonth).sort()) {
        console.log("  " + month + ": " + data.count + " txns, " + (data.total || 0).toLocaleString());
    }

    console.log("\nBy category:");
    for (const [cat, data] of Object.entries(report.byCategory).sort((a, b) => b[1].total - a[1].total)) {
        console.log("  " + cat + ": " + data.count + " txns, " + (data.total || 0).toLocaleString());
    }

    console.log("\nRecent payments:");
    const recent = report.payments.slice(-15).reverse();
    for (const p of recent) {
        const amt = p.amount ? p.amount.toLocaleString() + " " + (p.currency || "?") : "?";
        const date = p.date ? p.date.slice(0, 10) : "?";
        const bnf = p.beneficiary || p.description || "?";
        console.log("  " + date + " | " + p.bank + " | " + amt + " | " + bnf);
    }
    console.log("======================\n");
}

/**
 * Get payment summary since a given date.
 */
export function getSummary(since = null) {
    const payments = loadPayments();
    let filtered = payments;

    if (since) {
        const sinceDate = new Date(since);
        filtered = filtered.filter(p => p.date && new Date(p.date) >= sinceDate);
    }

    const result = {
        count: filtered.length,
        byBank: {},
        totalVND: 0,
        byCategory: {},
    };

    for (const p of filtered) {
        if (!result.byBank[p.bank]) result.byBank[p.bank] = [];
        result.byBank[p.bank].push(p);

        if (p.amount && p.currency === "VND") result.totalVND += p.amount;

        const cat = categorizePayment(p);
        if (!result.byCategory[cat]) result.byCategory[cat] = [];
        result.byCategory[cat].push(p);
    }

    return result;
}
