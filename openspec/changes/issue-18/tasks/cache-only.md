# cache-only

Сценарии этой задачи:

- Другой запрос получает сохранённое значение
- Записи нет

Якорь в `openspec/specs/cache-only/spec.md` и `design.md`, раздел Technical prerequisites: один срез на spec id `cache-only`.

## Сделать

Зарегистрировать оба сценария spec id `cache-only` через `spec`, `requirement`, `scenario` из `@ojson/spec-coverage`. Заголовки — дословно из `openspec/specs/cache-only/spec.md`. Существующее тело теста сохранить; `it` заменить обёрткой в том же коммите. Сценарию без теста — новый тест в существующем файле. Тест без сценария — обычный `it`. Вторую копию наблюдения не добавлять.

Редактировать только: `src/with-cache/cache-strategy.spec.ts`, `src/with-cache/with-cache.spec.ts`. Зависимости, `vitest.config.mjs`, другие spec id не менять.

## Доказательство

Наблюдение: при cache-only другой запрос читает сохранённое значение; при отсутствии записи — промах без выполнения Model. Тройное имя совпадает с OpenSpec.

Команды: `pnpm run test:units:fast`, `pnpm run test:types`.
