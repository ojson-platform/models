import type {Request, Response} from 'express';

// Дефолтный deadline для всех запросов (30 секунд)
export const DEFAULT_DEADLINE_MS = 30000;

/**
 * Middleware для вычисления deadline из HTTP заголовков.
 * 
 * Поддерживает:
 * - X-Request-Deadline: deadline в миллисекундах
 * - X-Timeout: timeout в секундах (конвертируется в миллисекунды)
 * 
 * Если deadline не указан, устанавливается дефолтный (30 секунд).
 */
export function deadlineMiddleware(req: Request, res: Response, next: () => void) {
  // Читаем deadline из заголовка X-Request-Deadline (в миллисекундах)
  // Или из X-Timeout (в секундах, для совместимости)
  const deadlineHeader = req.headers['x-request-deadline'] || req.headers['x-timeout'];
  
  if (deadlineHeader) {
    const value = typeof deadlineHeader === 'string' ? deadlineHeader : deadlineHeader[0];
    const parsed = parseInt(value, 10);
    
    if (parsed > 0) {
      // Если заголовок X-Timeout, конвертируем секунды в миллисекунды
      if (req.headers['x-timeout'] && !req.headers['x-request-deadline']) {
        req.deadline = parsed * 1000;
      } else {
        // X-Request-Deadline уже в миллисекундах
        req.deadline = parsed;
      }
    }
  }
  
  // Если deadline не указан, используем дефолтный
  if (!req.deadline) {
    req.deadline = DEFAULT_DEADLINE_MS;
  }
  
  next();
}

