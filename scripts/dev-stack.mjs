import { spawn } from 'node:child_process';

const appPort = process.env.APP_PORT || '4000';
const apiBaseUrl = `http://localhost:${appPort}`;

console.log(`[dev:stack] APP_PORT=${appPort}`);
console.log(`[dev:stack] VITE_API_BASE_URL=${apiBaseUrl}`);

const sharedEnv = {
  ...process.env,
  PORT: appPort,
  VITE_API_BASE_URL: apiBaseUrl
};

function run(command) {
  if (process.platform === 'win32') {
    return spawn('cmd.exe', ['/d', '/s', '/c', command], {
      stdio: 'inherit',
      env: sharedEnv,
      windowsHide: false
    });
  }

  return spawn(command, {
    stdio: 'inherit',
    env: sharedEnv,
    shell: true
  });
}

const backend = run('npm --prefix backend run dev');
const frontend = run('npm run dev:frontend');

let shuttingDown = false;
function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  backend.kill('SIGTERM');
  frontend.kill('SIGTERM');
  setTimeout(() => process.exit(code), 300);
}

backend.on('exit', (code) => {
  if (!shuttingDown) {
    console.error(`[dev:stack] backend finalizou (code=${code ?? 0})`);
    shutdown(code ?? 0);
  }
});

frontend.on('exit', (code) => {
  if (!shuttingDown) {
    console.error(`[dev:stack] frontend finalizou (code=${code ?? 0})`);
    shutdown(code ?? 0);
  }
});

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
