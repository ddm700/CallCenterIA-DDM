import { env } from '../config/env.js';
import { supabaseAdmin } from '../lib/supabase.js';

export type ParsedResponseBody = Record<string, unknown> | string | null;

export type DispatchResult =
  | {
      ok: true;
      statusCode: number;
      headers: Record<string, string>;
      response: ParsedResponseBody;
    }
  | {
      ok: false;
      statusCode: number | null;
      headers: Record<string, string>;
      error: unknown;
    };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class RequestPacer {
  private nextAllowedAt = 0;
  private queue = Promise.resolve();

  async waitTurn(minIntervalMs: number): Promise<void> {
    if (minIntervalMs <= 0) return;

    let delay = 0;
    const reservation = this.queue.then(() => {
      const now = Date.now();
      const scheduledAt = Math.max(now, this.nextAllowedAt);
      this.nextAllowedAt = scheduledAt + minIntervalMs;
      delay = scheduledAt - now;
    });

    this.queue = reservation.catch(() => undefined);
    await reservation;

    if (delay > 0) {
      await sleep(delay);
    }
  }
}

export const sharedDispatchPacer = new RequestPacer();

export function buildDispatchHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'x-source': 'node-backend',
    'x-function-name': 'initiate-vapi-call',
    'x-system': 'discador-vapi',
    'x-version': '1.0'
  };
}

async function parseResponseBody(response: Response): Promise<ParsedResponseBody> {
  const rawBody = await response.text();
  if (!rawBody) return null;

  try {
    return JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return rawBody;
  }
}

function isExplicitFailure(parsedBody: ParsedResponseBody): boolean {
  if (!parsedBody || typeof parsedBody !== 'object') return false;

  return (
    parsedBody.success === false ||
    parsedBody.ok === false ||
    parsedBody.executed === false ||
    Boolean(parsedBody.error)
  );
}

function parseRetryAfterMs(headerValue: string | null): number | null {
  if (!headerValue) return null;

  const seconds = Number.parseFloat(headerValue);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.round(seconds * 1000);
  }

  const retryAt = Date.parse(headerValue);
  if (Number.isNaN(retryAt)) return null;

  return Math.max(0, retryAt - Date.now());
}

function computeBackoffMs(attempt: number, retryAfterMs: number | null): number {
  if (retryAfterMs !== null) {
    return Math.min(env.campaignStartRetryMaxMs, retryAfterMs);
  }

  const exponentialDelay = env.campaignStartRetryBaseMs * (2 ** attempt);
  const jitter = Math.floor(Math.random() * Math.max(1, env.campaignStartRetryBaseMs));
  return Math.min(env.campaignStartRetryMaxMs, exponentialDelay + jitter);
}

export function getDispatchErrorMessage(result: DispatchResult): string {
  if (result.ok) return '';

  if (typeof result.error === 'string' && result.error.trim()) {
    return result.error;
  }

  if (result.error instanceof Error && result.error.message.trim()) {
    return result.error.message;
  }

  return `Erro n8n: ${result.statusCode ?? 'sem status'}`;
}

export async function getN8nWebhookUrl(): Promise<string> {
  const { data: n8nSetting } = await supabaseAdmin
    .from('app_settings')
    .select('setting_key, setting_value')
    .in('setting_key', ['n8n_webhook_url', 'n8n_webhook_vapi', 'webhook_url']);

  return (
    n8nSetting?.find((item) => item.setting_key === 'n8n_webhook_url')?.setting_value ||
    n8nSetting?.find((item) => item.setting_key === 'n8n_webhook_vapi')?.setting_value ||
    n8nSetting?.find((item) => item.setting_key === 'webhook_url')?.setting_value ||
    'https://n8n-n8n-start.xzz0ed.easypanel.host/webhook/callcenteria'
  );
}

export async function postWebhookWithRetries(
  url: string,
  payload: Record<string, unknown>,
  pacer: RequestPacer = sharedDispatchPacer
): Promise<DispatchResult> {
  const attempts = Math.max(1, env.campaignStartMaxRetries + 1);

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await pacer.waitTurn(env.campaignStartRequestIntervalMs);

    const response = await fetch(url, {
      method: 'POST',
      headers: buildDispatchHeaders(),
      body: JSON.stringify(payload)
    });

    const parsedBody = await parseResponseBody(response);
    const explicitFailure = isExplicitFailure(parsedBody);

    if (response.ok && !explicitFailure) {
      return {
        ok: true,
        statusCode: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        response: parsedBody
      };
    }

    if (response.status === 429 && attempt < attempts - 1) {
      const retryAfterMs = parseRetryAfterMs(response.headers.get('retry-after'));
      await sleep(computeBackoffMs(attempt, retryAfterMs));
      continue;
    }

    return {
      ok: false,
      statusCode: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      error:
        explicitFailure && parsedBody && typeof parsedBody === 'object'
          ? parsedBody.error || parsedBody.message || parsedBody
          : parsedBody || `Erro n8n: ${response.status} ${response.statusText}`
    };
  }

  return {
    ok: false,
    statusCode: null,
    headers: {},
    error: 'Fluxo de retry encerrado sem retorno'
  };
}
