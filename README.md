# Mail Watch — OpenClaw Skill

Monitor multiple email accounts in real-time, extract tasks/agreements/important info from emails, and track task completion.

## What it does

- **Multi-account support**: Connect multiple email accounts (Gmail, Google Workspace, Yandex, Mail.ru, Outlook, iCloud, custom IMAP)
- **Gmail via IMAP + App Password**: Simplest auth method — no Google Cloud setup needed
- **IMAP for all providers**: Standard IMAP with auto-detected settings for known providers
- **Real-time listener daemon**: Background PM2 daemon polling for new emails every 30s (IMAP IDLE when available)
- **Information extractor**: Scan and parse emails to extract tasks, agreements, and important information
- **Task tracking**: Automatically checks if tasks have been completed via email replies

## Requirements

- Node.js v18+
- PM2 (auto-installed as dependency)

## Installation

```bash
git clone https://github.com/<your-username>/openclaw-mail-watch.git
cd openclaw-mail-watch
npm install
```

---

## Quick Start

### 1. Add Email Accounts

```bash
npm run auth
```

Interactive wizard will:
- Ask for your email
- Auto-detect provider (Yandex, Mail.ru, Outlook, etc.)
- For unknown domains (Google Workspace custom): prompts for IMAP host (`imap.gmail.com`)
- Auto-fills IMAP settings and tests connection

**Gmail / Google Workspace Authentication:**

The recommended method is IMAP with App Password — no Google Cloud setup needed.

1. Go to https://myaccount.google.com/apppasswords
2. Sign in with your Google account
3. Select app: "Mail", Select device: "Other" → "Mail Watch"
4. Generate → copy the 16-character password
5. Run `npm run auth` → enter email → choose IMAP → paste app password

For Google Workspace (custom domain like `@company.com`):
- IMAP host: `imap.gmail.com`
- Username: your full email
- Password: the app password generated above

### 2. Start the Background Daemon

```bash
npm run daemon:start
```

New emails are automatically captured and saved to `data/messages/`.

### 3. Scan for Recent Emails

```bash
npm run scan
```

### 4. Check Task Completion

```bash
npm run check
```

---

## Account Management

```bash
npm run auth           # Add account wizard
npm run auth --list    # List configured accounts
npm run auth --remove <id>  # Remove an account
```

---

## Daemon Management

```bash
npm run daemon:start    # Start listener
npm run daemon:stop     # Stop listener
npm run daemon:status   # PM2 status
npm run daemon:logs     # View logs
```

---

## Supported Providers

| Provider | Auth | Notes |
|----------|------|-------|
| Gmail / Google Workspace | IMAP + App Password | **Recommended.** `imap.gmail.com`, port 993. App password from myaccount.google.com/apppasswords |
| Yandex | IMAP | `imap.yandex.ru:993`. Enable in Настройки → Почтовые программы |
| Mail.ru | IMAP | `imap.mail.ru:993`. Enable in Настройки → Почтовые программы |
| Outlook/Hotmail | IMAP | `outlook.office365.com:993`. May need app password |
| iCloud | IMAP | `imap.mail.me.com:993`. App-specific password required |
| Any IMAP | IMAP | Manual host/port/ssl configuration |

---

## File Structure

```
openclaw-mail-watch/
├── SKILL.md                     # OpenClaw skill instructions for AI agents
├── README.md                    # This file
├── package.json
├── .gitignore
├── data/
│   ├── accounts.json            # Account configs (do not commit if contains passwords)
│   ├── google-credentials.json  # Google OAuth credentials (do not commit)
│   ├── tokens/                  # OAuth tokens per account (do not commit)
│   │   └── <accountId>.json
│   ├── mail-watch.json          # Tasks/agreements/important database
│   ├── listen-state.json        # Daemon state (last UIDs, history IDs)
│   └── messages/                # Raw captured messages
│       ├── <accountId>-<timestamp>.json   # Batch scan results
│       └── listen-<accountId>-<uid>.json  # Real-time captured
└── src/
    ├── accounts.js              # Account CRUD + IMAP defaults
    ├── auth.js                  # Interactive auth wizard
    ├── gmail-oauth.js           # Google OAuth 2.0 flow
    ├── gmail-client.js          # Gmail API client
    ├── imap-client.js           # IMAP client (fetch + IDLE)
    ├── scan.js                  # Batch scanner for all accounts
    ├── listen.js                # Real-time polling daemon
    ├── analyze.js               # Data analysis helpers + AI formatting
    └── check-tasks.js           # Task completion checker
```

## Notes

- **OAuth tokens** are auto-refreshed when expired (offline access)
- **IMAP passwords** are stored in `accounts.json` in plain text. For production, consider using OS keychain (keytar — already in deps, not yet integrated)
- **Multiple accounts**: each account has a unique ID derived from its email
- **Single Gmail OAuth app** can handle multiple Gmail accounts (each gets its own token file)

## Uses

- [googleapis](https://github.com/googleapis/googleapis) — Gmail API
- [imapflow](https://github.com/postalsys/imapflow) — IMAP client with IDLE support
- [pm2](https://pm2.keymetrics.io/) — Process manager for background daemon

## Disclaimer

This tool accesses email accounts programmatically. Gmail OAuth requires Google Cloud project setup. IMAP access requires enabling IMAP in mail settings. Use responsibly and in compliance with provider terms of service.
