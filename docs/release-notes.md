Walky 0.2.0 — a little less chrome, a little more outside.

- The orange asterisk is now the app icon, with adaptive circle/squircle crops and Android 13+ themed icon support.
- Add widget and Connection are tucked into **App options** at the bottom.
- Four home views fit on a single row: Button, Calendar, Chain, and private Streaker challenges.
- Switching views keeps your calendar month and paper-chain zoom. The hidden scene pauses, and paper animation reuses its graphics buffers.
- Rotating the phone or opening Connection no longer rebuilds the current web view. Saving a changed connection still reconnects.
- Streaker has shared streak/checklist goals, rewards, progress, and confetti celebrations.
- The paper chain starts with three links, with closer framing, tilt, and pinch zoom.
- Home-screen widget: tap once to log today; see the shared status.
- Offline widget taps queue safely and sync when the phone reconnects.
- Long-press Walky's app icon for the "We walked" shortcut.

Install `walky.apk` over the previous release to keep your connection and queued walks. For a first install, enter `https://walky.wims.vc` (or `https://walky-app.netlify.app`) and your shared connection code. Choose **App options → Add home-screen widget** at the bottom.

Verified with Android compilation/lint, automated web tests, and browser checks at phone and desktop sizes. Physical launcher masks, phone sensors, and native menu interaction still need a device check.
