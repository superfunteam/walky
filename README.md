# walky ✳

One couple. One daily yes. **https://walky.wims.vc**

A Netlify-hosted web app and service, plus a small Android APK with a native one-tap widget. A big button, an editable monthly calendar, an interactive Three.js paper chain, and a private Streaker challenge view share the same data. No GPS, distance, individual scores, or accounts.

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

## Streaker & rewards

Connected browsers get a **Streaker** tab. Choose **A new deal**, name the reward, and pick:

- **Daily streak:** 1–365 consecutive walking days, beginning today. Today's existing walk counts; earlier walks do not. Missing a day resets the current run. Completing the target unlocks the reward even if you later miss a day.
- **Walk checklist:** 1–30 named walks, such as Mall walk, Lakeside park after dark, and three separate Any walk entries. Checking an item also logs today on the shared calendar. Multiple checklist walks on the same day still make one daily calendar check-in. Unchecking an item leaves the day's walk in place.

Both phones share progress. Finishing a challenge opens a celebration with confetti; each browser can enjoy it once. **Collect our reward** keeps the completed deal in your history. Removing a challenge preserves calendar walks. Correcting a qualifying walk or checklist item can relock an uncollected reward; collected rewards stay collected. The app supports up to 20 uncollected challenges at once.

Challenge data is server-authorized and hidden without the connection code. Existing calendar and logging keys cannot read rewards. No reward text is saved in localStorage; only celebration acknowledgments are stored there.

Copy **Settings → Next reward feed** for a separately scoped read-only URL:

```text
GET https://walky.wims.vc/api/rewards/next?key=YOUR_REWARD_KEY
```

The response is `{ "nextReward": null }` when none exists. Otherwise it includes the reward name, kind, progress, target, remaining count, unlock status, and remaining checklist walk names. Earned but uncollected rewards come first, then the closest challenge by completion percentage, with the oldest winning ties. This URL reveals the next private reward to anyone holding it, so only share it with your chosen integration. The connection code also works as a Bearer token.

Owner-authenticated challenge routes (cookie or Bearer connection code):

| Method | Route | Action |
| --- | --- | --- |
| GET / POST | `/api/challenges` | Read all deals / create one. |
| POST / DELETE | `/api/challenges/{id}/items/{itemId}` | Check / uncheck a named walk. |
| POST | `/api/challenges/{id}/claim` | Collect an unlocked reward. |
| DELETE | `/api/challenges/{id}` | Retire a deal without removing walks. |

Creation accepts `{ "kind": "streak", "reward": "A week off dishes", "target": 7 }` or `{ "kind": "checklist", "reward": "Date night", "items": ["Mall walk", "Any walk", "Any walk"] }`. Supply an optional UUID `id` to safely retry creation. All reward responses use `Cache-Control: no-store`.

## MCP

Streamable HTTP at `https://walky.wims.vc/mcp`, authenticated with `Authorization: Bearer WALKY_TOKEN`.

- `walk_status`: read current status and history.
- `log_walk`: idempotently record today.
- `next_reward`: read the next private reward and progress, or null.

The official MCP TypeScript SDK handles protocol negotiation and request validation. Compatible clients must support custom Bearer authentication (there is no OAuth discovery flow). The browser also feature-detects the experimental WebMCP API and exposes the same three actions, each requiring a connected session.

## 4 pm roast texts

`netlify/functions/walk-reminder.ts` runs at **21:00 and 22:00 UTC**, checking that the local time is **16:00 America/Chicago**. That means one daily check at 4 pm Central, including daylight saving changes. If you literally want fixed CST year-round, change the reminder time zone to `Etc/GMT+6` and schedule only 22:00 UTC.

If no walk is logged, each of `CLARK` and `ANGIE` gets the day's message from the **80-message** library in [`server/roasts.ts`](server/roasts.ts). Messages rotate deterministically with no repeat for 80 days. Each is ASCII and under 160 characters including sender and opt-out text. Textbelt handles STOP replies.

Per-day, per-recipient conditional claims prevent duplicate sends, including concurrent scheduled runs. The handler rechecks for a walk before each send. Textbelt has no idempotency key, so an ambiguous timeout is marked `unknown` and is **not automatically resent**. Inspect function logs and the `reminder/YYYY-MM-DD/CLARK` or `ANGIE` blob if needed. `sent` means Textbelt accepted it, not a carrier delivery receipt. Missing configuration throws a clear function error without sending to either person. No live SMS is sent by tests.

Schedules run on published Netlify deployments, not your local preview. No phone numbers or API keys enter the browser or Git. Do not put secrets in `VITE_*` variables.

## Android

Download the APK from [GitHub Releases](https://github.com/superfunteam/walky/releases). Android 8.0+ is supported.

1. Open Walky. The service address defaults to `https://walky.wims.vc`.
2. Enter the same `WALKY_TOKEN` connection code.
3. At the bottom, open **App options** and choose **Add small WALK button** (1×1) or **Add large stats widget** (3×2, resizable). Both are also listed in your launcher’s widget picker. **Connection** is in the same menu.

The small widget is a solid green button with a white walking icon and **WALK** label. Tap once to log today. Its icon becomes a clock while queued and a check after confirmation. It always logs the current local day when tapped, even if Android has not refreshed yesterday’s checkmark yet; repeated taps count once. The large widget adds your shared current streak, walks this Monday–Sunday week, and total walk days. Tap its wordmark to open the full app. Both widgets update together. Existing large widgets stay in place when upgrading.

Stats use cached, confirmed dates and recalculate for the current local day when the widget refreshes. Pending taps do not inflate the counts. An em dash means the first sync has not completed. The small widget requests one launcher cell in each direction; the actual cell proportions and outer padding depend on your launcher.

The orange asterisk launcher icon has separate adaptive background/foreground layers and an Android 13+ monochrome layer. The artwork stays inside the 66dp safe circle of the 108dp foreground, so launcher masks can crop the background without clipping the asterisk. A vector fallback covers legacy icon consumers. The browser favicon uses the same mark.

Opening Connection keeps the current page alive. Saving the same settings does not reload it; changing the service or connection code reconnects. Rotation and screen-size changes resize the WebView without recreating it.

The native widget uses WorkManager to queue offline taps with the **original local date**, retry when connected, and refresh status periodically. A queued walk is explicitly marked pending; it isn't reported as server-saved before sync. The app wraps the web views in a hardened HTTPS-only WebView. It does not cache the entire web app offline. The widget's shared status may lag until its next background refresh; Android can defer background work.

Build locally with JDK 17 and Android SDK 35:

```sh
cd android
./gradlew assembleDebug lintDebug testDebugUnitTest
```

Native Robolectric tests cover both RemoteViews layouts on Android 8 and 15, one-tap routing, shared queued/confirmed updates, minimum widget bounds, upgrade state, stale checkmark taps, and day/week rollover. They render sample-data PNGs in `android/app/build/widget-previews/` for visual review; `large-ready.png` and `small-ready.png` also supply the older-launcher picker previews in `res/drawable-nodpi/`.

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

The Netlify Vite plugin emulates Functions and Blobs locally at `http://localhost:3000`. Local data lives under ignored `.netlify/`. The paper chain starts with three free links and adds one per logged walk. Starter links do not count as walks or affect streaks or reminders. **Try a sample chain** is an explicitly labelled visual playground and never logs walks. The preferred home view and opaque celebration acknowledgments use localStorage.

API checks cover authentication, scoped keys, future/invalid dates, idempotency, undo, Central time, reminder deduplication/failures, private challenge access, streak resets, checklist retries, and reward collection. Android lint and compilation verify packaging; a physical device is still needed to verify launcher behavior and background timing. The paper rendering uses thin flat ribbon geometry, grain, rough materials, alternating linked bodies, joint constraints, drag impulses, and a folding animation. It is a lightweight visual paper approximation with rigid-body dynamics and surface flex, not a full sheet-material simulation. Only the latest visible links are drawn when the history grows; all walk days remain stored.

The camera frames the current chain closely. Pinch inside the scene to zoom from 65% to 300%, or use the +/− buttons; tap the percentage to reset. Mac trackpad pinches and Ctrl+wheel also zoom the scene. Normal scrolling and browser zoom outside the scene retain their usual behavior.

Tap **Enable tilt** on a phone and grant motion access if prompted. The first sensor reading calibrates a comfortable holding position, and rotating between portrait and landscape recalibrates. Tilting changes the chain's gravity with smoothing. On Macs, the same control enables pointer tilt over the scene. Missing or denied sensors fall back to dragging and Breeze. Motion is opt-in for each scene visit, and reduced-motion settings reduce its strength. Sensor permissions, null data, cancellation, pinch limits, and axis changes have automated coverage; physical-phone motion and native trackpad pinch still need device testing.

The home navigation stays in a single row on phones. Visited views remain mounted, preserving the calendar month, challenge drafts, and chain zoom. Scene modules warm during idle time; the chain's animation loop stops while its tab or document is hidden, and resumes without simulating the time spent away. Paper folding updates reusable GPU buffers instead of allocating new geometry on every frame. Mobile rendering uses a lower pixel ratio and shadow-map size.

## A few easy ideas

- Put an NFC sticker by the front door that opens the private log URL.
- Keep the TRMNL next to the keys: a big passive yes/no is harder to forget.
- Use the widget as your normal input and the paper chain as the reward.
- A lap around the block counts. Missed days don't delete the chain.

## References

[Netlify Functions](https://docs.netlify.com/build/functions/overview/) · [Blobs and conditional writes](https://docs.netlify.com/build/data-and-storage/netlify-blobs/) · [UTC schedules](https://docs.netlify.com/snippets/functions/scheduled-functions/cron-expression-format/) · [Textbelt API](https://docs.textbelt.com/) · [TRMNL Private Plugins](https://help.trmnl.com/en/articles/9510536-private-plugins)

The supplied walking SVG is preserved in `public/walk.svg` and used on the main button and Android walk shortcut. Retain any attribution/license required by its original source when distributing the app.
