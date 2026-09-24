# cache-first

Сценарии этой задачи:

- Другой запрос берёт сохранённое значение
- Первое обращение сохраняет результат
- Ошибка Model не сохраняется
- Ошибка записи не меняет ответ

Якорь в `openspec/specs/cache-first/spec.md` и `design.md`, раздел Technical prerequisites: первый срез, devDependency и регистрация только сценариев `cache-first`.

## Сделать

Добавить `@ojson/spec-coverage@0.0.1` в `devDependencies` в `package.json` и обновить `pnpm-lock.yaml`. Других зависимостей не добавлять.

В тестах зарегистрировать все четыре сценария spec id `cache-first` через `spec`, `requirement`, `scenario` из `@ojson/spec-coverage`. Заголовки Requirement и Scenario — дословно из `openspec/specs/cache-first/spec.md`. Тело существующего теста, который уже наблюдает сценарий, сохранить; обёртку поставить вместо `it`, старый `it` убрать в том же коммите. Сценарию без теста — новый тест в уже существующем файле. Тест без сценария оставить обычным `it`. Вторую копию одного наблюдения не добавлять. `scenario.skip` для обязательного сценария не использовать.

Редактировать только: `package.json`, `pnpm-lock.yaml`, `src/with-cache/cache-strategy.spec.ts`, `src/with-cache/with-cache.spec.ts`. Продакшен-код, `vitest.config.mjs` и сценарии других spec id в этой задаче не трогать.

## Доказательство

Каждый зарегистрированный сценарий наблюдает поведение cache-first из baseline: попадание без повторного выполнения Model и без записи; промах с записью при включённом кэше; ошибка Model без записи; ошибка записи без изменения ответа вызывающему. Регистрация — точное тройное имя из OpenSpec.

Команды: `pnpm run test:units:fast`, `pnpm run test:types`. До последнего среза проверка spec-coverage в vitest ещё не включена; локально при необходимости — только unit/type.
