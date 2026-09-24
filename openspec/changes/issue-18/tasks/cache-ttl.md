# cache-ttl

Сценарии этой задачи:

- Свой срок важнее срока по умолчанию
- Без своего срока берётся срок по умолчанию
- Две стратегии хранят каждая со своим сроком
- Фоновое обновление пишет с тем же сроком
- Следующая Model наследует чужой срок
- Отвергнутый срок портит следующее обращение
- Срок не задан
- Срок не число
- Срок не положительный
- Отрицательный и не конечный срок — та же ошибка
- cache-only читает без срока
- network-only выполняется без срока
- Чтение после срока — промах

Якорь в `openspec/specs/cache-ttl/spec.md` и `design.md`, раздел Technical prerequisites.

## Сделать

Зарегистрировать все тринадцать сценариев spec id `cache-ttl` через `spec`, `requirement`, `scenario`. Заголовки Requirement и Scenario — дословно из `openspec/specs/cache-ttl/spec.md`. Правила обёртки и переноса тел тестов — как в `design.md` (Technical prerequisites, третий пункт).

Редактировать только: `src/with-cache/cache-strategy.spec.ts`, `src/with-cache/with-cache.spec.ts`, `src/with-cache/cache.spec.ts`. Другие spec id, зависимости и vitest не менять.

## Доказательство

Наблюдение: TTL стратегии и default, наследование и отклонение неверного TTL, чтение cache-only и network-only без TTL, промах после истечения срока, согласованный TTL при фоновом обновлении. Тексты сценариев из spec.

Команды: `pnpm run test:units:fast`, `pnpm run test:types`.
