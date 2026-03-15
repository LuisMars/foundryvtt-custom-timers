const MODULE_ID = "custom-timers";
const SETTINGS_KEY = "timerData";

export class TimerManager {

  static registerSettings() {
    game.settings.register(MODULE_ID, SETTINGS_KEY, {
      name: "Timer Data",
      scope: "world",
      config: false,
      type: Array,
      default: [],
      onChange: () => {
        const app = foundry.applications.instances.get("custom-timers-app");
        if (app) app.render({ force: true });
      },
    });
  }

  static getAllTimers() {
    return game.settings.get(MODULE_ID, SETTINGS_KEY) ?? [];
  }

  static getVisibleTimers() {
    const all = TimerManager.getAllTimers();
    if (game.user.isGM) return all;
    return all.filter(t => !t.gmOnly);
  }

  static async saveTimers(timers) {
    if (!game.user.isGM) {
      ui.notifications.error("Only the GM can modify timers.");
      return;
    }
    await game.settings.set(MODULE_ID, SETTINGS_KEY, timers);
  }

  static async createTimer({ name, description, mode, duration, gmOnly, postOnComplete, reminders }) {
    const timers = TimerManager.getAllTimers();
    const timer = {
      id: foundry.utils.randomID(),
      name: name || "New Timer",
      description: description || "",
      mode: mode || "countdown",
      duration: Number(duration) || 60,
      elapsed: 0,
      startedAt: null,
      state: "stopped",
      gmOnly: Boolean(gmOnly),
      postOnComplete: postOnComplete !== false,
      reminders: Array.isArray(reminders) ? reminders : [],
      createdAt: Date.now(),
    };
    timers.push(timer);
    await TimerManager.saveTimers(timers);
    return timer;
  }

  static async updateTimer(id, changes) {
    const timers = TimerManager.getAllTimers();
    const idx = timers.findIndex(t => t.id === id);
    if (idx === -1) return null;
    timers[idx] = foundry.utils.mergeObject(timers[idx], changes, { inplace: false });
    await TimerManager.saveTimers(timers);
    return timers[idx];
  }

  static async deleteTimer(id) {
    const timers = TimerManager.getAllTimers().filter(t => t.id !== id);
    await TimerManager.saveTimers(timers);
  }

  static async startTimer(id) {
    const timer = TimerManager.getAllTimers().find(t => t.id === id);
    if (!timer || timer.state === "running" || timer.state === "expired") return;
    return TimerManager.updateTimer(id, { state: "running", startedAt: Date.now() });
  }

  static async pauseTimer(id) {
    const timer = TimerManager.getAllTimers().find(t => t.id === id);
    if (!timer || timer.state !== "running") return;
    const additionalElapsed = (Date.now() - timer.startedAt) / 1000;
    return TimerManager.updateTimer(id, {
      state: "paused",
      elapsed: timer.elapsed + additionalElapsed,
      startedAt: null,
    });
  }

  static async resetTimer(id) {
    return TimerManager.updateTimer(id, { state: "stopped", elapsed: 0, startedAt: null });
  }

  // Pure function — no side effects
  static computeCurrentSeconds(timer) {
    let elapsed = timer.elapsed;
    if (timer.state === "running" && timer.startedAt) {
      elapsed += (Date.now() - timer.startedAt) / 1000;
    }
    if (timer.mode === "countdown") return Math.max(0, timer.duration - elapsed);
    return elapsed;
  }

  static formatTime(totalSeconds) {
    const s = Math.floor(Math.abs(totalSeconds));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) {
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
    }
    return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }

  static exportTimers() {
    const timers = TimerManager.getAllTimers();
    const blob = new Blob([JSON.stringify(timers, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `custom-timers-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  static async importTimers(jsonString) {
    let imported;
    try {
      imported = JSON.parse(jsonString);
    } catch {
      ui.notifications.error("Invalid JSON file.");
      return false;
    }
    if (!Array.isArray(imported)) {
      ui.notifications.error("Expected an array of timers.");
      return false;
    }
    // Always assign new IDs so imports never overwrite existing timers
    const existing = TimerManager.getAllTimers();
    const fresh = imported
      .filter(t => t.name)
      .map(t => ({ ...t, id: foundry.utils.randomID(), createdAt: Date.now() }));
    await TimerManager.saveTimers([...existing, ...fresh]);
    ui.notifications.info(`Imported ${imported.length} timer(s).`);
    return true;
  }
}
