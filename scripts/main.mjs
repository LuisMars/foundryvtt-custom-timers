import { TimerManager } from "./timer-manager.mjs";
import { TimerApp } from "./timer-app.mjs";
import { SocketHandler } from "./socket-handler.mjs";

// Expose for macros and browser console debugging
globalThis.CustomTimers = { TimerManager, TimerApp, SocketHandler };

Hooks.once("init", () => {
  TimerManager.registerSettings();
  console.log("Custom Timers | Initialized");
});

Hooks.once("ready", () => {
  SocketHandler.register();

  // Non-GM players request latest state when they connect
  if (!game.user.isGM) {
    setTimeout(() => SocketHandler.requestSync(), 500);
  }

  console.log("Custom Timers | Ready");
});

// v13: controls is an OBJECT, not an array
Hooks.on("getSceneControlButtons", (controls) => {
  if (!controls.tokens) return;
  controls.tokens.tools.customTimers = {
    name: "customTimers",
    title: "Custom Timers",
    icon: "fa-solid fa-stopwatch",
    order: 100,
    button: true,
    // button:true tools use onClick; onChange is provided as fallback
    onChange: () => {
      try {
        const existing = foundry.applications.instances.get("custom-timers-app");
        if (existing) existing.close();
        else new TimerApp().render({ force: true });
      } catch(e) {
        console.error("Custom Timers | error opening app:", e);
        ui.notifications.error("Custom Timers error — check console (F12)");
      }
    },
  };
});
