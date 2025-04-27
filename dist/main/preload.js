"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
// --- Whitelist of channels ---
// Define the IPC channels that the renderer is allowed to invoke or listen on.
const allowedInvokeChannels = [
    'run-algorithm', // Matches handler name
    'list-db-files',
    'delete-db-file',
    'get-db-content',
];
const allowedReceiveChannels = [
    'algorithm-progress', // 添加算法进度通知频道
];
// --- Expose protected methods that allow the renderer process to use ---
// the ipcRenderer without exposing the entire object.
electron_1.contextBridge.exposeInMainWorld('electronAPI', // The name to expose the API under in window (e.g., window.electronAPI)
{
    // 添加算法进度监听方法
    onAlgorithmProgress: (callback) => {
        if (!allowedReceiveChannels.includes('algorithm-progress')) {
            console.error('Preload: algorithm-progress channel is not in allowedReceiveChannels');
            return () => { };
        }
        // 创建安全的监听器，移除事件对象
        const safeListener = (_event, progress) => callback(progress);
        electron_1.ipcRenderer.on('algorithm-progress', safeListener);
        // 返回取消监听的函数
        return () => {
            electron_1.ipcRenderer.removeListener('algorithm-progress', safeListener);
        };
    },
    // --- Invoke-based functions (Renderer -> Main -> Renderer) ---
    invoke: (channel, ...args) => {
        if (allowedInvokeChannels.includes(channel)) {
            return electron_1.ipcRenderer.invoke(channel, ...args);
        }
        console.error(`Preload: Attempted to invoke unauthorized channel "${channel}"`);
        // Handle error appropriately, maybe throw an error or return a rejected promise
        return Promise.reject(new Error(`Unauthorized channel: ${channel}`));
    },
    // --- Send-based functions (Renderer -> Main) ---
    // Example: Use this for one-way communication if needed
    // send: (channel: string, ...args: any[]) => {
    //   if (allowedSendChannels.includes(channel)) {
    //     ipcRenderer.send(channel, ...args);
    //   } else {
    //      console.error(...);
    //   }
    // },
    // --- Receive-based functions (Main -> Renderer) ---
    // Use this to subscribe to events from the main process
    on: (channel, listener) => {
        if (allowedReceiveChannels.includes(channel)) {
            // Deliberately strip event as it includes `sender`
            const safeListener = (_event, ...args) => listener(...args);
            electron_1.ipcRenderer.on(channel, safeListener);
            // Return a function to remove the listener
            return () => {
                electron_1.ipcRenderer.removeListener(channel, safeListener);
            };
        }
        else {
            console.error(`Preload: Attempted to listen on unauthorized channel "${channel}"`);
            // Return a no-op function or handle error
            return () => { };
        }
    },
    // --- Unsubscribe function for specific listeners (if needed) ---
    // removeListener: (channel: string, listener: (...args: any[]) => void) => {
    //   if (allowedReceiveChannels.includes(channel)) {
    //     ipcRenderer.removeListener(channel, listener);
    //   } else {
    //     console.error(...);
    //   }
    // },
    // --- Unsubscribe all listeners for a channel (if needed) ---
    // removeAllListeners: (channel: string) => {
    //   if (allowedReceiveChannels.includes(channel)) {
    //     ipcRenderer.removeAllListeners(channel);
    //   } else {
    //     console.error(...);
    //   }
    // }
});
console.log('Preload script executed.');
