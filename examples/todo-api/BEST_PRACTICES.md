# Best Practices for Building Express APIs with @ojson/models

Этот документ суммирует все улучшения и лучшие практики, применённые при создании todo-api примера. Используйте его как руководство при создании новых демонстрационных серверов.

## Архитектурные решения

### 1. Использование compose для создания контекста

**Проблема**: Создание класса `RequestContext` с приватным `enhanced` усложняет код.

**Решение**: Использовать `compose` для применения обёрток напрямую в middleware.

```typescript
// ❌ Плохо - класс с приватным enhanced
class RequestContext extends Context {
  private _enhanced?: WithModels<RequestContext>;
  // ...
}

// ✅ Хорошо - compose в middleware
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
```

**Преимущества**:
- Проще код без скрытого состояния
- Легче добавлять новые обёртки
- Стандартный паттерн библиотеки

### 2. Разделение middleware на отдельные файлы

**Проблема**: Все middleware в одном файле усложняет поддержку.

**Решение**: Каждый middleware в отдельном файле с чёткой ответственностью.

```
src/middleware/
├── deadline.ts   # Вычисление deadline из заголовков
├── context.ts    # Создание контекста с обёртками
├── finish.ts     # Завершение контекста
└── index.ts       # Экспорт всех middleware
```

**Преимущества**:
- Легче тестировать отдельные middleware
- Проще переиспользовать в других проектах
- Чёткое разделение ответственности

### 3. OpenTelemetry трейсинг

**Проблема**: Нужен способ отслеживать выполнение моделей и контекстов для observability.

**Решение**: Использовать `withTelemetry` для автоматического создания spans.

```typescript
// ✅ Хорошо - добавляем withTelemetry в compose
req.ctx = compose([
  withModels(registry),
  withTelemetry({serviceName: 'todo-api'}),
  withDeadline(req.deadline),
])(new Context(`http-${req.method.toLowerCase()}-${req.path}`));
```

**Преимущества**:
- Автоматическое создание spans для всех моделей
- Запись props и results в spans
- Автоматическая запись ошибок
- Интеграция с OpenTelemetry экосистемой

### 4. Deadline propagation через HTTP заголовки

**Проблема**: Нужен способ ограничить время выполнения запроса.

**Решение**: Читать deadline из заголовков и применять `withDeadline` автоматически.

```typescript
// Middleware для вычисления deadline
app.use((req: Request, res: Response, next) => {
  const deadlineHeader = req.headers['x-request-deadline'] || req.headers['x-timeout'];
  // ... парсинг и установка req.deadline
  req.deadline = DEFAULT_DEADLINE_MS; // дефолтный deadline
  next();
});
```

**Преимущества**:
- Клиенты могут контролировать timeout
- Автоматическое применение ко всем моделям
- Дефолтный deadline защищает от зависаний

### 5. Declaration merging для расширения Express Request

**Проблема**: Постоянные касты `req as RequestWithContext` загромождают код.

**Решение**: Использовать declaration merging для добавления полей в Express Request.

```typescript
// Расширяем глобальный тип Express Request
declare global {
  namespace Express {
    interface Request {
      ctx: RequestContext;
      deadline: number;
    }
  }
}

// Теперь можно использовать напрямую
const todo = await req.ctx.request(GetTodo, {id: params.params.id});
```

**Преимущества**:
- Нет кастов в коде
- TypeScript знает о полях после middleware
- Чище и типобезопаснее

### 6. Централизованная обработка ошибок через assertions

**Проблема**: Дублирование проверок и обработки ошибок в каждом роуте.

**Решение**: Использовать кастомные классы ошибок и централизованный error handler.

```typescript
// ❌ Плохо - проверки в каждом роуте
if (!todo) {
  return res.status(404).json({error: 'Todo not found'});
}

// ✅ Хорошо - бросаем ошибку
if (!todo) {
  throw new NotFoundError('Todo not found');
}

// Обработка в одном месте
app.use((err: Error, req: Request, res: Response, next: any) => {
  req.ctx.fail(err);
  
  if (err instanceof NotFoundError) {
    return res.status(404).json({error: err.message});
  }
  // ...
});
```

**Преимущества**:
- Вся обработка ошибок в одном месте
- Роуты фокусируются на бизнес-логике
- Легче добавлять новые типы ошибок

### 7. Типизация моделей для правильного выведения типов

**Проблема**: TypeScript не может правильно вывести типы из моделей.

**Решение**: Использовать helper types (`ModelProps`, `ModelResult`, `ModelCtx`) и явные аннотации типов.

```typescript
// ✅ Хорошо - явный тип возвращаемого значения
function GetTodo(props: GetTodoProps): Todo | null {
  const todo = todoStore.getById(props.id);
  return todo || null;
}

// TypeScript автоматически выведет тип
const todo = await req.ctx.request(GetTodo, {id: '123'}); // todo: Todo | null
```

**Преимущества**:
- Автоматическое выведение типов
- Нет необходимости в кастах
- Лучшая поддержка IDE

### 8. Строгая типизация RequestParams

**Проблема**: Постоянные касты при работе с параметрами запроса.

**Решение**: Создать типизированный интерфейс `ExpressRequestParams`.

```typescript
export interface ExpressRequestParams extends OJson {
  params: Record<string, string>;
  query: Record<string, string>;
  body: Json;
}

function RequestParams(props: OJson, ctx: ExpressContext): ExpressRequestParams {
  return {
    params: (ctx.req?.params || {}) as Record<string, string>,
    query: (ctx.req?.query || {}) as Record<string, string>,
    body: (ctx.req?.body || {}) as Json,
  };
}

// Использование
const params = await req.ctx.request(RequestParams) as ExpressRequestParams;
const id = params.params.id; // типобезопасно
```

**Преимущества**:
- Меньше кастов
- Типобезопасный доступ к параметрам
- Единый интерфейс для всех параметров запроса

## Структура проекта

```
todo-api/
├── src/
│   ├── errors.ts              # Кастомные классы ошибок
│   ├── middleware/
│   │   ├── deadline.ts        # Deadline middleware
│   │   ├── context.ts         # Context middleware (compose)
│   │   ├── finish.ts          # Finish middleware
│   │   └── index.ts           # Экспорт
│   ├── models/
│   │   ├── types.ts           # TypeScript типы
│   │   ├── store.ts           # Хранилище данных
│   │   └── index.ts           # Модели
│   ├── type-tests.ts          # Тесты на выведение типов
│   └── server.ts              # Express сервер
├── package.json
├── tsconfig.json
└── README.md
```

## Паттерны использования

### Создание контекста

```typescript
// Middleware создаёт контекст с нужными обёртками
app.use(contextMiddleware);

// В роутах используем напрямую
app.get('/api/todos/:id', async (req: Request, res: Response) => {
  const todo = await req.ctx.request(GetTodo, {id: params.params.id});
  // ...
});
```

### Обработка ошибок

```typescript
// В роутах бросаем ошибки
if (!todo) {
  throw new NotFoundError('Todo not found');
}

// В error handler обрабатываем централизованно
app.use((err: Error, req: Request, res: Response, next: any) => {
  req.ctx.fail(err);
  
  if (err instanceof NotFoundError) {
    return res.status(404).json({error: err.message});
  }
  // ...
});
```

### Типизация моделей

```typescript
// Явные типы для правильного выведения
function GetTodo(props: GetTodoProps): Todo | null {
  // ...
}

// TypeScript автоматически выведет тип
const todo = await req.ctx.request(GetTodo, {id: '123'}); // Promise<Todo | null>
```

### OpenTelemetry трейсинг

```typescript
// withTelemetry автоматически создаёт spans для всех моделей
req.ctx = compose([
  withModels(registry),
  withTelemetry({serviceName: 'todo-api'}),
  withDeadline(req.deadline),
])(new Context(`http-${req.method.toLowerCase()}-${req.path}`));

// Все вызовы моделей автоматически трейсятся
const todo = await req.ctx.request(GetTodo, {id: '123'});
// Создаётся span для GetTodo с props и result
```

### Deadline propagation

```typescript
// Клиент устанавливает deadline
curl -H "X-Request-Deadline: 5000" http://localhost:3000/api/todos

// Middleware автоматически применяет deadline ко всем моделям
app.use(deadlineMiddleware);
```

## Чеклист для нового сервера

- [ ] Использовать `compose` для создания контекста вместо класса
- [ ] Разделить middleware на отдельные файлы
- [ ] Реализовать deadline propagation через заголовки
- [ ] Использовать declaration merging для расширения Express Request
- [ ] Создать кастомные классы ошибок
- [ ] Централизовать обработку ошибок в error handler
- [ ] Использовать явные типы возвращаемого значения в моделях
- [ ] Создать типизированный интерфейс для параметров запроса
- [ ] Добавить тесты на выведение типов
- [ ] Создать registry для каждого запроса (не переиспользовать между запросами)

## Избегайте

- ❌ Переиспользование registry между разными HTTP запросами
- ❌ Классы с приватным `enhanced` для контекста
- ❌ Дублирование обработки ошибок в роутах
- ❌ Касты типов вместо правильной типизации
- ❌ Все middleware в одном файле
- ❌ Отсутствие дефолтного deadline

## См. также

- [with-models README](../../src/with-models/readme.md) - подробная документация по моделям
- [AGENTS.md](../../AGENTS.md) - руководство для разработчиков библиотеки
- [Основной README](./README.md) - документация todo-api примера

