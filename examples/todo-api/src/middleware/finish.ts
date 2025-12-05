import type {Request, Response} from 'express';

/**
 * Middleware для автоматического завершения контекста после обработки запроса.
 * 
 * Завершает контекст (ctx.end()) после отправки ответа клиенту.
 */
export function finishMiddleware(req: Request, res: Response, next: () => void) {
  // Завершаем контекст после отправки ответа
  res.on('finish', () => {
    req.ctx.end();
  });
  
  next();
}

