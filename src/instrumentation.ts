import 'dotenv/config';
import { version } from '../package.json';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { NestInstrumentation } from '@opentelemetry/instrumentation-nestjs-core';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

const isEnabled = process.env.OTEL_ENABLED === 'true';

if (isEnabled) {
  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME || 'nestjs-ecommerce-api',
      [ATTR_SERVICE_VERSION]: version,
    }),
    traceExporter: new OTLPTraceExporter({
      url: `${process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318'}/v1/traces`,
    }),
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-http': {
          ignoreIncomingRequestHook: (req) => {
            return req.url?.startsWith('/health') ?? false;
          },
        },
        '@opentelemetry/instrumentation-fs': { enabled: false },
      }),
      new NestInstrumentation(),
    ],
  });

  sdk.start();

  const shutdown = (): void => {
    sdk.shutdown().catch(console.error);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  console.warn('OpenTelemetry tracing initialized');
}
