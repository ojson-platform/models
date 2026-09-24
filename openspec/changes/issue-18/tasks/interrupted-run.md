# interrupted-run

Сценарии этой задачи:

- Обращение после прерывания не выполняет Model
- Повтор не находит сохранённый успех
- Межзапросный кэш не записывает прерванное обращение
- Вложенный запуск прерывается вместе с внешним
- Успех до прерывания остаётся в мемоизации
- Прерывание между шагами
- Срок истекает раньше Model
- Model успевает до срока
- Нулевой срок не прерывает запуск по времени
- Вызывающий видит прерывание, и кэш молчит
- Фоновое обновление прерванного запуска не пишет и не падает
- Model прерывает запуск и возвращает значение
- Истечение срока — то же прерывание
- Прерванный запуск не оставляет успешный span

Якорь в `openspec/specs/interrupted-run/spec.md` и `design.md`, раздел Technical prerequisites.

## Сделать

Зарегистрировать все четырнадцать сценариев spec id `interrupted-run` через `spec`, `requirement`, `scenario`. Заголовки Requirement и Scenario — дословно из `openspec/specs/interrupted-run/spec.md`. Обёртка существующих тестов и новые тесты только в уже существующих spec-файлах; вторую копию наблюдения не добавлять.

Редактировать только: `src/with-deadline/with-deadline.spec.ts`, `src/with-cache/cache-strategy.spec.ts`, `src/with-cache/with-cache.spec.ts`, `src/with-models/with-models.spec.ts`, `src/with-telemetry/with-telemetry.spec.ts`. Зависимости, `vitest.config.mjs`, другие spec id не менять.

## Доказательство

Наблюдение: `InterruptedError`, мемоизация и межзапросный кэш при kill и deadline, вложенные контексты, генератор между шагами, фоновое обновление при прерванном запуске, span без события результата. Тройные имена из OpenSpec.

Команды: `pnpm run test:units:fast`, `pnpm run test:types`.
