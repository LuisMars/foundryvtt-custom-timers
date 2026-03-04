import { TimerManager } from "./timer-manager.mjs";
import { SocketHandler } from "./socket-handler.mjs";

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;

export class TimerApp extends HandlebarsApplicationMixin(ApplicationV2) {

  #tickInterval = null;
  #firedReminders = new Set(); // "timerId-index" keys, in-memory only

  static DEFAULT_OPTIONS = {
    id: "custom-timers-app",
    classes: ["custom-timers"],
    tag: "div",
    window: {
      frame: true,
      positioned: true,
      title: "Custom Timers",
      icon: "fa-solid fa-stopwatch",
      resizable: true,
      minimizable: true,
    },
    position: { width: 380, height: "auto" },
    actions: {
      createTimer:  TimerApp._onCreate,
      startTimer:   TimerApp._onStart,
      pauseTimer:   TimerApp._onPause,
      resetTimer:   TimerApp._onReset,
      deleteTimer:  TimerApp._onDelete,
      editTimer:    TimerApp._onEdit,
      exportTimers: TimerApp._onExport,
      importTimers: TimerApp._onImportClick,
      startAll:     TimerApp._onStartAll,
      pauseAll:     TimerApp._onPauseAll,
      resetAll:     TimerApp._onResetAll,
      deleteAll:      TimerApp._onDeleteAll,
      duplicateTimer: TimerApp._onDuplicate,
      chatTimer:    TimerApp._onChatTimer,
    },
  };

  static PARTS = {
    main: { template: "modules/custom-timers/templates/timer-app.hbs" },
  };

  async _prepareContext(options = {}) {
    const context = await super._prepareContext(options);
    const rawTimers = TimerManager.getVisibleTimers();

    const timers = rawTimers.map(t => {
      const secs = TimerManager.computeCurrentSeconds(t);
      return {
        ...t,
        displayTime: TimerManager.formatTime(secs),
        isRunning:   t.state === "running",
        isPaused:    t.state === "paused",
        isStopped:   t.state === "stopped",
        isExpired:   t.state === "expired",
        isGM:        game.user.isGM,
        progressPct: (t.mode === "countdown" && t.duration > 0)
          ? Math.round((secs / t.duration) * 100)
          : null,
      };
    });

    return { ...context, timers, isGM: game.user.isGM, hasTimers: timers.length > 0 };
  }

  _onFirstRender(context, options) {
    super._onFirstRender?.(context, options);
    this._startTick();
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    const fileInput = this.element.querySelector("#ct-import-file");
    if (fileInput) {
      fileInput.addEventListener("change", (e) => this._handleImportFile(e));
    }
  }

  _onClose(options) {
    this._stopTick();
    super._onClose?.(options);
  }

  _startTick() {
    this._stopTick();
    this.#tickInterval = setInterval(async () => {
      const timers = TimerManager.getVisibleTimers();
      const anyRunning = timers.some(t => t.state === "running");

      if (anyRunning) {
        // Only the active GM checks for expiry to avoid duplicate writes
        // Reminders: run on all clients, getVisibleTimers() already hides gmOnly from players
        for (const t of timers) {
          if (t.state === "running" && t.mode === "countdown" && t.reminders?.length) {
            const remaining = TimerManager.computeCurrentSeconds(t);
            t.reminders.forEach((r, i) => {
              const key = `${t.id}-${i}`;
              if (this.#firedReminders.has(key)) return;
              if (remaining <= r.value && remaining > 0) {
                this.#firedReminders.add(key);
                const msg = t.description ? `${t.name}: ${t.description}` : t.name;
                ui.notifications.info(msg);
              }
            });
          }
        }

        // Expiry: GM only (writes world settings)
        if (game.user.isGM && game.users.activeGM?.isSelf) {
          for (const t of timers) {
            if (t.state === "running" && t.mode === "countdown") {
              if (TimerManager.computeCurrentSeconds(t) <= 0) {
                await TimerManager.updateTimer(t.id, { state: "expired", elapsed: t.duration, startedAt: null });
                SocketHandler.broadcastUpdate();
                const msg = t.description ? `${t.name}: ${t.description}` : t.name;
                ui.notifications.warn(msg);
                if (t.postOnComplete !== false) {
                  const content = `
                    <div class="ct-chat-timer">
                      <strong>${t.name}</strong>
                      ${t.description ? `<div class="ct-chat-desc">${t.description}</div>` : ""}
                    </div>`;
                  await ChatMessage.create({ content, speaker: ChatMessage.getSpeaker() });
                }
              }
            }
          } // end for
        }
        this.render({ force: false });
      }
    }, 1000);
  }

  _stopTick() {
    if (this.#tickInterval) {
      clearInterval(this.#tickInterval);
      this.#tickInterval = null;
    }
  }

  async _handleImportFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const ok = await TimerManager.importTimers(text);
    if (ok) SocketHandler.broadcastUpdate();
    event.target.value = "";
  }

  // --- Action handlers ---

  static _reminderFields(reminders = []) {
    return [0, 1, 2].map(i => {
      const r    = reminders[i] ?? null;
      const on   = !!r;
      const secs = r?.value ?? 0;
      const h = Math.floor(secs / 3600);
      const m = Math.floor((secs % 3600) / 60);
      const s = secs % 60;
      return `
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
          <input name="r${i}_on" type="checkbox" ${on ? "checked" : ""} style="width:auto;" />
          <input name="r${i}_h" type="number" value="${h}" min="0" style="width:50px;" />h
          <input name="r${i}_m" type="number" value="${m}" min="0" max="59" style="width:50px;" />m
          <input name="r${i}_s" type="number" value="${s}" min="0" max="59" style="width:50px;" />s
          <span style="opacity:0.6;font-size:0.85em;">before end</span>
        </div>`;
    }).join("");
  }

  static _parseReminderFields(f) {
    return [0, 1, 2].map(i => {
      if (!f[`r${i}_on`]?.checked) return null;
      const secs = (Number(f[`r${i}_h`]?.value) || 0) * 3600
                 + (Number(f[`r${i}_m`]?.value) || 0) * 60
                 + (Number(f[`r${i}_s`]?.value) || 0);
      return secs > 0 ? { type: "time", value: secs } : null;
    }).filter(Boolean);
  }

  static _hmsFields(totalSeconds = 0) {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `
      <div class="form-group">
        <label>Duration</label>
        <div style="display:flex;gap:6px;align-items:center;">
          <input name="dur_h" type="number" value="${h}" min="0" style="width:60px;" />
          <span>h</span>
          <input name="dur_m" type="number" value="${m}" min="0" max="59" style="width:60px;" />
          <span>m</span>
          <input name="dur_s" type="number" value="${s}" min="0" max="59" style="width:60px;" />
          <span>s</span>
        </div>
      </div>`;
  }

  static _parseDuration(f) {
    const h = Number(f.dur_h?.value) || 0;
    const m = Number(f.dur_m?.value) || 0;
    const s = Number(f.dur_s?.value) || 0;
    return (h * 3600) + (m * 60) + s || 60;
  }

  static async _onCreate(event, target) {
    const result = await DialogV2.prompt({
      window: { title: "New Timer" },
      content: `
        <fieldset>
          <div class="form-group">
            <label>Name</label>
            <input name="name" type="text" value="New Timer" autofocus />
          </div>
          <div class="form-group">
            <label>Description</label>
            <input name="description" type="text" placeholder="Optional text shown to players" />
          </div>
          <div class="form-group">
            <label>Mode</label>
            <select name="mode">
              <option value="countdown">Countdown</option>
              <option value="countup">Count Up</option>
            </select>
          </div>
          ${TimerApp._hmsFields(60)}
          <div class="form-group">
            <label>GM Only (hidden from players)</label>
            <input name="gmOnly" type="checkbox" />
          </div>
          <div class="form-group">
            <label>Post to chat when completed</label>
            <input name="postOnComplete" type="checkbox" checked />
          </div>
          <div class="form-group" style="flex-direction:column;align-items:flex-start;">
            <label style="margin-bottom:4px;">Reminders</label>
            ${TimerApp._reminderFields([])}
          </div>
        </fieldset>
      `,
      ok: {
        label: "Create",
        callback: (event, button) => {
          const f = button.form.elements;
          return {
            name:            f.name.value.trim() || "New Timer",
            description:     f.description.value.trim(),
            mode:            f.mode.value,
            duration:        TimerApp._parseDuration(f),
            gmOnly:          f.gmOnly.checked,
            postOnComplete:  f.postOnComplete.checked,
            reminders:       TimerApp._parseReminderFields(f),
          };
        },
      },
      rejectClose: false,
    });
    if (!result) return;
    await TimerManager.createTimer(result);
    SocketHandler.broadcastUpdate();
  }

  static async _onStart(event, target) {
    const id = target.closest("[data-timer-id]").dataset.timerId;
    await TimerManager.startTimer(id);
    SocketHandler.broadcastUpdate();
  }

  _clearFiredReminders(id) {
    for (const key of this.#firedReminders) {
      if (key.startsWith(id)) this.#firedReminders.delete(key);
    }
  }

  static async _onPause(event, target) {
    const id = target.closest("[data-timer-id]").dataset.timerId;
    await TimerManager.pauseTimer(id);
    SocketHandler.broadcastUpdate();
  }

  static async _onReset(event, target) {
    const id = target.closest("[data-timer-id]").dataset.timerId;
    foundry.applications.instances.get("custom-timers-app")?._clearFiredReminders(id);
    await TimerManager.resetTimer(id);
    SocketHandler.broadcastUpdate();
  }

  static async _onDelete(event, target) {
    const id = target.closest("[data-timer-id]").dataset.timerId;
    const confirmed = await DialogV2.confirm({
      content: "Delete this timer? This cannot be undone.",
      rejectClose: false,
    });
    if (!confirmed) return;
    await TimerManager.deleteTimer(id);
    SocketHandler.broadcastUpdate();
  }

  static async _onEdit(event, target) {
    const id = target.closest("[data-timer-id]").dataset.timerId;
    const timer = TimerManager.getAllTimers().find(t => t.id === id);
    if (!timer) return;

    const result = await DialogV2.prompt({
      window: { title: `Edit: ${timer.name}` },
      content: `
        <fieldset>
          <div class="form-group">
            <label>Name</label>
            <input name="name" type="text" value="${timer.name}" autofocus />
          </div>
          <div class="form-group">
            <label>Description</label>
            <input name="description" type="text" value="${timer.description}" />
          </div>
          ${TimerApp._hmsFields(timer.duration)}
          <div class="form-group">
            <label>GM Only</label>
            <input name="gmOnly" type="checkbox" ${timer.gmOnly ? "checked" : ""} />
          </div>
          <div class="form-group">
            <label>Post to chat when completed</label>
            <input name="postOnComplete" type="checkbox" ${timer.postOnComplete !== false ? "checked" : ""} />
          </div>
          <div class="form-group" style="flex-direction:column;align-items:flex-start;">
            <label style="margin-bottom:4px;">Reminders</label>
            ${TimerApp._reminderFields(timer.reminders)}
          </div>
        </fieldset>
      `,
      ok: {
        label: "Save",
        callback: (event, button) => {
          const f = button.form.elements;
          return {
            name:           f.name.value.trim() || timer.name,
            description:    f.description.value.trim(),
            duration:       TimerApp._parseDuration(f),
            gmOnly:         f.gmOnly.checked,
            postOnComplete: f.postOnComplete.checked,
            reminders:      TimerApp._parseReminderFields(f),
          };
        },
      },
      rejectClose: false,
    });
    if (!result) return;
    await TimerManager.updateTimer(id, result);
    SocketHandler.broadcastUpdate();
  }

  static async _onStartAll(event, target) {
    const timers = TimerManager.getAllTimers();
    for (const t of timers) {
      if (t.state === "stopped" || t.state === "paused") await TimerManager.startTimer(t.id);
    }
    SocketHandler.broadcastUpdate();
  }

  static async _onPauseAll(event, target) {
    const timers = TimerManager.getAllTimers();
    for (const t of timers) {
      if (t.state === "running") await TimerManager.pauseTimer(t.id);
    }
    SocketHandler.broadcastUpdate();
  }

  static async _onResetAll(event, target) {
    const timers = TimerManager.getAllTimers();
    for (const t of timers) await TimerManager.resetTimer(t.id);
    SocketHandler.broadcastUpdate();
  }

  static async _onDuplicate(event, target) {
    const id = target.closest("[data-timer-id]").dataset.timerId;
    const timer = TimerManager.getAllTimers().find(t => t.id === id);
    if (!timer) return;
    await TimerManager.createTimer({
      name:           `${timer.name} (copy)`,
      description:    timer.description,
      mode:           timer.mode,
      duration:       timer.duration,
      gmOnly:         timer.gmOnly,
      postOnComplete: timer.postOnComplete,
    });
    SocketHandler.broadcastUpdate();
  }

  static async _onDeleteAll(event, target) {
    const confirmed = await DialogV2.confirm({
      content: "Delete <strong>all</strong> timers? This cannot be undone.",
      rejectClose: false,
    });
    if (!confirmed) return;
    await TimerManager.saveTimers([]);
    SocketHandler.broadcastUpdate();
  }

  static async _onChatTimer(event, target) {
    const id = target.closest("[data-timer-id]").dataset.timerId;
    const timer = TimerManager.getAllTimers().find(t => t.id === id);
    if (!timer) return;

    const secs = TimerManager.computeCurrentSeconds(timer);
    const timeDisplay = TimerManager.formatTime(secs);
    const stateLabel = { running: "Running", paused: "Paused", stopped: "Stopped", expired: "Expired" }[timer.state] ?? timer.state;
    const modeLabel = timer.mode === "countdown" ? `${timeDisplay} remaining` : `${timeDisplay} elapsed`;

    const content = `
      <div class="ct-chat-timer">
        <strong><i class="fa-solid fa-stopwatch"></i> ${timer.name}</strong>
        ${timer.description ? `<div class="ct-chat-desc">${timer.description}</div>` : ""}
        <div class="ct-chat-time">${modeLabel}</div>
        <div class="ct-chat-state">${stateLabel}</div>
      </div>`;

    await ChatMessage.create({ content, speaker: ChatMessage.getSpeaker() });
  }

  static _onExport(event, target) {
    TimerManager.exportTimers();
  }

  static _onImportClick(event, target) {
    const app = foundry.applications.instances.get("custom-timers-app");
    app?.element?.querySelector("#ct-import-file")?.click();
  }
}
