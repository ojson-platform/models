import type {Request, Response} from 'express';

/**
 * Middleware для автоматического завершения контекста после обработки запроса.
 * 
 * Завершает контекст (ctx.end()) после отправки ответа клиенту.
 * Если контекст уже был помечен как failed (через ctx.fail()), то не вызывает ctx.end(),
 * так как ctx.fail() уже завершил контекст.
 * 
 * Важно: Этот middleware должен быть зарегистрирован ДО error middleware,
 * чтобы res.on('finish') был зарегистрирован до того, как error middleware отправит ответ.
 */
export function finishMiddleware(req: Request, res: Response, next: () => void) {
  // Завершаем контекст после отправки ответа
  // Используем once вместо on, чтобы избежать множественных вызовов
  res.once('finish', () => {
    // Если контекст уже был помечен как failed, не вызываем ctx.end()
    // так как ctx.fail() уже завершил контекст
    if (!req.ctx.error) {
      req.ctx.end();
    }
  });
  
  next();
}

