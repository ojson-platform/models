import type {Request, Response, NextFunction} from 'express';
import {context as otelContext, propagation} from '@opentelemetry/api';

/**
 * Middleware that extracts incoming trace headers and makes the extracted context active
 * for the lifetime of the HTTP request.
 *
 * This allows withTelemetry to attach context spans as children of upstream spans.
 */
export function telemetryHeadersMiddleware(req: Request, res: Response, next: NextFunction) {
  const carrier = req.headers as Record<string, unknown>;
  const extracted = propagation.extract(otelContext.active(), carrier);
  otelContext.with(extracted, () => next());
}


