import { app, BrowserWindow } from 'electron';
import path from 'path';
import { spawn, ChildProcess } from 'child_process';

let goProcess: ChildProcess | null = null;

function goBinaryPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'bin', 'go-core');
  }
  return path.join(process.cwd(), '..', 'go-core', 'bin', 'go-core');
}

function startGoCore() {
  const binary = goBinaryPath();
  goProcess = spawn(binary, [], {
    env: {
      ...process.env,
      GO_CORE_PORT: '8088',
      AI_ENGINE_URL: 'http://127.0.0.1:8090',
      AI_SHARED_TOKEN: process.env.AI_SHARED_TOKEN || 'mammo-local-token',
      AI_ENGINE_WORKDIR: path.join(process.cwd(), '..', 'ai-engine'),
      AI_ENGINE_SCRIPT: 'app/main.py',
      AI_ENGINE_PYTHON: process.env.AI_ENGINE_PYTHON || 'python3'
    },
    stdio: 'inherit'
  });

  goProcess.on('exit', (code) => {
    console.error(`[go-core] exited with code ${code}`);
  });
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const devServer = process.env.NEXT_PUBLIC_NEXTRON_URL;
  if (devServer) {
    void mainWindow.loadURL(devServer);
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../../renderer/out/index.html'));
  }

  const interval = setInterval(async () => {
    try {
      const response = await fetch('http://127.0.0.1:8088/startup/status');
      if (response.ok) {
        mainWindow.webContents.send('core:ready', { ready: true });
        clearInterval(interval);
      }
    } catch {
      // keep polling until the Go orchestrator and sidecar are ready
    }
  }, 1000);
}

app.whenReady().then(() => {
  startGoCore();
  createWindow();
});

app.on('before-quit', () => {
  if (goProcess && !goProcess.killed) {
    goProcess.kill('SIGTERM');
  }
});
