# Mail Watch — OpenClaw Skill

Monitor multiple email accounts (Gmail/Google Workspace, Yandex, Mail.ru, Outlook, IMAP), extract tasks/agreements/important info from emails in real-time.

## When to use

Use this skill when the user asks to:
- Monitor email accounts for tasks, agreements, or important information.
- Run a real-time background daemon to capture new emails continuously.
- Check if existing tasks have been completed via email replies.
- Add/remove email accounts.
- Analyze collected emails for action items.

## Prerequisites

- Node.js v18+
- For Gmail/Google Workspace: IMAP enabled in settings + app password (recommended)
- For other IMAP providers: IMAP enabled + password or app password

---

## Step-by-Step Agent Execution Guide

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Add Email Accounts

Interactive account setup:
```bash
npm run auth
```

This launches a wizard that:
1. Asks for email address
2. Auto-detects the mail provider
3. For custom domains (e.g. `user@company.com` on Google Workspace): choose IMAP and enter `imap.gmail.com`
4. Auto-fills IMAP settings for known providers and tests connection
5. Saves the account

### Google / Google Workspace Authentication (Recommended Method: IMAP + App Password)

This is the simplest and most reliable method for all Gmail accounts, including custom domain Google Workspace accounts (e.g. `user@company.com`).

**Steps:**
1. Go to https://myaccount.google.com/apppasswords
2. Sign in with your Google account
3. Click "Select app" → choose "Mail"
4. Click "Select device" → choose "Other (Custom name)" → type "Mail Watch"
5. Click "Generate" → copy the 16-character app password (format: `abcd efgh ijkl mnop`)
6. Run `npm run auth` → enter email → choose IMAP → paste app password

**For Google Workspace (custom domain like `@company.com`):**
- Use IMAP host: `imap.gmail.com` (same as regular Gmail)
- Use the app password generated above
- Regular password will NOT work if 2FA is enabled (which it usually is on Workspace)

**Important notes:**
- App password is different from your Google account password
- If 2FA is not enabled on the Google account, regular password may work
- IMAP must be enabled in Gmail settings: Settings → Forwarding and POP/IMAP → IMAP Access → Enable IMAP
```bash
npm run auth --list
```

Remove account:
```bash
npm run auth --remove <accountId>
```

**IMPORTANT for OAuth**: When the browser opens for Google auth, inform the user immediately. They need to approve access within the browser window.

---

### Step 3: Run the Background Daemon

```bash
npm run daemon:start
```

This starts the real-time listener via PM2:
- Gmail: polls using history API every 30s
- IMAP: uses IDLE for instant notifications + polling fallback
- New emails are saved to `data/messages/listen-<accountId>-<uid>.json`

Manage the daemon:
```bash
npm run daemon:status   # Check PM2 process status
npm run daemon:logs     # Stream logs
npm run daemon:stop     # Stop daemon
```

---

### Step 4: Analyze Emails (AI Parsing)

Manually scan all accounts for recent emails:
```bash
npm run scan
```

View unformatted messages ready for AI analysis:
```bash
node src/analyze.js
```

When analyzing emails, extract:
- **Tasks**: Invoices to pay, documents to sign, follow-ups, action items
- **Agreements**: Confirmed plans, commitments, decisions via email
- **Important**: Urgent deadlines, contact info, announcements, payment confirmations

Merge extracted items into `data/mail-watch.json` using `analyze.js` helper functions.

---

### Step 5: Check Task Completion

```bash
npm run check
```

Scans recent emails for completion phrases (done, sent, paid, etc.) and marks matching tasks as completed.

---

## Data Structures & Files

- **`data/accounts.json`** — Account configurations (emails, auth types, IMAP settings)
- **`data/tokens/<id>.json`** — OAuth tokens (auto-generated, do not commit)
- **`data/google-credentials.json`** — Google OAuth credentials (do not commit)
- **`data/mail-watch.json`** — Unified database: tasks, agreements, important items
- **`data/listen-state.json`** — Daemon state (last history IDs, UIDs)
- **`data/messages/`** — Raw email messages as JSON arrays

## Error Recovery

- **OAuth token expired**: Run `npm run auth` for that account to re-authenticate
- **IMAP connection failed**: Check IMAP is enabled in mail settings. For Gmail, use app password
- **Port 3000 in use** (OAuth callback): Free port 3000 or change OAuth redirect URI

## Supported Providers

| Provider | Auth Type | Notes |
|----------|-----------|-------|
| Gmail | OAuth 2.0 | Recommended. Full API access |
| Gmail | IMAP | Requires app password |
| Yandex | IMAP | Enable IMAP in settings |
| Mail.ru | IMAP | Enable IMAP in settings |
| Outlook/Hotmail | IMAP | May need app password |
| iCloud | IMAP | Needs app-specific password |
| Custom | IMAP | Manual host/port config |
