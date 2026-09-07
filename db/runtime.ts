// Hosted preview adapter. The Docker build replaces this module with runtime.node.ts.
import { env } from 'cloudflare:workers';
import type { Database } from './types';
export const database = (): Database => env.DB;
export const setupTokenRequired = () => false;
export const validSetupToken = (_value: unknown) => true;
export const requestOrigin = (req: Request) => new URL(req.url).origin;
export const rateLimitScope = (req: Request) =>
  req.headers.get('cf-connecting-ip') || 'local';
