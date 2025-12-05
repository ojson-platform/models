import type {Request, Response} from 'express';
import {Context, withModels, withDeadline, withTelemetry, compose, type WithModels, type Key} from '@ojson/models';

/**
 * Тип расширенного контекста после применения всех обёрток
 * Включает withModels, withDeadline, и withTelemetry
 */
export type RequestContext = WithModels<Context & {
  req: Request;
  res: Response;
}>;


/**
 * Middleware для создания контекста с models.
 * 
 * Создаёт контекст для каждого запроса и применяет обёртки:
 * - withModels для мемоизации и вызова моделей
 * - withTelemetry для OpenTelemetry трейсинга
 * - withDeadline для ограничения времени выполнения
 */
export function contextMiddleware(req: Request, res: Response, next: () => void) {
  const registry = new Map<Key, Promise<unknown>>();

  req.ctx = compose([
    withModels(registry),
    withTelemetry({serviceName: 'todo-api'}),
    withDeadline(req.deadline),
  ])(new Context(`http-${req.method.toLowerCase()}-${req.path}`) as RequestContext);

  req.ctx.req = req;
  req.ctx.res = res;
  
  next();
}

