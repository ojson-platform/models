# model-identity

Сценарии этой задачи:

- Повтор в одном запросе не выполняет Model
- Порядок свойств не различает вызов
- Другое имя или другие props — другая идентичность
- Кэш хранит вызов под этим текстом
- Необязательное свойство undefined совпадает с пропуском
- Вложенный undefined не доходит до Model
- Предустановка с undefined находится обращением без свойства
- Кэш соединяет пропуск свойства и undefined
- null, false, ноль и пустая строка отличают вызов
- Обращение и предустановка без имени отвергаются
- Кэш не даёт идентичность Model без имени
- Пустое имя не получает идентичность
- Без props мемоизация передаёт пустой объект
- Предустановка без props находится таким же обращением
- Кэш без props берёт ключ пустого объекта
- Один ответ содержит прежний ключ и props
- Пропуск свойства и undefined — один ответ
- Вложенный undefined не входит в ответ
- null, false, ноль и пустая строка остаются в ответе

Якорь в `openspec/specs/model-identity/spec.md` и `design.md`, раздел Technical prerequisites.

## Сделать

Зарегистрировать все девятнадцать сценариев spec id `model-identity` через `spec`, `requirement`, `scenario`. Заголовки — из `openspec/specs/model-identity/spec.md`. Существующие тесты с заголовками сценариев в `src/model-identity.spec.ts` обернуть; недостающие сценарии покрыть новыми тестами в `src/model-identity.spec.ts` или `src/with-models/with-models.spec.ts`, не создавая новых файлов.

Редактировать только: `src/model-identity.spec.ts`, `src/with-models/with-models.spec.ts`. Продакшен-код, зависимости, vitest, другие spec id не менять.

## Доказательство

Наблюдение: ключ и props через `modelIdentity`, мемоизация, `ctx.set`, межзапросный кэш, отказ для Model без имени, пустой объект props, нормализация undefined. Тексты сценариев совпадают с OpenSpec.

Команды: `pnpm run test:units:fast`, `pnpm run test:types`.
