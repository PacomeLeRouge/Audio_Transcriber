/**
 * Preload script to expose secure IPC communication between main and renderer processes.
 * Licensed under MIT License.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  selectFile: () => ipcRenderer.invoke('select-file'),
  processAudio: (filePath) => ipcRenderer.invoke('process-audio', filePath),
  onTranscriptionProgress: (callback) => 
    ipcRenderer.on('transcription-progress', (event, value) => callback(value))
});
