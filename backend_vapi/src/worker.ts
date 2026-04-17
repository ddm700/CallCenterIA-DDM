import { Worker } from 'bullmq';
import { createRedis } from './redis';
import { QUEUE_NAME } from './queue';
import { config } from './config';
import { postWebhook } from './webhook';
import { getCampaign, markAttempt, markFailed, markRunning, markSuccess, updateCampaignStatus } from './repo';

type JobPayload = {
  campaign_id: string;
  contact_id: string;
  assistant_id: string;
  line_id: string;
  webhook_url: string | null;
  contact: {
    name: string;
    cpf: string;
    institution: string | null;
    phones: string[];
  };
};

async function handle(payload: JobPayload) {
  const campaign = await getCampaign(payload.campaign_id);
  if (!campaign) {
    await markFailed(payload.contact_id, 'campaign not found');
    return;
  }

  // marca campanha como running ao começar (best effort)
  if (campaign.status === 'queued' || campaign.status === 'draft') {
    await updateCampaignStatus(campaign.id, 'running');
  }

  const webhookUrl = payload.webhook_url || config.defaultWebhookUrl || null;
  if (!webhookUrl) {
    await markFailed(payload.contact_id, 'webhook_url not defined');
    return;
  }

  // tentativas: até 3 (lógica simples)
  // aqui o job executa 1 vez; as tentativas são controladas pelo seu "reenqueue" futuro se quiser.
  const attempt = Math.min((payload as any).attempts + 1 || 1, 3); 
  await markAttempt(payload.contact_id, attempt);

  // payload que você manda pro n8n (ou outro)
  const hookPayload = {
    campaign_id: payload.campaign_id,
    contact_id: payload.contact_id,
    status: `attempt_${attempt}`,
    assistant_id: payload.assistant_id,
    line_id: payload.line_id,
    contact: payload.contact,
    emitted_at: new Date().toISOString()
  };

  // valida URL
  try {
  new URL(webhookUrl);
  } catch {
  await markFailed(payload.contact_id, 'invalid webhook_url');
  return;
  }

  // 🔴 AQUI: marca o contato como running
  await markRunning(payload.contact_id);

  const resp = await postWebhook(webhookUrl, hookPayload);
  await markSuccess(payload.contact_id, resp);
}

async function main() {
  const connection = createRedis();

  const worker = new Worker(QUEUE_NAME, async (job) => {
    const payload = job.data as JobPayload;
    try {
      await handle(payload);
    } catch (e: any) {
      await markFailed(payload.contact_id, e?.message ?? 'unknown error');
      throw e;
    }
  }, {
    connection,
    concurrency: config.worker.concurrency
  });

  worker.on('completed', (job) => {
    // eslint-disable-next-line no-console
    console.log(`Job completed: ${job.id}`);
  });
  worker.on('failed', (job, err) => {
    // eslint-disable-next-line no-console
    console.error(`Job failed: ${job?.id}`, err?.message);
  });

  // eslint-disable-next-line no-console
  console.log(`Worker running. queue=${QUEUE_NAME} concurrency=${config.worker.concurrency}`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
