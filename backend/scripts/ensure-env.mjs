import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendDir = path.resolve(__dirname, '..');

const envPath = path.join(backendDir, '.env');
const examplePath = path.join(backendDir, '.env.example');
const rootEnvPath = path.join(backendDir, '..', '.env');

if (!fs.existsSync(envPath)) {
  if (fs.existsSync(rootEnvPath)) {
    fs.copyFileSync(rootEnvPath, envPath);
    console.log('[backend ensure-env] .env criado a partir do .env raiz');
  } else if (fs.existsSync(examplePath)) {
    fs.copyFileSync(examplePath, envPath);
    console.log('[backend ensure-env] .env criado a partir de .env.example');
  }
}
