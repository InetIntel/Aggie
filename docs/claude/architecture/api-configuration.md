# API Configuration

This guide covers how to obtain the external API credentials for **Mastodon**,
**Telegram**, and **Cloudflare** sources and how to register them inside Aggie.

Every source in Aggie is backed by a **Credential** (the secret material) and a
**Source** (what to poll). You create the credential once under
**Settings → Credentials**, then reference it from one or more sources under
**Settings → Sources**.

> **Applies to all sources:** credentials and sources only take effect when global
> **Fetching** is toggled **ON** (Settings → Configuration) and the source itself is
> enabled.

---

## Mastodon

Aggie registers the OAuth application on your Mastodon server for you, so you do
**not** need to create an app manually. You only supply your server URL and
approve the authorization in a popup.

### What you need
- The base URL of the Mastodon server your account lives on
  (e.g. `https://mastodon.social`). Any account on that server works — no
  developer registration required.

### Steps in Aggie
1. Go to **Settings → Credentials** and add a new **Mastodon** credential.
2. Enter a **Credential Name** and your **Mastodon Server URL**
   (e.g. `https://mastodon.social`).
3. Click **Authorize Mastodon**. A popup opens on your Mastodon server asking you
   to authorize Aggie (scopes: read access to accounts, statuses, and search).
4. Approve it. The popup closes and the credential is saved automatically —
   Aggie has exchanged the code for an access token and verified it behind the
   scenes.
5. Create a **Source** (Settings → Sources) of type **Mastodon**, select this
   credential, and choose a **Mastodon Mode**:
   - **public** — the server's public/local timeline (use the scope field for
     local vs. federated).
   - **home** — the authorized account's home timeline.
   - **hashtag** — a hashtag you specify.
   - **keyword** — a search term you specify.

> Under the hood Aggie calls `POST /api/v1/apps` to register itself, then the
> standard OAuth `authorize` → `oauth/token` → `verify_credentials` flow. There is
> nothing to configure on the Mastodon side beyond approving the popup.

### Troubleshooting
- **Popup does nothing / blocked:** allow popups for the Aggie domain, then click
  **Open Authorization Window** again.
- **Wrong server URL:** use the server's base URL (`https://mastodon.social`), not
  your profile page.

---

## Telegram (User account)

Telegram "User" sources sign in as **your Telegram account** via MTProto (GramJS)
and can read channels, groups, and chats your account has access to. This requires
API credentials tied to your Telegram account.

### Get your API ID and API hash
1. Go to **https://my.telegram.org** and log in with your Telegram phone number
   (Telegram sends a login code to your app).
2. Open **API development tools**.
3. Fill in the app form (any **App title** and **Short name**; platform can be
   "Other"). Submit it.
4. Copy the **`api_id`** (a number) and **`api_hash`** (a long hex string). Treat
   the hash like a password.

### Steps in Aggie
1. Go to **Settings → Credentials** and add a new **Telegram User** credential.
2. Enter:
   - **Credential Name**
   - **Telegram App API ID** (`api_id` from above)
   - **Telegram App API Hash** (`api_hash` from above)
   - **Telegram Phone Number**, including country code (e.g. `+15551234567`)
3. Click **Send Code**. Telegram sends a login code to your Telegram app.
4. Enter the **Telegram Verification Code**.
5. If your account has **two-factor authentication** enabled, you'll be prompted
   for your **Telegram 2FA Password**. Enter it.
6. The credential is saved once login succeeds. Aggie stores a reusable session
   string, so you won't have to log in again unless the session is revoked.
7. Create a **Source** (Settings → Sources) of type **Telegram User**, select this
   credential, and list the entities to poll in the **Chats / Channels / Users**
   field (comma- or newline-separated):
   - Public channel/user: `@channelname`
   - Private channel: its `-100…` id
   - Or an exact title / username / dialog id

> For **private** groups or channels, the logged-in account must already be a
> member. Public entities can be referenced by `@username`; private ones need the
> numeric `-100…` channel id (or exact title / dialog id).

### Troubleshooting
- **"Code invalid/expired":** login codes are short-lived — click **Start Over** and
  request a new one.
- **Private channel returns nothing:** confirm the logged-in account is a member and
  that you referenced the `-100…` id (not just the title).

---

## Telegram (Bot) — currently disabled

> **Note:** The Telegram **Bot** credential form is present in the codebase but is
> **currently disabled in the Aggie UI**. Use a **Telegram User** source instead
> unless the bot form has been re-enabled. The steps below apply if/when it is.

Bots can only read messages from chats they've been added to (and, for groups,
only if privacy mode is off or they're an admin).

### Create a bot and get its token
1. In Telegram, open a chat with **@BotFather**.
2. Send **`/newbot`** and follow the prompts (choose a name and a username ending
   in `bot`).
3. BotFather replies with a **bot token** (looks like
   `123456789:AAExampleTokenStringHere`). Keep it secret.
4. Add the bot to the channel/group you want to monitor and give it permission to
   read messages (disable privacy mode via BotFather's `/setprivacy` for groups if
   needed).

### Steps in Aggie
1. Go to **Settings → Credentials** and add a new **Telegram Bot** credential.
2. Enter a **Credential Name** and the **Telegram Bot API Token**.
3. Save, then create a **Telegram Bot** source referencing this credential.

---

## Cloudflare

Cloudflare sources poll the **Cloudflare Radar** API for traffic anomalies and
surface them as **alerts** (like IODA reports) rather than social media posts.

### What you need
- A **Cloudflare Radar API token** (used as a Bearer token).

### Steps in Aggie
1. **Create a Cloudflare credential:**
   - Go to **Settings → Credentials** and select **cloudflare** as the credential
     type.
   - Enter a **Credential Name** and your **Cloudflare Radar API token** (Bearer
     token).
   - Save.
2. **Create a Cloudflare source:**
   - Go to **Settings → Sources** and select **cloudflare** as the source type.
   - Enter a **Source Name**.
   - Select a **country code** (currently only **IR** is available in the
     dropdown; modify the frontend if other countries are needed).
   - Select the Cloudflare credential created above.
   - Save.
3. **Backend configuration:**
   - Optionally set `GEO_API_BASE_URL` in `.env` to override the default Cloudflare
     API endpoint.
   - The fetching process automatically picks up the new source and begins polling.
4. **Monitoring:**
   - Reports from Cloudflare traffic anomalies appear in the Reports list.
   - Filter by **cloudflare** in the platform filter to see only Cloudflare reports.
   - They appear as **alerts** (like IODA reports) rather than social media posts.

> **Note:** After configuring the Cloudflare API you should see a log line such as
> `[Fetching-channel-Cloudflare] Success - Parsed and formatted data from url: https://api.cloudflare.com/client/v4/radar/traffic_anomalies?dateStart=…&dateEnd=…&limit=50, total records: 0, new records: 0, existed records: 0, irrelevant region records: 0.`
> This is normal — Cloudflare alerts do not come through as often as IODA alerts do.

### Troubleshooting
- **"total records: 0" in the logs:** expected — Cloudflare alerts are infrequent, so
  most polls return no new records.
- **No reports at all:** confirm the Radar API token is valid, the source's country
  code matches a region with activity, and (if set) `GEO_API_BASE_URL` points at a
  working endpoint.
