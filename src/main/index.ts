import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import url from 'url';

console.log('--- Main Process Started ---');

let mainWindow: BrowserWindow | null = null;
// Revert to using app.isPackaged for reliable runtime check
const isDev = !app.isPackaged;
console.log(`isDev environment (based on !app.isPackaged): ${isDev}`);

let rendererLoadPath: string;

if (isDev) {
  rendererLoadPath = 'http://localhost:5173'; // Vite dev server
} else {
  // Production: Construct absolute path to index.html within the packaged app
  const appPath = app.getAppPath();
  // Ensure this path points correctly inside the packaged app structure
  rendererLoadPath = path.join(appPath, 'dist/renderer/index.html');
  console.log(`Production App Path: ${appPath}`);
  console.log(`Production Index Path: ${rendererLoadPath}`);
}
// Convert file path to file:// URL for loadURL in production
// Always use loadURL, it handles both http and file protocols
const rendererUrl = isDev ? rendererLoadPath : url.format({
  pathname: rendererLoadPath,
  protocol: 'file:',
  slashes: true,
});
console.log(`Attempting to load URL: ${rendererUrl}`);


function createWindow() {
  console.log('createWindow() called');
  try {
    mainWindow = new BrowserWindow({
      width: 1000,
      height: 800,
      webPreferences: {
        // Correct path relative to dist/main/main/index.js (__dirname) -> ../preload.js
        preload: path.join(__dirname, '../preload.js'),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false,
      },
    });
    console.log('BrowserWindow created');

    // Always use loadURL
    mainWindow.loadURL(rendererUrl)
      .then(() => {
        console.log(`URL loaded successfully: ${rendererUrl}`);
        // Open DevTools only in development mode
        if (isDev) {
          console.log('Opening DevTools for development...');
          mainWindow?.webContents.openDevTools();
        }
      })
      .catch(err => {
        // Log specific error for file protocol loading
        if (!isDev) {
          console.error(`Error loading file URL: ${rendererUrl}. Check path and permissions.`, err);
        } else {
          console.error(`Error loading dev URL: ${rendererUrl}`, err);
        }
      });

    // --- Event Listeners ---
    mainWindow.on('closed', () => {
      console.log('mainWindow closed event fired');
      mainWindow = null;
    });

    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
      // Log failures, especially for file URLs
      console.error(`WebContents did-fail-load: Code ${errorCode}, Desc: ${errorDescription}, URL: ${validatedURL}`);
      if (validatedURL.startsWith('file://')) {
        console.error('File load failed. Verify the file exists at the specified path inside the packaged app and that electron-builder includes it.');
      }
    });

    mainWindow.on('unresponsive', () => {
      console.warn('mainWindow became unresponsive');
    });

    mainWindow.webContents.on('render-process-gone', (event, details) => {
      console.error('webContents render-process-gone:', details);
    });

  } catch (error) {
    console.error('Error during createWindow:', error);
    mainWindow = null;
  }
}

// --- Register IPC Handlers ---
console.log('Importing IPC handlers...');
import './ipcHandlers/run-handler';
import './ipcHandlers/db-handler';
console.log('IPC handlers imported.');

// --- App Lifecycle Events ---
console.log('Setting up app lifecycle events...');

app.whenReady().then(() => {
  console.log('App is ready, calling createWindow...');
  createWindow();

  app.on('activate', () => {
    console.log('App activate event fired');
    if (BrowserWindow.getAllWindows().length === 0) {
      console.log('No windows open, calling createWindow again');
      createWindow();
    }
  });

}).catch(err => {
  console.error('Error during app.whenReady:', err);
});

app.on('window-all-closed', () => {
  console.log('App window-all-closed event fired');
  if (process.platform !== 'darwin') {
    console.log('Quitting app...');
    app.quit();
  }
});

process.on('uncaughtException', (error) => {
  console.error('Main Uncaught Exception:', error);
});
