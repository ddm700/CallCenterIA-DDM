import { Router } from 'express';
import { fetchVapiResources } from '../services/vapiResources.js';

export const vapiRouter = Router();

vapiRouter.get('/resources', async (_req, res) => {
  try {
    const resources = await fetchVapiResources();
    return res.json({ success: true, ...resources });
  } catch (error: any) {
    console.error('[vapi/resources] error', error);
    return res.status(error.statusCode || 500).json({ success: false, error: error.message || 'Erro interno' });
  }
});
