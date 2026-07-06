import { app, BrowserWindow, ipcMain, utilityProcess, type UtilityProcess } from "electron";
import { join } from "node:path";

let engineHost: UtilityProcess | null = null;
let win: BrowserWindow | null = null;
let reqId = 0;
const pending = new Map<number, (value: unknown) => void>();

function spawnEngineHost(): void {
  engineHost = utilityProcess.fork(join(__dirname, "engine-host.mjs"), [], {
    serviceName: "mn-engine-host",
  });
  engineHost.on("message", (msg: { id?: number; event?: string; payload?: unknown }) => {
    if (msg.id !== undefined && pending.has(msg.id)) {
      pending.get(msg.id)!(msg.payload);
      pending.delete(msg.id);
    } else if (msg.event) {
      win?.webContents.send(`engine:${msg.event}`, msg.payload);
    }
  });
  engineHost.on("exit", () => {
    engineHost = null; // a crash doesn't take down the app — it respawns on the next call
  });
}

function callEngine(method: string, params: unknown): Promise<unknown> {
  if (!engineHost) spawnEngineHost();
  const id = ++reqId;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    engineHost!.postMessage({ id, method, params });
  });
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1080,
    height: 720,
    minWidth: 880,
    minHeight: 600,
    title: "Mention Network",
    titleBarStyle: "hiddenInset",
    backgroundColor: "#f6f6f7",
    webPreferences: {
      preload: join(__dirname, "../preload/index.mjs"),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void win.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(() => {
  spawnEngineHost();
  ipcMain.handle("mn:detect", (_e, url: string) => callEngine("detect", { url }));
  ipcMain.handle("mn:scan", (_e, url: string) => callEngine("scan", { url }));
  ipcMain.handle("mn:connectors", () => callEngine("connectors", {}));
  ipcMain.handle("mn:testConnection", (_e, platform: string, token: string) =>
    callEngine("testConnection", { url: platform, token }));
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
