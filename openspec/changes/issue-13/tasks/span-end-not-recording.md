# span-end-not-recording

Scenarios:

- End after the span has stopped recording
- Fail after the span has stopped recording

## Сделать

- В `src/with-telemetry/with-telemetry.spec.ts` закрепить оба Scenario: при `isRecording() === false` вызов `ctx.end()` или `ctx.fail()` не вызывает `span.end` повторно.
- При необходимости подправить `src/with-telemetry/with-telemetry.ts`, только если после `span-end-at-call` guard `isRecording()` перестаёт соответствовать delta; семантику «не трогать уже завершённый span» не расширять.
- Не менять правила ERROR status и событий ошибки, когда span не recording.

## Доказательство

- Только `src/with-telemetry/with-telemetry.spec.ts` и при необходимости `src/with-telemetry/with-telemetry.ts`.
- На каждый Scenario — отдельный тест; имя теста содержит заголовок Scenario.
- Перед `end`/`fail` span не recording (mock `isRecording` или реальный lifecycle после первого завершения); проверить, что `span.end` не вызывается на втором lifecycle-вызове.
- `pnpm run test:units:fast` и `pnpm run test:types` — exit 0.
