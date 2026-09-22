# disable-cache-refresh

- Обновление не кэширует снова без фабрики вызывающего

## Сделать

Убрать у вызывающего обязанность передавать фабрику запроса ради выключения кэша во фоновом обновлении stale-while-revalidate. Модуль сам создаёт контекст для `Cache.update` и держит кэш выключенным на время выполнения Model внутри обновления, даже когда у запроса, который запустил обновление, кэш включён. Запись, которую кладёт само обновление через шов хранилища, остаётся.

Не трогать: монотонное `disableCache` у вызывающего и его потомков; стратегии и сценарии вне named Scenario; правило прерывания (#11) и ключ Model (#10) — только опираться на них там, где код уже это делает.

Файлы, которые можно менять:

- `src/with-cache/with-cache.ts`
- `src/with-cache/cache.ts`
- `src/with-cache/types.ts`
- `src/with-cache/cache-strategy.spec.ts`
- `src/with-cache/with-cache.spec.ts`
- `src/with-cache/cache.spec.ts`
- `src/with-telemetry/with-telemetry.spec.ts`
- `src/types.spec.ts`

## Доказательство

Тест через `withCache` и `ctx.request`, хранилище — `TrackingCacheProvider` из `src/with-cache/__tests__/cache-provider.ts`. Имя теста содержит заголовок Scenario «Обновление не кэширует снова без фабрики вызывающего».

Наблюдения:

- После прогрева кэша второй запрос (другой контекст, stale-while-revalidate, кэш у вызывающего не выключали) сразу получает сохранённое значение.
- Пока выполняется Model внутри фонового обновления, у провайдера нет новых `get` и нет `set` от стратегии кэша на этом прогоне; после завершения обновления хранилище всё же получает новую запись обновления (как в существующих SWR-тестах на шов).

Можно читать для образца, не менять без необходимости: `src/with-cache/cache-strategy.ts`, `src/with-cache/__tests__/cache-provider.ts`.

Проверки: `pnpm run test:units:fast`, `pnpm run test:types`.
