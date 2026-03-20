import cors from 'cors';
import express from 'express';
import { env } from './config/env.js';
import { callsRouter } from './routes/calls.js';
import { campaignsRouter } from './routes/campaigns.js';
import { contactsRouter } from './routes/contacts.js';
import { vapiRouter } from './routes/vapi.js';
import { webhooksRouter } from './routes/webhooks.js';

const app = express();

app.use(cors({ origin: env.frontendOrigin === '*' ? true : env.frontendOrigin }));
app.use(express.json({ limit: '10mb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'callcenteria-backend', ts: new Date().toISOString() });
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'callcenteria-backend', ts: new Date().toISOString() });
});

app.use('/api/calls', callsRouter);
app.use('/api/campaigns', campaignsRouter);
app.use('/api/contacts', contactsRouter);
app.use('/api/vapi', vapiRouter);
app.use('/api/webhooks', webhooksRouter);

// Also expose routes without /api prefix for serverless adapters that strip the base path.
app.use('/calls', callsRouter);
app.use('/campaigns', campaignsRouter);
app.use('/contacts', contactsRouter);
app.use('/vapi', vapiRouter);
app.use('/webhooks', webhooksRouter);

export default app;
