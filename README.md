# walky ✳

One couple. One daily yes. **https://walky.wims.vc**

A Netlify-hosted web app and service, plus a small Android APK with a native one-tap widget. Three home views share the same data: a big button, an editable monthly calendar, and an interactive Three.js paper chain. No GPS, distance, individual scores, or accounts.

## Netlify setup

1. Import `superfunteam/walky` into Netlify. `netlify.toml` sets `npm run build`, `dist`, and `netlify/functions` automatically.
2. Add `walky.wims.vc` under **Domain management** and apply the DNS records Netlify provides. HTTPS must be active before configuring Android.
3. Add the following **Functions-scoped** environment variables in Netlify. Redeploy after changing them.

| Variable | Value |
| --- | --- |
| `WALKY_TOKEN` | A private shared connection code, at least 32 characters. Generate with `openssl rand -hex 32`. |
| `WALKY_TIMEZONE` | `America/Chicago` (default). This calendar is intended for Central time, matching the reminder. |
| `CLARK` | Clark's phone, preferably `+1` followed by 10 digits; no punctuation. |
| `ANGIE` | Angie's phone, same format. |
| `TEXBELT` or `TEXTBELT` | Your Textbelt API key. Either spelling works; `TEXBELT` takes precedence if both are set. |
| `SMS_ENABLED` | `true`; set `false` to pause reminder texts. |

No external database setup is required. Site-wide Netlify Blobs stores one record per walk date with strong consistency. Conditional creation makes repeated taps and concurrent requests count once. Deploy previews use a separate namespace and never send scheduled texts.

Open the site, choose **Settings**, and enter `WALKY_TOKEN` once on each phone. It is held in an HttpOnly cookie in the web app. Settings includes the partner connection code and scoped integration URLs. Rotating `WALKY_TOKEN` invalidates all sessions and derived integration keys; walk history stays intact.

## Voice / Home / NFC endpoint

You handle the Google Home action. It only needs to call:

```text
GET https://walky.wims.vc/api/log?key=YOUR_LOG_KEY
```

Copy the complete URL from **Settings → Log today's walk**. `POST` to the same URL also works. The key is restricted to logging **today**; it cannot delete walks or edit past days. Repeated requests are idempotent. The returned JSON contains `walkedToday`, `streak`, `total`, and the calendar.

This URL deliberately changes state on GET so simple shortcuts and NFC readers can call it. Anyone opening it, including a link previewer, can log that day's walk. Keep it private and don't paste it into services that prefetch links.

## Status & TRMNL

```text
GET https://walky.wims.vc/api/status?key=YOUR_READ_KEY
```

The read key is separate from the log key. It cannot change anything. Configure a **TRMNL Private Plugin**, choose **Polling**, paste the status feed URL from Settings, and paste [`integrations/trmnl/full.liquid`](integrations/trmnl/full.liquid) into the full-screen markup editor. A 15-minute refresh is sufficient. `settings.yml` documents reusable fields; it is not required for a private one-off setup. Private Plugins require a TRMNL plan/license that provides them.

TRMNL renders a large WE DID / NOT YET status, streak, weekly dots, and total. The device reflects its next refresh, not an instant push.

## MCP

Streamable HTTP at `https://walky.wims.vc/mcp`, authenticated with `Authorization: Bearer WALKY_TOKEN`.

- `walk_status`: read current status and history.
- `log_walk`: idempotently record today.

The official MCP TypeScript SDK handles protocol negotiation and request validation. Compatible clients must support custom Bearer authentication (there is no OAuth discovery flow). The browser also feature-detects the experimental WebMCP API and exposes the same two actions.

## 4 pm roast texts

`netlify/functions/walk-reminder.ts` runs at **21:00 and 22:00 UTC**, checking that the local time is **16:00 America/Chicago**. That means one daily check at 4 pm Central, including daylight saving changes. If you literally want fixed CST year-round, change the reminder time zone to `Etc/GMT+6` and schedule only 22:00 UTC.

If no walk is logged, each of `CLARK` and `ANGIE` gets the day's message from the **80-message** library in [`server/roasts.ts`](server/roasts.ts). Messages rotate deterministically with no repeat for 80 days. Each is ASCII and under 160 characters including sender and opt-out text. Textbelt handles STOP replies.

Per-day, per-recipient conditional claims prevent duplicate sends, including concurrent scheduled runs. The handler rechecks for a walk before each send. Textbelt has no idempotency key, so an ambiguous timeout is marked `unknown` and is **not automatically resent**. Inspect function logs and the `reminder/YYYY-MM-DD/CLARK` or `ANGIE` blob if needed. `sent` means Textbelt accepted it, not a carrier delivery receipt. Missing configuration throws a clear function error without sending to either person. No live SMS is sent by tests.

Schedules run on published Netlify deployments, not your local preview. No phone numbers or API keys enter the browser or Git. Do not put secrets in `VITE_*` variables.

## Android

Download the APK from [GitHub Releases](https://github.com/superfunteam/walky/releases). Android 8.0+ is supported.

1. Open Walky. The service address defaults to `https://walky.wims.vc`.
2. Enter the same `WALKY_TOKEN` connection code.
3. Tap **Add widget**. Tap the widget once to log a walk. Tap its small wordmark to open the full app.

The native widget uses WorkManager to queue offline taps with the **original local date**, retry when connected, and refresh status periodically. A queued walk is explicitly marked pending; it isn't reported as server-saved before sync. The app wraps the three web views in a hardened HTTPS-only WebView. It does not cache the entire web app offline. The widget's shared status may lag until its next background refresh; Android can defer background work.

Build locally with JDK 17 and Android SDK 35:

```sh
cd android
./gradlew assembleDebug lintDebug
```

The initial release signing key is stored locally outside the repository in `~/.config/walky/`; keep a private backup. GitHub Actions signing secrets are configured. For a fresh fork, configure repository Actions secrets `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, and `ANDROID_KEY_PASSWORD`, then push a `v*` tag. `.github/workflows/release.yml` creates a GitHub Release with `walky.apk` and its SHA-256. Keep the same signing key for future versions; never commit a keystore. Release builds fail if signing credentials are absent. Normal CI uploads a debug APK as an Actions artifact.

## Local development & checks

```sh
cp .env.example .env
# Set WALKY_TOKEN. Leave phone numbers/key empty; set SMS_ENABLED=false.
npm ci
npm run dev
npm test
npm run build
```

The Netlify Vite plugin emulates Functions and Blobs locally at `http://localhost:3000`. Local data lives under ignored `.netlify/`. Start with empty real data; **Try a sample chain** is an explicitly labelled visual playground and never logs walks. Only the preferred home view uses localStorage.

API checks cover authentication, scoped keys, future/invalid dates, idempotency, undo, Central time, and reminder deduplication/failures. Android lint and compilation verify packaging; a physical device is still needed to verify launcher behavior and background timing. The paper rendering uses thin flat ribbon geometry, grain, rough materials, alternating linked bodies, joint constraints, drag impulses, and a folding animation. It is a lightweight visual paper approximation with rigid-body dynamics and surface flex, not a full sheet-material simulation. Only the latest visible links are drawn when the history grows; all walk days remain stored.

## A few easy ideas

- Put an NFC sticker by the front door that opens the private log URL.
- Keep the TRMNL next to the keys: a big passive yes/no is harder to forget.
- Use the widget as your normal input and the paper chain as the reward.
- A lap around the block counts. Missed days don't delete the chain.

## References

[Netlify Functions](https://docs.netlify.com/build/functions/overview/) · [Blobs and conditional writes](https://docs.netlify.com/build/data-and-storage/netlify-blobs/) · [UTC schedules](https://docs.netlify.com/snippets/functions/scheduled-functions/cron-expression-format/) · [Textbelt API](https://docs.textbelt.com/) · [TRMNL Private Plugins](https://help.trmnl.com/en/articles/9510536-private-plugins)

The supplied walking SVG is preserved in `public/walk.svg` and used on the main button and Android icon. Retain any attribution/license required by its original source when distributing the app.
