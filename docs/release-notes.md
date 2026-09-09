Walky 0.3.0 — a little button, a bigger picture.

- New **1×1 WALK button**: solid green, white walking icon, and WALK label. One tap logs today.
- A clock means the walk is queued on your phone; a check means it is confirmed. It still logs the current local day if Android has not refreshed yesterday’s checkmark. Repeated taps count once.
- The existing **large widget** now shows your shared streak, walks this week, and total walk days. It stays resizable and keeps its place on your home screen when you upgrade.
- Both widgets update together. Offline taps keep their original local date; pending walks do not inflate the stats.
- Choose **Add small WALK button** or **Add large stats widget** from **App options** at the bottom, or find both in your launcher’s widget picker.
- Includes the orange adaptive asterisk app icon and all four home views: Button, Calendar, Chain, and private Streaker challenges.

Install `walky.apk` over your current version to keep your connection, existing widget, and queued walks. The small widget requests one launcher cell each way; its exact outer size depends on your launcher.

Verified with Android build/lint, eight native Robolectric tests (including Android 8/15 layout rendering and actual widget click dispatch), and 24 web tests plus a production web build. Rendered the compact button at small portrait/landscape bounds and reviewed native previews. A physical phone/launcher check remains.
