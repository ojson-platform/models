# План улучшения документации DeepWiki для `@ojson/models`

## Контекст

Мы используем DeepWiki для автогенерации “полноценной” документации по репозиторию `ojson-platform/models`.
Задача — улучшить следующую генерацию так, чтобы она:

- фокусировалась на **пакете `@ojson/models`**;
- опиралась на **канонические источники** (root `README.md`, `src/with-*/readme.md`, `docs/ADR/**`, `docs/AGENTS/**`);
- соответствовала принципам **Diátaxis** (tutorials / how-to guides / reference / explanation) ([Diátaxis](https://diataxis.fr/));
- улучшала навигацию: **перекрёстные ссылки вместо бессмысленного дублирования**.

Связанный steering-конфиг: `.devin/wiki.json`.

## Быстрая оценка текущей DeepWiki-выдачи (что уже хорошо)

- **Хорошее “вхождение”**: объясняет проблему/решение (declarative data retrieval + memoization), вводит `Context`, `Model`, `OJson`, `Registry`.
- **Нормальная карта модулей**: перечисляет `withModels`, `withCache`, `withTelemetry`, `withDeadline`, `withOverrides`, и даже дает порядок композиции.
- **Есть полезные упоминания инфраструктуры**: ESLint/Prettier/Vitest, workflow’ы, релизный процесс (release-please).

## Что в текущей DeepWiki обычно проседает (и что важно “застолбить”)

### 1) Diátaxis: перекос в Explanation/Reference и недостаток Tutorials

Сейчас генерация в основном попадает в:

- **Explanation**: объясняет “что это такое” и “почему так”;
- **Reference**: перечисляет сущности и API.

Но почти отсутствуют **Tutorials** — пошаговые сценарии, которые можно повторить и быстро почувствовать библиотеку “руками”.

**Решение**: в `.devin/wiki.json` явно задать раздел Tutorials с несколькими сценариями (см. ниже).

### 2) Недостаток связности: мало перекрёстных ссылок → лишнее дублирование

В местах, где пересекаются темы (например, interruption ↔ caching ↔ telemetry; или `ctx.set` ↔ request lifecycle), DeepWiki легко начинает повторять одно и то же разными словами.

Дублирование полезно, когда делает текст целостным, но вредно, когда “размазывает” один факт по 4 страницам и усложняет поддержку.

**Решение**: в repo notes и purpose страниц явно требовать:

- короткие “See also”/перекрёстные ссылки на страницу, где тема раскрыта глубже;
- минимизировать повтор, если это не нужно для самостоятельности страницы.

### 3) Не всегда попадают “острые углы” и конкретика реализации

Важно, чтобы документация явно подсвечивала:

- **периметр детерминизма**: “одинаковые props → одинаковый результат” и почему это критично;
- **границы JSON**: почему `props` — `OJson`, почему не тащим ORM-сущности в props/results;
- **ключи мемоизации**: `displayName` + `sign(props)` (включая поведение с `undefined`);
- **scoping registry**: новый registry **на каждый request lifecycle**, иначе утечки данных;
- **compose order**: `withModels` → (cache/overrides/telemetry) → `withDeadline`;
- **interruption semantics**: `kill()`, `isAlive()`, `InterruptedError`, и что “прерванное” никогда не кэшируется;
- **withTelemetry runtime constraints**: Node-only (ALS), требование `NodeSDK`, “не браузер”.

**Решение**: задать страницы (в Explanation/How-to) так, чтобы эти пункты были обязательными, а ADR’ы использовать как источники “почему” (внутри Explanation), но не выделять их отдельным “центральным разделом”.

### 4) Документация модулей уже есть — важно, чтобы DeepWiki не “конфликтовал” с ней

Фактически:

- root `README.md` и `src/with-*/readme.md` — уже хорошо структурированные user-facing гайды;
- `docs/AGENTS/**` — концентрированные технические пояснения и правила разработки;

DeepWiki должен **собирать из этого “оглавление и навигацию”**, а не изобретать альтернативную версию.

**Решение**: в `repo_notes` явно указать “canonical docs live here”.

## Идеи для Tutorials (что именно стоит добавить/сгенерировать)

- **Tutorial: First model + per-request context**: минимальный `withModels`, первый model, демонстрация memoization.
- **Tutorial: Express middleware integration + ctx.set**: wiring в сервер, request-dependent модели.
- **Tutorial: Add caching with CacheFirst**: TTL, кэш-хиты/миссы, короткий пример CacheProvider.
- **Tutorial: Add telemetry with OpenTelemetry (NodeSDK)**: инициализация SDK, фильтрация полей.
- **Tutorial: Add deadlines and handle interruption**: `withDeadline`, `InterruptedError`, взаимодействие с cache/telemetry.
- **Tutorial: Testing via withOverrides**: моки моделей, транзитивность A→B→C.
- **Tutorial: Generator models and nested generators**: отдельный tutorial именно про generators (чтобы не раздувать модульные статьи).
- (опционально) **How-to: Type-safe model attributes (defineModel helper)**: короткий гайд про `defineModel(name, impl, config?)` из `examples/todo-api`, чтобы показывать “правильное” объявление моделей в примерах без повторения `displayName`/типов.

## Что мы меняем перед следующей генерацией

- Добавлен `.devin/wiki.json`, который:
  - задает структуру по **Diátaxis**: Tutorials / How-to guides / Reference / Explanation;
  - добавляет требования к связности (перекрёстные ссылки вместо лишнего повторения);
  - фиксирует обязательные “острые углы” (`ctx.set`, interruption/cancellation, `sign()`/keying, registry scope, telemetry constraints).
  - описывает целевую структуру через **repo notes** (без `pages`), чтобы не упираться в лимит 30 страниц для явного списка страниц.
  - допускает отдельные **API Reference** страницы по модулям (Reference), если это улучшает навигацию/поиск и не приводит к дублированию; в этом случае в модульной странице достаточно краткого API overview + ссылки.
  - туториалы “приближаются” к модулям через явные перекрёстные ссылки (**Related tutorials / See also**).
  - дополнительно просит сохранять “Architecture & Design Patterns” уровень: основные принципы (composition, determinism, type-safe composition, separation of concerns, request isolation) и ключевые паттерны (layered caching, module boundaries, trade-offs). Если нужно — фиксируем это отдельным ADR (см. `docs/ADR/0008-architecture-principles.md`).
  - добавляет требования к **диаграммам**: C4 (L2/L3) для архитектурных Explanation-страниц и sequence/flow диаграммы для ключевых runtime-потоков (`ctx.request`, caching strategies, telemetry spans, deadlines).

## Предлагаемый следующий шаг: классифицировать текущие статьи DeepWiki по Diátaxis

Чтобы понять, какие страницы стоит разделить/объединить/убрать, удобнее начать с инвентаризации уже сгенерированного wiki и присвоить каждой странице квадрант Diátaxis.

Шаблон таблицы (заполняем по фактическому списку страниц текущей генерации DeepWiki):

| Страница | Diátaxis (T/H/R/E) | Проблема | Что делаем |
| --- | --- | --- | --- |
| … | … | … | … |

### Текущая структура DeepWiki (по меню текущей генерации) и что “потеряем” после перегенерации

Ниже — инвентаризация страниц текущей DeepWiki-версии. Под “потеряем” я понимаю **потерю отдельной страницы как самостоятельной единицы**: чаще всего контент не исчезнет, но **сольётся** в более крупную страницу/раздел или **переименуется**.

Легенда “Судьба”: **OK** (скорее сохранится как отдельная страница), **MERGE** (скорее станет разделом другой страницы), **RENAME** (скорее изменит название/расположение), **DROP** (высокий риск исчезновения как отдельной страницы).

| Страница (сейчас)                            | Diátaxis | Судьба      | Почему / что делать                                                                                                                            |
|----------------------------------------------|----------|-------------|------------------------------------------------------------------------------------------------------------------------------------------------|
| Overview                                     | E        | OK          | У нас явно есть “Overview (Explanation)” как целевой уровень.                                                                                  |
| Installation and Quick Start                 | H        | OK          | В notes есть “Installation & Quick start (How-to)”.                                                                                            |
| Key Concepts at a Glance                     | E        | MERGE       | Обычно сольётся в Overview/Core Concepts как “введение”.                                                                                       |
| Core Concepts                                | E        | OK          | Просим отдельный Explanation-уровень core concepts.                                                                                            |
| Context and BaseContext                      | E/R      | MERGE       | Вероятнее станет частью Core Concepts или module `withModels`.                                                                                 |
| Models                                       | E/R      | MERGE       | Вероятнее как раздел Core Concepts.                                                                                                            |
| OJson Type System                            | E/R      | MERGE       | Вероятнее как раздел Core Concepts + ссылки на `Types`/utils.                                                                                  |
| Memoization and Registry                     | E        | MERGE       | Вероятнее как раздел Core Concepts/withModels. В notes это важно — не должно пропасть, но может перестать быть отдельной страницей.            |
| withModels - Core Module                     | E        | OK/RENAME   | Мы просим “Module pages (Explanation) … withModels”. Название изменится, но смысл сохранится.                                                  |
| Request Lifecycle                            | E        | MERGE       | Вероятнее станет частью Overview (Request lifecycle & scoping) или Core Concepts.                                                              |
| Generator Support                            | E        | MERGE       | Мы хотим отдельный **Tutorial про generators**, поэтому текущая explanation-страница может слиться/переехать.                                  |
| Request-Dependent Models and ctx.set Pattern | E/H      | OK/RENAME   | С высокой вероятностью сохранится, т.к. это один из ключевых “острых углов” и есть How-to+Explanation требования.                              |
| Interruption and Error Handling              | E        | OK/RENAME   | В notes это отдельно подчеркнуто (Interruption & cancellation + interplay).                                                                    |
| withCache Module                             | E        | OK/RENAME   | Просим module page `withCache`.                                                                                                                |
| Cache Configuration                          | R        | MERGE/OK    | Может стать отдельной reference-страницей (мы разрешили API reference pages), но скорее будет разделом `withCache`.                            |
| Cache Strategies                             | E/R      | MERGE       | Почти наверняка раздел `withCache` (или отдельная reference).                                                                                  |
| CacheProvider Interface                      | R        | MERGE/OK    | Может быть отдельной reference-страницей; иначе — раздел `withCache`.                                                                          |
| Cache Class and Update Mechanism             | E/R      | MERGE       | Обычно уходит в “Advanced / Internals” раздел `withCache`.                                                                                     |
| Compression with zip Flag                    | E/H      | MERGE       | Скорее раздел `withCache` + ссылка на ADR 0007.                                                                                                |
| Cache Disable and Runtime Control            | H        | MERGE       | Скорее раздел `withCache` + отдельный How-to.                                                                                                  |
| withTelemetry Module                         | E        | OK/RENAME   | Просим module page `withTelemetry`.                                                                                                            |
| Setup and Configuration                      | H        | MERGE/OK    | Может быть отдельной how-to/reference, но вероятнее раздел `withTelemetry`.                                                                    |
| Span Creation and Lifecycle                  | E        | MERGE       | Обычно часть `withTelemetry` (explanation).                                                                                                    |
| Model Telemetry Configuration                | H/R      | MERGE       | Обычно часть `withTelemetry` + How-to “safe fields”.                                                                                           |
| Context Propagation and Events               | E        | MERGE       | Обычно часть `withTelemetry`/архитектуры.                                                                                                      |
| withDeadline Module                          | E        | OK/RENAME   | Просим module page `withDeadline`.                                                                                                             |
| withOverrides Module                         | E        | OK/RENAME   | Просим module page `withOverrides`.                                                                                                            |
| Module Composition                           | E        | OK/RENAME   | У нас есть “Modules (Explanation)” с композицией как центральной темой.                                                                        |
| Development Guide                            | H/E      | OK/RENAME   | Мы просим “Development & Testing (Explanation)”; возможно сольются под одним названием.                                                        |
| Project Structure                            | R        | MERGE       | Скорее раздел “Development & Testing”.                                                                                                         |
| Build System                                 | H/R      | MERGE       | Скорее раздел “Development & Testing”.                                                                                                         |
| Testing Strategy                             | H/E      | MERGE       | Скорее раздел “Development & Testing”.                                                                                                         |
| Code Quality Tools                           | R        | MERGE       | Скорее раздел “Development & Testing”.                                                                                                         |
| Coding Standards                             | R        | MERGE       | Скорее раздел “Development & Testing” + ссылка на `docs/AGENTS/style-and-testing.md`.                                                          |
| CI/CD and Release Process                    | H        | MERGE       | Скорее раздел “Development & Testing”.                                                                                                         |
| GitHub Actions Workflows                     | R        | MERGE       | Скорее часть CI/CD раздела.                                                                                                                    |
| Release Management with release-please       | H        | MERGE       | Скорее часть CI/CD раздела.                                                                                                                    |
| Package Publishing                           | H        | MERGE       | Скорее часть CI/CD раздела.                                                                                                                    |
| SonarCloud Integration                       | H        | MERGE       | Скорее часть CI/CD раздела.                                                                                                                    |
| Dependency Management                        | R/H      | MERGE       | Скорее часть Dev/CI раздела.                                                                                                                   |
| Architecture and Design Patterns             | E        | OK          | Мы явно попросили сохранять этот уровень и добавили ADR 0008.                                                                                  |
| Compositional Enhancement Pattern            | E        | MERGE       | Скорее станет подразделом “Architecture & Design Patterns”.                                                                                    |
| Layered Caching Strategy                     | E        | MERGE       | Скорее станет подразделом “Architecture & Design Patterns”.                                                                                    |
| Module Encapsulation and Boundaries          | E        | MERGE       | Скорее станет подразделом “Architecture & Design Patterns” + ссылка на `docs/AGENTS/helpers-and-architecture.md`.                              |
| Request Lifecycle Isolation                  | E        | MERGE       | Скорее станет подразделом “Architecture & Design Patterns” + ссылка на Overview/request scoping.                                               |
| API Reference (общая)                        | R        | RENAME/DROP | В новой схеме мы не фиксируем “одну общую” API reference страницу; вероятнее будут reference-подстраницы или reference-разделы внутри модулей. |
| Context API                                  | R        | MERGE       | Скорее станет частью reference по `Context`/`withModels`.                                                                                      |
| Model API                                    | R        | MERGE       | Скорее станет частью reference по `Model`/`withModels`.                                                                                        |
| Utility Functions                            | R        | OK/RENAME   | Мы хотим отдельную Utilities reference (или несколько).                                                                                        |
| Type Definitions                             | R        | MERGE/OK    | Может стать отдельной reference-страницей “Types”, но может и уйти в Utilities/Reference.                                                      |

Итог “что мы точно потеряем как отдельные страницы” при текущем steering: в первую очередь **мелкие подстраницы внутри модулей и Dev Guide** (Cache Configuration/Strategies/Provider Interface/Update mechanism/Telemetry subpages/CI subpages) — они, скорее всего, станут **разделами** крупных страниц. Это нормально, если мы добьёмся хороших **перекрёстных ссылок** и “See also”, чтобы навигация не ухудшилась.

Эвристики:

- **Tutorial**: пошагово, “сделай → получи результат”, минимум теории, есть runnable пример.
- **How-to**: узкая задача, предполагается базовое знание; “делай так”; ссылается на Explanation/Reference.
- **Reference**: точные определения/сигнатуры/параметры; без нарратива.
- **Explanation**: “почему так”, архитектура, rationale; может ссылаться на ADR как на источник.

## Критерии качества следующей генерации (чеклист)

- **Diátaxis баланс**: есть несколько понятных Tutorials, а How-to/Reference/Explanation не смешиваются по стилю.
- **Полнота по core**: есть отдельные разделы про `BaseContext` vs `Context`, `OJson/Json`, registry/keying (`sign`), `ctx.set`.
- **Полнота по helpers**: `withCache` (TTL/zip/disableCache/update), `withTelemetry` (NodeSDK/ALS/filters), `withOverrides` (транзитивность), `withDeadline` (race/kill/no-op).
- **Связность**: есть “See also” и перекрёстные ссылки; нет бессмысленного размазывания одинаковых фактов по многим страницам.
- **Gotchas**: явно написано про per-request registry и Node-only telemetry.

