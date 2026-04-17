import 'dotenv/config';

function must(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

export const config = {
  port: parseInt(process.env.PORT ?? "3000", 10),
  logLevel: process.env.LOG_LEVEL ?? "info",
  nodeEnv: process.env.NODE_ENV ?? "development",

  databaseUrl: must("DATABASE_URL"),

  redis: {
    host: must("REDIS_HOST"),
    port: parseInt(must("REDIS_PORT"), 10),
    password: process.env.REDIS_PASSWORD || undefined,
    tls: (process.env.REDIS_TLS ?? "false").toLowerCase() === "true"
  },

  vapi: {
    baseUrl: process.env.VAPI_BASE_URL ?? "https://api.vapi.ai",
    apiKey: must("VAPI_API_KEY"),
    assistantsPath: process.env.VAPI_ASSISTANTS_PATH ?? "/assistant",
    linesPath: process.env.VAPI_LINES_PATH ?? "/phone-number"
  },

  defaultWebhookUrl: process.env.DEFAULT_WEBHOOK_URL || undefined,



  /*
    Meta: 9.800 envios “em minutos”
    Vamos assumir:
    alvo conservador: ~50 req/s
    tempo total:
    9.800 / 50 ≈ 196s
    ≈ 3 minutos e 15s

  */

  // delay entre contatos em ms (para envio de mensagens em massa)
  contactDelayMs: parseInt(process.env.CONTACT_DELAY_MS ?? "50", 10),

  // worker configuration    
  worker: {
    concurrency: parseInt(process.env.WORKER_CONCURRENCY ?? "5", 10)
  }
};
