import { app, shell, BrowserWindow, nativeTheme } from 'electron'
import path from 'path'
import { APP_NAME, APP_ID } from '@shared/appInfo'
import { registerIpcHandlers, disposeIpc, applyActiveProfile } from './ipc'

// Set the app name as early as possible so every process (main + renderer/GPU/
// utility helpers) is labelled "Coal Clone" — not "Electron" — in the OS task
// manager. Single source of truth: @shared/appInfo.
app.setName(APP_NAME)

// Electron main process: app lifecycle + the single BrowserWindow.
// All git work happens here (via ipc -> gitService); the renderer is sandboxed.

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: '#12141a',
    // Window/taskbar icon in dev (packaged builds use the exe icon from build/icon.png).
    icon: path.join(process.cwd(), 'build/icon.png'),
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    autoHideMenuBar: true,
    webPreferences: {
      // electron-vite emits the preload as .mjs under "type": "module".
      preload: path.join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.on('ready-to-show', () => win.show())

  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // electron-vite injects ELECTRON_RENDERER_URL in dev; load the built file in prod.
  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  app.setAppUserModelId(APP_ID)
  // The app is dark-only. `color-scheme: dark` in CSS doesn't reach the widgets
  // Chromium draws outside the page — <select> popups, native dialogs — so on a
  // light-themed OS those flash up white in the middle of the dark UI.
  nativeTheme.themeSource = 'dark'
  registerIpcHandlers()
  // Load the active profile's SSH key before any git call can happen.
  void applyActiveProfile()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  void disposeIpc()
})
