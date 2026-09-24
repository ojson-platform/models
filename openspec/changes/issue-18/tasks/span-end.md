# span-end

Сценарии этой задачи:

- End with a numeric end time
- Fail with a numeric end time
- End with no numeric end time
- Fail with no numeric end time
- End after the span has stopped recording
- Fail after the span has stopped recording

Якорь в `openspec/specs/span-end/spec.md` и `design.md`, раздел Technical prerequisites.

## Сделать

Зарегистрировать все шесть сценариев spec id `span-end` через `spec`, `requirement`, `scenario`. Заголовки Requirement и Scenario — дословно из `openspec/specs/span-end/spec.md` (заголовки на английском). Существующие `it` с теми же названиями в telemetry-спеках обернуть, сохранив тело.

Редактировать только: `src/with-telemetry/with-telemetry.spec.ts`. Другие spec id, зависимости, vitest не менять.

## Доказательство

Наблюдение: завершение и fail span с числовым и без числового end time, поведение после остановки записи span. Тройное имя из OpenSpec.

Команды: `pnpm run test:units:fast`, `pnpm run test:types`.
