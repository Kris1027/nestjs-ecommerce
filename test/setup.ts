// Load .env file for tests (env.validation.ts no longer imports dotenv)
import 'dotenv/config';

// Silence NestJS Logger output during tests to keep console clean.
// NestJS Logger writes to process.stderr — filter out [Nest] prefixed lines.
const originalStderrWrite = process.stderr.write.bind(process.stderr);
process.stderr.write = ((
  chunk: string | Uint8Array,
  ...args: [BufferEncoding?, ((err?: Error | null) => void)?]
): boolean => {
  const str = typeof chunk === 'string' ? chunk : chunk.toString();
  if (str.includes('[Nest]')) {
    return true;
  }
  return originalStderrWrite(chunk, ...args);
}) as typeof process.stderr.write;
