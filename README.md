# Mail Watch — OpenClaw Skill

Monitor multiple email accounts in real-time, extract tasks/agreements/important info from emails, and track task completion.

## What it does

- **Multi-account support**: Connect multiple email accounts (Gmail, Yandex, Mail.ru, Outlook, iCloud, custom IMAP)
- **Gmail OAuth 2.0**: Secure Gmail access via Google OAuth (no password stored)
- **IMAP fallback**: Standard IMAP for any mail provider with auto-detected settings
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
- Auto-detect provider (Gmail, Yandex, Mail.ru, etc.)
- For Gmail: open browser for OAuth authorization
- For others: configure IMAP (auto-detected) and test connection

**Gmail OAuth setup** (one-time):
1. Go to https://console.cloud.google.com/
2. Create a project → Enable Gmail API
3. Create OAuth credentials → Desktop app
4. Download JSON → save as `data/google-credentials.json`

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
| Gmail | OAuth 2.0 (recommended) | Full API access via Google Cloud |
| Gmail | IMAP | App password if 2FA enabled |
| Yandex | IMAP | Enable in Настройки → Почтовые программы |
| Mail.ru | IMAP | Enable in Настройки → Почтовые программы |
| Outlook/Hotlive | IMAP | May require app password |
| iCloud | IMAP | App-specific password required |
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
