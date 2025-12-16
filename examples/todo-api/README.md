# Todo API Example

Полноценное Express API для управления todo-lists с использованием `@ojson/models` и TypeScript.

## Описание

Этот пример демонстрирует, как использовать библиотеку `@ojson/models` для построения серверного API с декларативным получением данных и автоматической мемоизацией.

### Основные возможности

- ✅ CRUD операции для todo-lists (создание, чтение, обновление, удаление)
- Автоматическая мемоизация результатов моделей
- Deadline propagation через HTTP заголовки
- TypeScript типизация
- In-memory хранилище (для простоты примера)
- Express.js интеграция

## Установка

```bash
cd examples/todo-api
npm install
```

## Запуск

### Сборка и запуск

```bash
npm run build
npm start
```

### Режим разработки (с автоперезагрузкой)

```bash
npm run dev
```

Сервер запустится на `http://localhost:3000`

## API Endpoints

### GET /api/todos

Получить все todo-lists.

**Ответ:**
```json
[
  {
    "id": "1",
    "title": "Купить молоко",
    "description": "Не забыть купить молоко в магазине",
    "completed": false,
    "createdAt": 1234567890,
    "updatedAt": 1234567890
  }
]
```

### GET /api/todos/:id

Получить todo по ID.

**Параметры:**
- `id` (path) - ID todo

**Ответ:**
```json
{
  "id": "1",
  "title": "Купить молоко",
  "description": "Не забыть купить молоко в магазине",
  "completed": false,
  "createdAt": 1234567890,
  "updatedAt": 1234567890
}
```

### POST /api/todos

Создать новый todo.

**Тело запроса:**
```json
{
  "title": "Купить молоко",
  "description": "Не забыть купить молоко в магазине"
}
```

**Ответ:**
```json
{
  "id": "1",
  "title": "Купить молоко",
  "description": "Не забыть купить молоко в магазине",
  "completed": false,
  "createdAt": 1234567890,
  "updatedAt": 1234567890
}
```

### PUT /api/todos/:id

Обновить существующий todo.

**Параметры:**
- `id` (path) - ID todo

**Тело запроса:**
```json
{
  "title": "Купить молоко и хлеб",
  "completed": true
}
```

**Ответ:**
```json
{
  "id": "1",
  "title": "Купить молоко и хлеб",
  "description": "Не забыть купить молоко в магазине",
  "completed": true,
  "createdAt": 1234567890,
  "updatedAt": 1234567891
}
```

### DELETE /api/todos/:id

Удалить todo.

**Параметры:**
- `id` (path) - ID todo

**Ответ:** 204 No Content

## Архитектура

### Модели

Все операции с данными реализованы через модели:

- **GetAllTodos** - получение всех todo (синхронная модель)
- **GetTodo** - получение одного todo по ID (синхронная модель)
- **CreateTodo** - создание нового todo (асинхронная модель)
- **UpdateTodo** - обновление todo (асинхронная модель)
- **DeleteTodo** - удаление todo (асинхронная модель)
- **RequestParams** - получение параметров Express запроса (request-dependent модель, устанавливается через ctx.set())

### Мемоизация

Модели автоматически мемоизируются на основе их `displayName` и параметров. Это означает, что если одна и та же модель вызывается несколько раз в рамках одного запроса с одинаковыми параметрами, результат будет вычислен только один раз.

**Пример:**
```typescript
// В одном запросе
const params1 = await ctx.request(RequestParams); // Вычисляется
const params2 = await ctx.request(RequestParams); // Возвращается из кэша
// params1 === params2 (та же ссылка)
```

### Структура проекта

```
todo-api/
├── src/
│   ├── middleware/
│   │   ├── deadline.ts   # Middleware для вычисления deadline из заголовков
│   │   ├── context.ts   # Middleware для создания контекста с обёртками (compose)
│   │   ├── finish.ts    # Middleware для завершения контекста
│   │   └── index.ts     # Экспорт всех middleware
│   ├── models/
│   │   ├── types.ts     # TypeScript типы для Todo
│   │   ├── store.ts     # In-memory хранилище
│   │   └── index.ts     # Модели для работы с todo
│   └── server.ts        # Express сервер и роуты
├── package.json
├── tsconfig.json
└── README.md
```

## Примеры использования

### Создание todo

```bash
curl -X POST http://localhost:3000/api/todos \
  -H "Content-Type: application/json" \
  -d '{"title": "Купить молоко", "description": "Не забыть"}'
```

### Получение всех todo

```bash
curl http://localhost:3000/api/todos
```

### Обновление todo

```bash
curl -X PUT http://localhost:3000/api/todos/1 \
  -H "Content-Type: application/json" \
  -d '{"completed": true}'
```

### Удаление todo

```bash
curl -X DELETE http://localhost:3000/api/todos/1
```

## Ключевые концепции

### Context и Models

Каждый HTTP запрос создаёт свой контекст через `contextMiddleware`, который:
- Создаёт контекст с моделями и устанавливает значения для request-dependent моделей через `ctx.set()`
- Использует `compose` для применения обёрток:
  - `withModels` для мемоизации и вызова моделей
  - `withDeadline` для ограничения времени выполнения (deadline из заголовков)
- Сохраняет расширенный контекст в `req.ctx` для использования в роутах

### Deadline Propagation

API автоматически применяет deadline ко всем запросам для ограничения времени выполнения:

- **Дефолтный deadline**: 30 секунд (30000 мс) для всех запросов
- **`X-Request-Deadline`** - переопределяет deadline в миллисекундах
- **`X-Timeout`** - переопределяет deadline в секундах (для совместимости, конвертируется в миллисекунды)

Если deadline истекает, все выполняющиеся модели будут прерваны и вернут `InterruptedError` с кодом 503.

**Пример:**
```bash
# Использовать дефолтный deadline (30 секунд)
curl http://localhost:3000/api/todos

# Установить кастомный deadline в 5 секунд
curl -H "X-Request-Deadline: 5000" http://localhost:3000/api/todos
# или
curl -H "X-Timeout: 5" http://localhost:3000/api/todos
```

### Registry

Registry - это общий `Map`, который хранит мемоизированные результаты моделей. **Важно**: Registry должен создаваться **для каждого HTTP-запроса отдельно**. Никогда не переиспользуйте registry между разными запросами - это приведёт к утечке данных и неправильной мемоизации.

### Обработка ошибок

Все ошибки обрабатываются через `ctx.fail(error)`, а контекст завершается через `ctx.end()` в блоке `finally`.

## OpenTelemetry Tracing

Пример включает интеграцию с OpenTelemetry для трейсинга через `withTelemetry`. Все модели и контексты автоматически создают spans, которые можно экспортировать в различные системы мониторинга.

### Настройка

`withTelemetry` автоматически применяется в `contextMiddleware`. Для экспорта traces нужно настроить OpenTelemetry SDK в вашем окружении или использовать collector.

### Локальная разработка с Jaeger

Для просмотра traces локально можно использовать Jaeger:

```bash
# Запустить Jaeger
docker run -d -p 16686:16686 -p 4318:4318 jaegertracing/all-in-one:latest

# Запустить сервер
npm run start

# Открыть Jaeger UI
open http://localhost:16686
```

### Конфигурация

Вы можете настроить endpoint через переменные окружения:

```bash
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318/v1/traces npm run start
```

### Что трейсится

- Каждый HTTP запрос создаёт span с именем контекста (`http-{method}-{path}`)
- Каждый вызов модели создаёт child span с именем модели
- Props и результаты моделей записываются как span attributes/events
- Ошибки автоматически записываются в spans

Для настройки того, какие поля props и results записываются, см. [with-telemetry README](../../src/with-telemetry/readme.md).

## Расширение примера

Этот пример можно расширить:

1. **Добавить кэширование** - использовать `withCache` для кэширования результатов моделей
2. **Добавить телеметрию** - использовать `withTelemetry` для трейсинга запросов
3. **Заменить хранилище** - подключить реальную базу данных (PostgreSQL, MongoDB и т.д.)
4. **Добавить аутентификацию** - создать модели для проверки токенов и прав доступа

## Best Practices

Для создания новых демонстрационных серверов с учётом всех улучшений и лучших практик, см. [BEST_PRACTICES.md](./BEST_PRACTICES.md).

## См. также

- [BEST_PRACTICES.md](./BEST_PRACTICES.md) - руководство по лучшим практикам для создания Express API
- [with-models README](../../src/with-models/readme.md) - подробная документация по моделям
- [with-cache README](../../src/with-cache/readme.md) - кэширование моделей
- [with-telemetry README](../../src/with-telemetry/readme.md) - трейсинг запросов
- [AGENTS.md](../../AGENTS.md) - руководство для разработчиков

