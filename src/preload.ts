import { contextBridge, ipcRenderer } from 'electron';

// --- Define the shape of the API exposed to the renderer ---
// This should match the functions exported by your IPC handlers.
export interface ExposedApi {
  // Example: Define functions that will call ipcRenderer.invoke
  // runAlgorithm: (params: AlgorithmParams) => Promise<AlgorithmResult>;
  // listDbFiles: () => Promise<string[]>;
  // deleteDbFile: (filename: string) => Promise<void>;
  // getDbFileContent: (filename: string) => Promise<DbFileContent>;

  // Example: Define functions for receiving events from the main process
  // onUpdateAvailable: (callback: () => void) => void;

  // 添加算法进度监听方法
  onAlgorithmProgress: (callback: (progress: any) => void) => () => void;
}

// --- Whitelist of channels ---
// Define the IPC channels that the renderer is allowed to invoke or listen on.
const allowedInvokeChannels: string[] = [
  'run-algorithm', // Matches handler name
  'list-db-files',
  'delete-db-file',
  'get-db-content',
];
const allowedReceiveChannels: string[] = [
  'algorithm-progress', // 添加算法进度通知频道
];

// --- Expose protected methods that allow the renderer process to use ---
// the ipcRenderer without exposing the entire object.
contextBridge.exposeInMainWorld(
  'electronAPI', // The name to expose the API under in window (e.g., window.electronAPI)
  {
    // 添加算法进度监听方法
    onAlgorithmProgress: (callback: (progress: any) => void) => {
      if (!allowedReceiveChannels.includes('algorithm-progress')) {
        console.error('Preload: algorithm-progress channel is not in allowedReceiveChannels');
        return () => { };
      }

      // 创建安全的监听器，移除事件对象
      const safeListener = (_event: Electron.IpcRendererEvent, progress: any) => callback(progress);
      ipcRenderer.on('algorithm-progress', safeListener);

      // 返回取消监听的函数
      return () => {
        ipcRenderer.removeListener('algorithm-progress', safeListener);
      };
    },
    // --- Invoke-based functions (Renderer -> Main -> Renderer) ---
    invoke: (channel: string, ...args: any[]) => {
      if (allowedInvokeChannels.includes(channel)) {
        return ipcRenderer.invoke(channel, ...args);
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
    on: (channel: string, listener: (...args: any[]) => void) => {
      if (allowedReceiveChannels.includes(channel)) {
        // Deliberately strip event as it includes `sender`
        const safeListener = (_event: Electron.IpcRendererEvent, ...args: any[]) => listener(...args);
        ipcRenderer.on(channel, safeListener);
        // Return a function to remove the listener
        return () => {
          ipcRenderer.removeListener(channel, safeListener);
        };
      } else {
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
  } satisfies Partial<ExposedApi> & { // Use Partial because we haven't defined the API methods yet
    invoke: (channel: string, ...args: any[]) => Promise<any>;
    on: (channel: string, listener: (...args: any[]) => void) => () => void;
    // Add send, removeListener etc. if defined above
  }
);

console.log('Preload script executed.');
