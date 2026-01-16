import express, {type Request, type Response, type NextFunction} from 'express';
import {InterruptedError} from '@ojson/models';
import {
  GetAllTodos,
  GetTodo,
  CreateTodo,
  UpdateTodo,
  DeleteTodo,
  RequestParams,
} from './models';
import {
  deadlineMiddleware,
  contextMiddleware,
  finishMiddleware,
  telemetryHeadersMiddleware,
  type RequestContext,
} from './middleware';
import {NotFoundError, BadRequestError} from './errors';
import {initTelemetry} from './telemetry';

function isValidationError(err: unknown): err is {errors: unknown[]} {
  if (!err || typeof err !== 'object') {
    return false;
  }
  const anyErr = err as any;
  return anyErr.name === 'ValidationError' && Array.isArray(anyErr.errors);
}

// Расширяем глобальный тип Express Request через declaration merging
declare global {
  namespace Express {
    interface Request {
      ctx: RequestContext;
      deadline: number; // Deadline в миллисекундах (всегда установлен, по умолчанию 30 секунд)
    }
  }
}

// Initialize OpenTelemetry SDK before creating Express app
initTelemetry();

const app = express();
const PORT = process.env.PORT || 3000;

/**
 * Wrapper для async handlers в Express
 * Автоматически ловит ошибки и передает их в error middleware через next()
 */
function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// Middleware для парсинга JSON
app.use(express.json());

// Middleware для обработки заголовков телеметрии и извлечения родительского span контекста
app.use(telemetryHeadersMiddleware);

// Middleware для вычисления deadline из HTTP заголовков
app.use(deadlineMiddleware);

// Middleware для создания контекста с models
app.use(contextMiddleware);

// Middleware для автоматического завершения контекста после обработки запроса
app.use(finishMiddleware);

// GET /api/todos - получить все todo
app.get('/api/todos', asyncHandler(async (req: Request, res: Response) => {
  // Используем модель для получения всех todo
  // Модель автоматически мемоизируется, если вызывается несколько раз
  const todos = await req.ctx.request(GetAllTodos);
  res.json(todos);
}));

// GET /api/todos/:id - получить один todo
app.get('/api/todos/:id', asyncHandler(async (req: Request, res: Response) => {
  // Получаем параметры запроса через модель
  const todo = await req.ctx.request(GetTodo, {id: req.params.id});
  
  if (!todo) {
    throw new NotFoundError('Todo not found');
  }
  
  res.json(todo);
}));

// POST /api/todos - создать новый todo
app.post('/api/todos', asyncHandler(async (req: Request, res: Response) => {
  const params = await req.ctx.request(RequestParams);
  const body = params.body as {title: string; description?: string};

  const createProps: {title: string; description?: string} = {
    title: body.title,
  };
  if (body.description !== undefined) {
    createProps.description = body.description;
  }
  
  const todo = await req.ctx.request(CreateTodo, createProps);
  
  res.status(201).json(todo);
}));

// PUT /api/todos/:id - обновить todo
app.put('/api/todos/:id', asyncHandler(async (req: Request, res: Response) => {
  const params = await req.ctx.request(RequestParams);
  const body = params.body as {title?: string; description?: string; completed?: boolean};
  const id = req.params.id;
  
  const todo = await req.ctx.request(UpdateTodo, {
    id,
    updates: body,
  });
  
  if (!todo) {
    throw new NotFoundError('Todo not found');
  }
  
  res.json(todo);
}));

// DELETE /api/todos/:id - удалить todo
app.delete('/api/todos/:id', asyncHandler(async (req: Request, res: Response) => {
  const deleted = await req.ctx.request(DeleteTodo, {id: req.params.id});
  
  if (!deleted) {
    throw new NotFoundError('Todo not found');
  }
  
  res.status(204).send();
}));

// Обработка ошибок
app.use((err: Error, req: Request, res: Response, next: any) => {
  const ctx = (req as any).ctx as {fail?: (e: unknown) => void} | undefined;
  if (typeof ctx?.fail === 'function') {
    ctx.fail(err);
  }

  switch (true) {
    case err instanceof InterruptedError:
      return res.status(503).json({error: 'Service unavailable'});
    case isValidationError(err):
      return res.status(400).json({error: 'Validation failed', errors: (err as any).errors});
    case err instanceof NotFoundError:
      return res.status(404).json({error: err.message});
    case err instanceof BadRequestError:
      return res.status(400).json({error: err.message});
    default:
      console.error('Unhandled error:', err);
      res.status(500).json({error: 'Internal server error'});
  }
});

// Export app for testing
export default app;

// Запуск сервера (только если не в тестовом режиме)
if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
  app.listen(PORT, () => {
    console.log(`🚀 Todo API server running on http://localhost:${PORT}`);
    console.log(`📝 Endpoints:`);
    console.log(`   GET    /api/todos      - получить все todo`);
    console.log(`   GET    /api/todos/:id  - получить todo по ID`);
    console.log(`   POST   /api/todos      - создать новый todo`);
    console.log(`   PUT    /api/todos/:id  - обновить todo`);
    console.log(`   DELETE /api/todos/:id - удалить todo`);
  });
}

