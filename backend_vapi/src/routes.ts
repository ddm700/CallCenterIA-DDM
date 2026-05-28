import { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { z } from 'zod';
import { parseContactsFromXlsx } from './utils/excel';
import { createCampaign, insertContacts, getCampaign, listCampaignContacts, countCampaignContacts, fetchPendingContacts, markContactEnqueued, updateCampaignStatus, listCampaigns } from './repo';
import { listAssistants, listLines } from './vapi';
import { createQueue } from './queue';
import { config } from './config';

const queue = createQueue(); //👈 singleton — fora do plugin

export default fp(async function routes(app: FastifyInstance) {

  app.get('/health', {
    schema: { tags: ['System'], summary: 'Healthcheck' }
  }, async () => ({ ok: true }));

  app.get('/vapi/assistant', {
    schema: { tags: ['VAPI'], summary: 'Listar assistentes (proxy VAPI)' }
  }, async () => await listAssistants());

  app.get('/vapi/lines', {
    schema: {
      tags: ['VAPI'],
      summary: 'Listar linhas/phone numbers (proxy VAPI)',
      response: {
        200: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' }
            },
            additionalProperties: true
          }
        }
      }
    }
  }, async () => await listLines());

  app.post('/campaigns/import-excel', {
    schema: {
      tags: ['Campaigns'],
      summary: 'Criar campanha + importar Excel (.xlsx) e salvar contatos no DB',
      consumes: ['multipart/form-data'],
      response: {
        200: {
          type: 'object',
          properties: {
            campaign: { type: 'object' },
            inserted_contacts: { type: 'number' },
            parse_errors: { type: 'array', items: { type: 'string' } }
          }
        }
      }
    }
  }, async (req, reply) => {
    const bodyRaw = (req as any).body;
    const filePart = bodyRaw?.file;
    if (!filePart) return reply.code(400).send({ error: 'file is required' });

    const fields = {
      name: bodyRaw?.name?.value,
      assistant_id: bodyRaw?.assistant_id?.value,
      line_id: bodyRaw?.line_id?.value,
      webhook_url: bodyRaw?.webhook_url?.value
    };

    const body = z.object({
      name: z.string().min(1),
      assistant_id: z.string().min(1),
      line_id: z.string().min(1),
      webhook_url: z.string().optional()
    }).parse(fields);

    const buf = await filePart.toBuffer();
    const { contacts, errors } = await parseContactsFromXlsx(buf);

    const campaign = await createCampaign({
      name: body.name,
      assistantId: body.assistant_id,
      lineId: body.line_id,
      webhookUrl: body.webhook_url || null
    });

    const inserted = await insertContacts(campaign.id, contacts);
    return { campaign, inserted_contacts: inserted, parse_errors: errors };
  });

  app.get('/campaigns/:id', {
    schema: {
      tags: ['Campaigns'],
      summary: 'Obter campanha por id',
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } }
    }
  }, async (req, reply) => {
    const { id } = req.params as any;
    const c = await getCampaign(id);
    if (!c) return reply.code(404).send({ error: 'campaign not found' });
    const n = await countCampaignContacts(id);
    return { campaign: c, contacts_count: n };
  });

  app.get('/campaigns/:id/contacts', {
    schema: {
      tags: ['Campaigns'],
      summary: 'Listar contatos de uma campanha (paginação)',
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'number', default: 100 },
          offset: { type: 'number', default: 0 }
        }
      }
    }
  }, async (req, reply) => {
    const { id } = req.params as any;
    const qs = req.query as any;
    const limit = Math.min(parseInt(String(qs.limit ?? 100), 10), 500);
    const offset = Math.max(parseInt(String(qs.offset ?? 0), 10), 0);
    const c = await getCampaign(id);
    if (!c) return reply.code(404).send({ error: 'campaign not found' });
    const rows = await listCampaignContacts(id, limit, offset);
    return { contacts: rows, limit, offset };
  });

  app.get('/campaigns', {
    schema: { tags: ['Campaigns'], summary: 'Listar todas as campanhas' }
  }, async () => await listCampaigns());

  app.post('/campaigns/:id/enqueue', {
    schema: {
      tags: ['Queue'],
      summary: 'Enfileirar 1 job por contato (aplica delay incremental de 2s)',
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      body: {
        type: 'object',
        properties: { override_webhook_url: { type: 'string' } }
      }
    }
  }, async (req, reply) => {
    const { id } = req.params as any;
    const body = (req.body ?? {}) as any;

    const campaign = await getCampaign(id);
    if (!campaign) return reply.code(404).send({ error: 'campaign not found' });

    const webhookUrl = body.override_webhook_url || campaign.webhook_url || config.defaultWebhookUrl || null;

    const contacts = await fetchPendingContacts(id);
    if (contacts.length === 0) return { enqueued: 0, message: 'no pending contacts' };

    await updateCampaignStatus(id, 'queued');

    let idx = 0;
    for (const ct of contacts) {
      const delay = idx * config.contactDelayMs;

      const payload = {
        campaign_id: campaign.id,
        contact_id: ct.id,
        assistant_id: campaign.assistant_id,
        line_id: campaign.line_id,
        webhook_url: webhookUrl,
        contact: {
          name: ct.name,
          cpf: ct.cpf,
          institution: ct.institution,
          phones: ct.phones
        }
      };

      await queue.add('contact', payload, {
        delay,
        attempts: 3,                          //  era 1
        backoff: { type: 'exponential', delay: 5000 }, //  novo
        removeOnComplete: true,
        removeOnFail: { count: 100 }          //  era false
      });

      await markContactEnqueued(ct.id);
      idx++;
    }

    return { enqueued: contacts.length, delay_ms: config.contactDelayMs };
  });

  // 👈 endpoint novo
  app.get('/queue/stats', {
    schema: { tags: ['Queue'], summary: 'Status da fila em tempo real' }
  }, async () => {
    const counts = await queue.getJobCounts();
    return counts;
  });
});