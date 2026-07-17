const DEFAULT_API_BASE_URL = '';

const getEnv = (key: string) => {
  try {
    // @ts-ignore
    return (import.meta && import.meta.env && import.meta.env[key]) || '';
  } catch {
    return '';
  }
};

export const getApiBaseUrl = (): string => {
  const envUrl = getEnv('VITE_API_BASE_URL');
  return (envUrl || DEFAULT_API_BASE_URL).replace(/\/$/, '');
};

export async function apiRequest<T = any>(path: string, init?: RequestInit): Promise<T> {
  const url = `${getApiBaseUrl()}${path}`;
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
      ...init
    });
  } catch (error: any) {
    const message =
      path.startsWith('/api')
        ? `Falha ao conectar no backend (${url}). Verifique se o backend local esta rodando e se a configuracao de API esta correta.`
        : `Falha de rede ao acessar ${url}.`;

    throw new Error(error?.message ? `${message} Detalhe: ${error.message}` : message);
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.error || `Erro HTTP ${response.status}`);
  }
  return payload as T;
}
