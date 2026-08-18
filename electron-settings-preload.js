'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('syncWatchServerSettings', Object.freeze({
  saveSettings(settings) {
    return ipcRenderer.invoke('syncwatch-server-settings:save-port', settings || {});
  },
  savePort(port) {
    return ipcRenderer.invoke('syncwatch-server-settings:save-port', { port });
  },
  close() {
    ipcRenderer.send('syncwatch-server-settings:close');
  }
}));
