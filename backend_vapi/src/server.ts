import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import swagger from '@fastify/swagger';
import swaggerUI from '@fastify/swagger-ui';
import { config } from './config';
import routes from './routes';

async function main() {
  const app = Fastify({
    logger: {
      level: config.logLevel,
      transport: config.nodeEnv === 'development' ? { target: 'pino-pretty' } : undefined
    }
  });

  await app.register(multipart, {
    attachFieldsToBody: true,             // adicionado para facilitar acesso aos campos
    limits: { fileSize: 20 * 1024 * 1024 } // 20MB
  });

  await app.register(swagger, {
    openapi: {
      openapi: '3.0.3',
      info: {
        title: 'VAPI Campaign Backend',
        description: 'Importa Excel, salva campanha e enfileira webhooks por contato.',
        version: '1.0.0'
      }
    }
  });

  await app.register(swaggerUI, {
  routePrefix: '/docs',
  uiConfig: {
    docExpansion: 'list',
    deepLinking: false
  }
});

  await app.register(routes);

  app.get('/', async () => ({
  status: 'ok',
  docs: '/docs'
}));


  await app.listen({ port: config.port, host: '0.0.0.0' });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
