# span-end-at-call

Scenarios:

- End with a numeric end time
- Fail with a numeric end time
- End with no numeric end time
- Fail with no numeric end time

## Сделать

- В `src/with-telemetry/with-telemetry.ts` в `wrapEnd` и `wrapFail`: пока span ещё recording, вызывать `span.end` с меткой времени момента обработки в telemetry, а не с `this.endTime` с контекста.
- Убрать выбор timestamp через `has(this, 'endTime', 'number')` для завершения span.
- Не менять запись ошибок, `setStatus` на fail, guard `isRecording()`, обёртки `create`/`call`/`request`.
- Не добавлять `endTime` в `BaseContext` и не менять поля жизненного цикла `Context`.
- Не переопределять правило прерывания из #11; при необходимости согласовать правки в том же модуле после #11.

## Доказательство

- Только `src/with-telemetry/with-telemetry.spec.ts` (можно читать импорты и хелперы из этого файла).
- На каждый Scenario — отдельный тест; имя теста содержит заголовок Scenario.
- Конец span проверять через span (аргументы `span.end` или поля span из тестового SDK), без приведения контекста к типу с `endTime`.
- Для сценариев с numeric end time — контекст, у которого `endTime` намеренно отличается от момента вызова `end`/`fail`, но реализует только `BaseContext` плюс обёртку `withModels`/`withTelemetry`.
- Для сценариев без numeric end time — контекст без поля `endTime`, только `BaseContext`.
- `pnpm run test:units:fast` и `pnpm run test:types` — exit 0.
