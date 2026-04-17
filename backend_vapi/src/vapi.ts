import fetch from 'node-fetch';
import { config } from './config';

type Json = Record<string, any>;

async function vapiGet(path: string): Promise<Json> {
  const url = new URL(config.vapi.baseUrl);
  // garante apenas um '/'
  const fullPath = (path.startsWith('/') ? path : `/${path}`);
  url.pathname = (url.pathname.replace(/\/$/, '') + fullPath).replace(/\/\/+/, '/');


  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${config.vapi.apiKey}`,
      //'Authorization': 'Bearer 332987f4-f832-4542-9fd0-76de02bde971',
      'Content-Type': 'application/json'
    }
  });

  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }

  if (!res.ok) {
    const msg = typeof data === 'object' ? JSON.stringify(data) : String(data);
    throw new Error(`VAPI GET ${fullPath} failed: ${res.status} ${msg}`);
  }
  return data ?? {};
}

export async function listAssistants(): Promise<Json> {
  return vapiGet(config.vapi.assistantsPath);
}

export async function listLines(): Promise<Json> {
  return vapiGet(config.vapi.linesPath);
}
