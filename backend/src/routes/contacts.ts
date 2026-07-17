import { Router } from 'express';
import { importContactsForCampaign } from '../services/contactImport.js';

export const contactsRouter = Router();

contactsRouter.post('/import', async (req, res) => {
  try {
    const { campaignId, contacts } = req.body as {
      campaignId?: string;
      contacts?: Array<{ nome?: string; cpf?: string; telefone?: string; instituicao?: string }>;
    };

    if (!campaignId || !Array.isArray(contacts)) {
      return res.status(400).json({ success: false, error: 'Payload invalido' });
    }

    const result = await importContactsForCampaign(campaignId, contacts);
    return res.json(result);
  } catch (error: any) {
    console.error('[contacts/import] error', error);
    return res.status(500).json({ success: false, error: error.message || 'Erro interno' });
  }
});
