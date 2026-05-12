import { NextResponse } from 'next/server';
import { HttpError } from '@/server/auth';
import { logger } from '@/server/logger';

export function ok(data, init) {
  return NextResponse.json({ ok: true, data }, init);
}

export function fail(status, code, info) {
  return NextResponse.json({ ok: false, error: code, info }, { status });
}

export async function withErrors(handler) {
  try {
    return await handler();
  } catch (err) {
    if (err instanceof HttpError) {
      return fail(err.status, err.code, err.info);
    }
    logger.error('unhandled api error', { stack: err?.stack, message: err?.message });
    return fail(500, 'internal_error');
  }
}

export function readBody(req) {
  return req.json().catch(() => ({}));
}
