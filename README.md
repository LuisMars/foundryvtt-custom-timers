# Custom Timers

A FoundryVTT module for running multiple simultaneous timers with GM controls, player visibility, chat integration, reminders, and real-time sync across all clients.

![Foundry v13+](https://img.shields.io/badge/Foundry-v13%2B-informational)

---

## Features

- **Multiple timers at once** — create and run as many timers as needed, each independently controlled.
- **Countdown and count-up modes** — track time remaining or time elapsed.
- **GM-only timers** — hide specific timers from players; they never appear in the player UI.
- **Post to chat on completion** — automatically posts a chat card when a countdown expires. GM-only timers whisper to GMs only.
- **Manual chat button** — post any timer's current state to chat at any time.
- **Reminders** — configure up to 3 per-timer notifications that fire at set times before a countdown ends.
- **Bulk controls** — start, pause, reset, or delete all timers at once from the toolbar.
- **Duplicate** — copy an existing timer as a starting point.
- **Import / Export** — save and load timers as JSON for reuse across sessions.
- **Real-time sync** — all connected clients see timer state updates instantly via sockets.

## Installation

In Foundry, go to **Add-on Modules → Install Module** and paste the manifest URL:

```
https://github.com/LuisMars/foundryvtt-custom-timers/releases/latest/download/module.json
```

## Usage

1. Click the stopwatch icon in the scene controls toolbar to open the timer panel.
2. Click **New Timer** to create a timer — set its name, mode, duration, and optional reminders.
3. Use the per-timer controls to start, pause, reset, duplicate, edit, or delete.
4. Players see all non-GM-only timers in their own panel (read-only).
5. When a countdown expires, a notification fires and (if enabled) a chat card is posted.

## Compatibility

| Foundry Version | Status |
|---|---|
| v13 | Verified (13.351) |
| v12 and below | Not supported |

## License

MIT
