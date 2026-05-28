import { withClient } from './db';
import { CampaignStatus, ContactStatus, ContactInput } from './types';

export type Campaign = {
  id: string;
  name: string;
  assistant_id: string;
  line_id: string;
  webhook_url: string | null;
  status: CampaignStatus;
  created_at: string;
};

export async function createCampaign(params: {
  name: string;
  assistantId: string;
  lineId: string;
  webhookUrl?: string | null;
}): Promise<Campaign> {
  return await withClient(async (c) => {
    const res = await c.query(
      `INSERT INTO campaigns (name, assistant_id, line_id, webhook_url, status)
       VALUES ($1,$2,$3,$4,'draft')
       RETURNING id, name, assistant_id, line_id, webhook_url, status, created_at`,
      [params.name, params.assistantId, params.lineId, params.webhookUrl ?? null]
    );
    return res.rows[0];
  });
}

export async function insertContacts(campaignId: string, contacts: ContactInput[]): Promise<number> {
  if (contacts.length === 0) return 0;
  return await withClient(async (c) => {
    await c.query('BEGIN');
    try {
      for (const ct of contacts) {
        await c.query(
          `INSERT INTO contacts (campaign_id, name, cpf, institution, phones, status, attempts)
           VALUES ($1,$2,$3,$4,$5,'pending',0)`,
          [campaignId, ct.name, ct.cpf, ct.institution, JSON.stringify(ct.phones)]
        );
      }
      await c.query('COMMIT');
      return contacts.length;
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    }
  });
}

export async function getCampaign(id: string): Promise<Campaign | null> {
  return await withClient(async (c) => {
    const res = await c.query(
      `SELECT id, name, assistant_id, line_id, webhook_url, status, created_at
       FROM campaigns WHERE id=$1`,
      [id]
    );
    return res.rows[0] ?? null;
  });
}

export async function listCampaigns() {
   return await withClient(async (c) => {
    const res = await c.query(
      `
      SELECT
        c.id,
        c.name,
        c.assistant_id,
        c.line_id,
        c.webhook_url,
        c.status,
        c.created_at,
        COUNT(ct.id) AS contacts_count
      FROM campaigns c
      LEFT JOIN contacts ct
        ON ct.campaign_id = c.id
      GROUP BY c.id
      ORDER BY c.created_at DESC
      `
    );

    return res.rows.map(r => ({
      id: r.id,
      name: r.name,
      assistant_id: r.assistant_id,
      line_id: r.line_id,
      webhook_url: r.webhook_url,
      status: r.status,
      created_at: r.created_at,
      contacts_count: Number(r.contacts_count)
    }));
  });
}

export async function listCampaignContacts(campaignId: string, limit = 100, offset = 0) {
  return await withClient(async (c) => {
    const res = await c.query(
      `SELECT id, campaign_id, name, cpf, institution, phones, status, attempts, last_attempt_at, last_error, created_at, updated_at
       FROM contacts
       WHERE campaign_id=$1
       ORDER BY created_at ASC
       LIMIT $2 OFFSET $3`,
      [campaignId, limit, offset]
    );
    return res.rows;
  });
}

export async function countCampaignContacts(campaignId: string): Promise<number> {
  return await withClient(async (c) => {
    const res = await c.query(`SELECT COUNT(*)::int AS n FROM contacts WHERE campaign_id=$1`, [campaignId]);
    return res.rows[0]?.n ?? 0;
  });
}

export async function fetchPendingContacts(campaignId: string) {
  return await withClient(async (c) => {
    const res = await c.query(
      `SELECT id, campaign_id, name, cpf, institution, phones, status, attempts
       FROM contacts
       WHERE campaign_id=$1 AND status IN ('pending', 'enqueued', 'running')
       ORDER BY created_at ASC`,
      [campaignId]
    );
    return res.rows as Array<{
      id: string; campaign_id: string; name: string; cpf: string; institution: string | null;
      phones: string[]; status: ContactStatus; attempts: number;
    }>;
  });
}

export async function markContactEnqueued(contactId: string) {
  return await withClient(async (c) => {
    await c.query(
      `UPDATE contacts SET status='enqueued', updated_at=NOW() WHERE id=$1`,
      [contactId]
    );
  });
}

export async function markRunning(contactId: string) {
  return withClient(c =>
    c.query(
      `UPDATE contacts
       SET status = 'running', updated_at = NOW()
       WHERE id = $1`,
      [contactId]
    )
  );
}

export async function markAttempt(contactId: string, attempt: number) {
  const status = attempt === 1 ? 'attempt_1' : attempt === 2 ? 'attempt_2' : 'attempt_3';
  return await withClient(async (c) => {
    await c.query(
      `UPDATE contacts
       SET status=$2, attempts=$3, last_attempt_at=NOW(), updated_at=NOW(), last_error=NULL
       WHERE id=$1`,
      [contactId, status, attempt]
    );
  });
}

export async function markSuccess(contactId: string, response: any) {
  return await withClient(async (c) => {
    await c.query(
      `UPDATE contacts
       SET status='success', updated_at=NOW(), last_error=NULL, last_response=$2
       WHERE id=$1`,
      [contactId, JSON.stringify(response ?? null)]
    );
  });
}

export async function markFailed(contactId: string, err: string) {
  return await withClient(async (c) => {
    await c.query(
      `UPDATE contacts
       SET status='failed', updated_at=NOW(), last_error=$2
       WHERE id=$1`,
      [contactId, err]
    );
  });
}

export async function updateCampaignStatus(campaignId: string, status: CampaignStatus) {
  return await withClient(async (c) => {
    await c.query(`UPDATE campaigns SET status=$2, updated_at=NOW() WHERE id=$1`, [campaignId, status]);
  });
}
