const MODULE_ID = "custom-timers";
const SOCKET_NAME = `module.${MODULE_ID}`;

const MSG = {
  TIMER_UPDATE:  "TIMER_UPDATE",
  REQUEST_SYNC:  "REQUEST_SYNC",
  SYNC_RESPONSE: "SYNC_RESPONSE",
};

export class SocketHandler {

  static register() {
    game.socket.on(SOCKET_NAME, SocketHandler._onMessage);
  }

  static emit(type, payload = {}) {
    game.socket.emit(SOCKET_NAME, { type, payload });
  }

  static _onMessage({ type, payload }) {
    switch (type) {
      case MSG.TIMER_UPDATE:
        SocketHandler._handleUpdate();
        break;
      case MSG.REQUEST_SYNC:
        SocketHandler._handleSyncRequest(payload);
        break;
      case MSG.SYNC_RESPONSE:
        SocketHandler._handleSyncResponse(payload);
        break;
    }
  }

  static _handleUpdate() {
    const app = foundry.applications.instances.get("custom-timers-app");
    if (app) app.render({ force: true });
  }

  static _handleSyncRequest({ userId }) {
    if (!game.user.isGM) return;
    SocketHandler.emit(MSG.SYNC_RESPONSE, { targetUserId: userId });
  }

  static _handleSyncResponse({ targetUserId }) {
    if (game.user.id !== targetUserId) return;
    const app = foundry.applications.instances.get("custom-timers-app");
    if (app) app.render({ force: true });
  }

  // Call after every TimerManager write
  static broadcastUpdate() {
    SocketHandler.emit(MSG.TIMER_UPDATE);
  }

  // Non-GM players call this when opening the app
  static requestSync() {
    SocketHandler.emit(MSG.REQUEST_SYNC, { userId: game.user.id });
  }
}
