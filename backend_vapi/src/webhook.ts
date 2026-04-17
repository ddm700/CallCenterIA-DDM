import fetch from 'node-fetch';

export async function postWebhook(url: string, payload: any): Promise<any> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const text = await res.text();

  if (!res.ok) {
    throw new Error(`Webhook failed: ${res.status} ${text}`);
  }

  // 🔴 se o destino não respondeu nada útil, considere falha
  if (!text) {
    throw new Error('Webhook returned empty response');
  }


  try {
    return JSON.parse(text);
  } 
  catch {
    return { raw: text };
  }


}
