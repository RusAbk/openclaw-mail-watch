/**
 * Gmail OAuth 2.0 authentication.
 *
 * Prerequisites:
 *   1. Create a project at https://console.cloud.google.com/
 *   2. Enable the Gmail API
 *   3. Create OAuth 2.0 credentials (Desktop app or Web app)
 *   4. Download the credentials JSON
 *
 * This script:
 *   - Opens a browser for the user to authorize
 *   - Starts a local server to receive the callback
 *   - Saves the tokens for future use
 */

import { OAuth2Client } from "googleapis-common";
import { google } from "googleapis";
import { createServer } from "node:http";
import { parse } from "node:url";
import open from "open";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CREDENTIALS_PATH = join(__dirname, "..", "data", "google-credentials.json");
const SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.labels",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
];

/**
 * Load Google OAuth credentials from file.
 * The file should be downloaded from Google Cloud Console.
 */
function loadCredentials() {
    if (!existsSync(CREDENTIALS_PATH)) {
        console.error("\n❌ Google OAuth credentials not found!");
        console.error(`   Expected at: ${CREDENTIALS_PATH}`);
        console.error("\n   To set up:");
        console.error("   1. Go to https://console.cloud.google.com/");
        console.error("   2. Create a project (or select existing)");
        console.error("   3. Enable the Gmail API");
        console.error("   4. Go to Credentials → Create Credentials → OAuth client ID");
        console.error("   5. Choose 'Desktop app' (or 'Web app' with redirect URI http://localhost:3000/callback)");
        console.error("   6. Download the JSON and save it as data/google-credentials.json");
        console.error("\n   Alternatively, set GOOGLE_CREDENTIALS_JSON env var with the JSON content.\n");
        process.exit(1);
    }

    const content = readFileSync(CREDENTIALS_PATH, "utf-8");
    const creds = JSON.parse(content);

    // Support both "installed" (Desktop) and "web" formats
    const clientId = creds.installed?.client_id || creds.web?.client_id;
    const clientSecret = creds.installed?.client_secret || creds.web?.client_secret;
    const redirectUris = creds.installed?.redirect_uris || creds.web?.redirect_uris;

    if (!clientId || !clientSecret) {
        throw new Error("Invalid credentials JSON: missing client_id or client_secret");
    }

    return { clientId, clientSecret, redirectUris };
}

/**
 * Authenticate with Google OAuth.
 * Opens browser, waits for callback, returns tokens and user info.
 */
export async function authenticateGmail() {
    const { clientId, clientSecret, redirectUris } = loadCredentials();

    // Determine redirect URI
    let redirectUri = "http://localhost:3000/callback";
    if (redirectUris && redirectUris.length > 0) {
        // Prefer localhost redirect URI if available
        const localRedirect = redirectUris.find(u => u.includes("localhost") || u.includes("127.0.0.1"));
        if (localRedirect) redirectUri = localRedirect;
    }

    const oauth2Client = new OAuth2Client(clientId, clientSecret, redirectUri);

    // Generate auth URL
    const authUrl = oauth2Client.generateAuthUrl({
        access_type: "offline",
        scope: SCOPES,
        prompt: "consent", // Force to get refresh token
    });

    console.log("Opening browser for Google authorization...");
    console.log(`If browser doesn't open, visit this URL:\n${authUrl}\n`);

    // Start local server to receive callback
    const codePromise = new Promise((resolve, reject) => {
        const server = createServer(async (req, res) => {
            const url = parse(req.url, true);
            if (url.pathname === "/callback") {
                const code = url.query.code;
                if (code) {
                    res.writeHead(200, { "Content-Type": "text/html" });
                    res.end(`
                        <html>
                        <head><title>Mail Watch — Authorized</title></head>
                        <body style="font-family: sans-serif; text-align: center; padding: 50px;">
                            <h1>✅ Authorized successfully!</h1>
                            <p>You can close this window and return to the terminal.</p>
                        </body>
                        </html>
                    `);
                    server.close();
                    resolve(code);
                } else {
                    const error = url.query.error || "Unknown error";
                    res.writeHead(400, { "Content-Type": "text/html" });
                    res.end(`<h1>❌ Authorization failed: ${error}</h1>`);
                    server.close();
                    reject(new Error(error));
                }
            } else {
                res.writeHead(404);
                res.end("Not found");
            }
        });

        server.listen(3000, () => {
            console.log("Waiting for authorization on http://localhost:3000/callback ...");
        });

        server.on("error", (err) => {
            if (err.code === "EADDRINUSE") {
                console.error("❌ Port 3000 is already in use. Please free it and try again.");
            }
            reject(err);
        });
    });

    // Open browser
    try {
        await open(authUrl);
    } catch {
        console.log("⚠️ Could not open browser automatically. Please open the URL above manually.");
    }

    // Wait for the authorization code
    const code = await codePromise;

    // Exchange code for tokens
    console.log("Exchanging authorization code for tokens...");
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Get user info
    const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
    const { data: userInfo } = await oauth2.userinfo.get();

    return {
        tokens,
        userInfo: {
            email: userInfo.email,
            name: userInfo.name,
            picture: userInfo.picture,
        },
    };
}

/**
 * Get an authenticated OAuth2 client for an account.
 */
export function getOAuth2Client(accountId, tokens) {
    const { clientId, clientSecret } = loadCredentials();
    const oauth2Client = new OAuth2Client(clientId, clientSecret, "http://localhost:3000/callback");
    oauth2Client.setCredentials(tokens);

    // Auto-refresh token if expired
    oauth2Client.on("tokens", (newTokens) => {
        // Merge new tokens with existing (keep refresh_token if not returned)
        const updated = { ...tokens, ...newTokens };
        if (!newTokens.refresh_token && tokens.refresh_token) {
            updated.refresh_token = tokens.refresh_token;
        }
        const { saveToken } = require("./accounts.js");
        saveToken(accountId, updated);
    });

    return oauth2Client;
}
