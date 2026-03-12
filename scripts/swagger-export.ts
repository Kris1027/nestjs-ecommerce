import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const API_URL = process.env.API_URL ?? 'http://localhost:3000';
const OUTPUT_PATH = resolve(__dirname, '..', 'openapi.json');

async function exportSwagger(): Promise<void> {
  const response = await fetch(`${API_URL}/docs-json`);

  if (!response.ok) {
    throw new Error(`Failed to fetch OpenAPI spec: ${response.status} ${response.statusText}`);
  }

  const spec: unknown = await response.json();
  writeFileSync(OUTPUT_PATH, JSON.stringify(spec, null, 2) + '\n');

  console.warn(`OpenAPI spec exported to ${OUTPUT_PATH}`);
}

exportSwagger().catch((error: Error) => {
  console.error('Swagger export failed:', error.message);
  console.error('Make sure the backend is running (pnpm docker:up)');
  process.exit(1);
});
