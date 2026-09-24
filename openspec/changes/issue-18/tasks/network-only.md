# network-only

Сценарии этой задачи:

- Повтор не берёт сохранённое значение
- Первое обращение тоже не пишет

Якорь в `openspec/specs/network-only/spec.md` и `design.md`, раздел Technical prerequisites.

## Сделать

Зарегистрировать оба сценария spec id `network-only` через `spec`, `requirement`, `scenario`. Заголовки — из `openspec/specs/network-only/spec.md`. Обёртка и перенос тел — по Technical prerequisites в `design.md`.

Редактировать только: `src/with-cache/cache-strategy.spec.ts`, `src/with-cache/with-cache.spec.ts`. Другие spec id, зависимости, vitest не менять.

## Доказательство

Наблюдение: network-only всегда выполняет Model, не читает и не пишет кэш при первом и повторном обращении.

Команды: `pnpm run test:units:fast`, `pnpm run test:types`.
