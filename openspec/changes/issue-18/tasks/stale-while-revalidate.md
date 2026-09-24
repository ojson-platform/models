# stale-while-revalidate

Сценарии этой задачи:

- Первое обращение сохраняет результат
- Ошибка Model не сохраняется
- Ответ не ждёт фонового обновления
- Сбой обновления оставляет прежнее значение
- Параллельные обновления одной записи выполняют Model один раз

Якорь в `openspec/specs/stale-while-revalidate/spec.md` и `design.md`, раздел Technical prerequisites: последний срез, включение проверки spec-coverage в vitest.

## Сделать

Зарегистрировать все пять сценариев spec id `stale-while-revalidate` через `spec`, `requirement`, `scenario`. Заголовки — из `openspec/specs/stale-while-revalidate/spec.md`. Обёртка и перенос тел — по третьему пункту Technical prerequisites.

В `vitest.config.mjs` задать `test.globalSetup` на `@ojson/spec-coverage/setup` и добавить `@ojson/spec-coverage/reporter` в `test.reporters`, сохранив остальную конфигурацию из `@ojson/infra/vitest`. После этого среза проверка spec-coverage выполняется вместе с vitest без отдельного флага.

Редактировать только: `src/with-cache/cache-strategy.spec.ts`, `src/with-cache/cache.spec.ts`, `src/with-cache/with-cache.spec.ts`, `vitest.config.mjs`. Новые зависимости и другие spec id не добавлять.

## Доказательство

Наблюдение: промах и запись, ошибка Model без записи, немедленный stale-ответ, устойчивость к сбою фонового обновления, дедупликация параллельных update. Полный прогон `pnpm run test:units:fast` проходит вместе с reporter spec-coverage: все обязательные сценарии из `openspec/specs/` зарегистрированы.

Команды: `pnpm run test:units:fast`, `pnpm run test:types`.
