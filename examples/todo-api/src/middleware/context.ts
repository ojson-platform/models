import type {Request, Response} from 'express';
import {Context, withModels, withDeadline, withTelemetry, compose, type WithModels, type Key} from '@ojson/models';
import {RequestParams, type ExpressRequestParams} from '../models';

/**
 * Тип расширенного контекста после применения всех обёрток
 * Включает withModels, withDeadline, и withTelemetry
 */
export type RequestContext = WithModels<Context>;

/**
 * Middleware для создания контекста с models.
 * 
 * Создаёт контекст для каждого запроса и применяет обёртки:
 * - withModels для мемоизации и вызова моделей
 * - withTelemetry для OpenTelemetry трейсинга
 * - withDeadline для ограничения времени выполнения
 * 
 * Также устанавливает значения для request-dependent моделей через ctx.set()
 */
export function contextMiddleware(req: Request, res: Response, next: () => void) {
  const registry = new Map<Key, Promise<unknown>>();

  req.ctx = compose([
    withModels(registry),
    withTelemetry({serviceName: 'todo-api'}),
    withDeadline(req.deadline),
  ])(new Context(`${req.method.toUpperCase()} ${req.path}`) as RequestContext);

  // Set request-dependent model values
  req.ctx.set(RequestParams, {
    params: {...req.params} as Record<string, string>,
    query: {...req.query} as Record<string, string>,
    body: req.body ? JSON.parse(JSON.stringify(req.body)) : {},
  } as ExpressRequestParams);
  
  next();
}

