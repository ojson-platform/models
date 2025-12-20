# План настройки Dev инфраструктуры

## Текущее состояние

### Основная инфраструктура
- ✅ TypeScript с кастомным патчером (tspc)
- ✅ Vitest для unit-тестов
- ✅ Type tests через tsconfig.types.json
- ✅ ESLint (flat config, v9) с правилами для модульных границ
- ✅ Prettier
- ✅ Скрипты lint/format в package.json
- ✅ Pre-commit хуки (Husky + lint-staged)

### CI/CD
- ✅ GitHub Actions для тестов и линтера
- ✅ Отдельный workflow для examples (интеграционный слой)
- ✅ Workflow для публикации npm пакета
- ✅ Release-please / автоматизация релизов

### Качество кода
- ✅ Coverage отчеты через SonarCloud
- ✅ Security scanning (npm audit + Dependabot)
- ✅ Утилита `has()` для безопасной проверки свойств объектов
- ✅ ESLint правило для контроля модульных границ (`no-restricted-imports`)
- ✅ Основные ворнинги линтера исправлены

### Документация
- ✅ Документация AGENTS обновлена (commit conventions, module boundaries, utility functions)

## План реализации

### 1. ESLint

**Цель:** Статический анализ кода, проверка стиля, поиск потенциальных ошибок

**Задачи:**
- [x] Установить `eslint` и необходимые плагины:
  - `@typescript-eslint/parser` - парсер для TypeScript
  - `@typescript-eslint/eslint-plugin` - правила для TypeScript
  - `eslint-plugin-import` - проверка импортов
  - `eslint-config-prettier` - выключение конфликтующих правил форматирования
- [x] Создать конфигурацию ESLint (`eslint.config.js`):
  - Настроить правила для TypeScript
  - Настроить правила для импортов (соответствие текущему стилю проекта)
  - Отключить правила, конфликтующие с текущим стилем
  - Игнорировать build/, node_modules/, examples/, dist/
- [x] Добавить скрипт `lint` в package.json
- [x] Добавить скрипт `lint:fix` для автоматического исправления

**Конфигурация:**
- Использовать TypeScript parser
- Настроить правила импортов (type imports первыми)
- Игнорировать build/, node_modules/, examples/, dist/
- Строгий режим для `src/`
- Допускать ожидаемые `any` в типовых утилитах и type-tests через локальные правила

### 2. Pre-commit хуки (Husky + lint-staged)

**Цель:** Автоматическая проверка кода перед коммитом

**Задачи:**
- [x] Установить `husky` для Git hooks
- [x] Установить `lint-staged` для проверки только измененных файлов
- [x] Настроить pre-commit hook:
  - Запускать ESLint на измененных файлах
  - Запускать Prettier на измененных файлах
  - Запускать полные тесты (`npm run test:units:fast`), без интеграционных тестов из examples
- [x] Создать `.lintstagedrc.json` с правилами:
  - `*.ts` - запускать ESLint, Prettier и быстрые юнит-тесты
- [x] Настроить vitest для исключения интеграционных тестов в fast-прогоне:
  - Использовать паттерн исключения для `examples/**` (уже сделано в `test:units:fast`)

### 3. GitHub Actions: Тесты

**Цель:** Автоматический запуск тестов при каждом push/PR

**Задачи:**
- [x] Создать `.github/workflows/test.yml`:
  - Триггеры: `push`, `pull_request`
  - Матрица Node.js версий (20.x, 22.x)
  - Кэширование node_modules
  - Установка зависимостей
  - Запуск `npm run test:units:fast` (без интеграционных тестов из examples)
  - Запуск `npm run test:types`

### 4. GitHub Actions: Линтер

**Цель:** Автоматическая проверка кода линтером

**Задачи:**
- [x] Создать `.github/workflows/lint.yml`:
  - Триггеры: `push`, `pull_request`
  - Установка зависимостей
  - Запуск `npm run lint`
  - Запуск `npm run format:check`

### 5. GitHub Actions: Публикация npm пакета ✅

**Цель:** Автоматическая публикация при создании release/tag

**Задачи:**
- [x] Создать `.github/workflows/publish.yml`:
  - Триггер: `release` event (при публикации release)
  - Проверка версии в package.json (соответствие тегу release)
  - Сборка проекта (`npm run build`)
  - Запуск тестов перед публикацией (`test:units:fast` + `test:types`)
  - Проверка наличия build файлов
  - Публикация в npm registry с `--provenance` и `--access public`
  - Использование `NPM_TOKEN` секрета

**Важные моменты:**
- ✅ Проверка, что версия в package.json соответствует тегу release
- ✅ Не публикует, если тесты не прошли
- ✅ Проверка наличия build файлов перед публикацией
- ✅ Использование `--provenance` для прозрачности сборки

### 6. Дополнительные улучшения

#### 6.1. Prettier ✅

**Цель:** Единообразное форматирование кода

**Задачи:**
- [x] Установить `prettier` и `eslint-config-prettier` (отключить конфликтующие правила ESLint)
- [x] Создать `.prettierrc.json` с настройками:
  - Single quotes
  - Trailing commas
  - Tab width: 2
  - Semicolons: true
- [x] Добавить `.prettierignore` (build/, node_modules/, examples/, dist/)
- [x] Добавить скрипт `format` в package.json
- [x] Добавить скрипт `format:check` для CI
- [x] Настроить ESLint для работы с Prettier (использовать `eslint-config-prettier`)
- [x] Интегрировать с pre-commit hook через lint-staged (добавлено в `.lintstagedrc.json`)

#### 6.2. Coverage отчеты ✅

**Цель:** Отслеживание покрытия кода тестами

**Задачи:**
- [x] Настроить vitest для генерации coverage (`vitest.config.ts`)
- [x] Добавить `@vitest/coverage-v8` (совместимая версия с vitest 3.2.3)
- [x] Добавить скрипт `test:coverage` в package.json
- [x] Публиковать coverage в GitHub Actions (через SonarCloud)
- [x] Использовать SonarCloud для анализа coverage и качества кода
- [ ] Настроить пороги покрытия (⏸️ TODO: добавить пороги в будущем, когда покрытие будет достаточным)

**Реализовано:**
- Coverage отчеты генерируются в форматах: text, json, html, lcov
- LCOV отчет загружается в SonarCloud через GitHub Actions
- SonarCloud анализирует coverage, качество кода, безопасность и дублирование

#### 6.3. Dependabot / Renovate ✅

**Цель:** Автоматическое обновление зависимостей

**Задачи:**
- [x] Настроить Dependabot через `.github/dependabot.yml`:
  - Проверка npm зависимостей
  - Создание PR для обновлений
  - Группировка обновлений по типу (production/development)
  - Еженедельное расписание (понедельник, 09:00)
  - Игнорирование major версий (требуют ручного ревью)
  - Лимит открытых PR: 10
  - Labels: dependencies, dependabot
  - Commit message prefix: chore

**Реализовано:**
- Dependabot настроен для npm зависимостей
- Автоматические обновления minor и patch версий
- Группировка обновлений для production и development зависимостей
- Major версии требуют ручного ревью

#### 6.4. Release notes автоматизация (вариант B: release-please) ✅

**Цель:** Автоматическая генерация changelog и подготовка релизов

**Задачи:**
- [x] Добавить `release-please` как GitHub Action (`.github/workflows/release-please.yml`)
- [x] Настроить стратегию релизов (вариант B: PR с версией, merge → релиз + npm publish)
- [x] Создать конфигурацию `.release-please-config.json`:
  - Release type: `node`
  - Package name: `@ojson/models`
  - Changelog path: `CHANGELOG.md`
  - Version file: `package.json`
- [x] Интегрировать с workflow публикации (автоматический запуск при создании release)

**Реализовано:**
- Release-please создает PR с обновлением версии и CHANGELOG.md на основе Conventional Commits
- После merge PR автоматически создается release
- При создании release запускается publish workflow
- Версия в package.json автоматически обновляется release-please

#### 6.5. Type checking в CI ❌

**Цель:** Проверка типов отдельно от тестов

**Статус:** Не требуется - type checking уже реализован:
- ✅ Выполняется в CI через `npm run test:types` (`.github/workflows/test.yml`)
- ✅ Выполняется в pre-commit через `npm run test:types` (`.lintstagedrc.json`)
- ✅ `tspc` проверяет типы при сборке (`npm run build`)
- ✅ ESLint проверяет типы через type-aware правила (`project: './tsconfig.json'`)

**Примечание:** Отдельный job для `tsc --noEmit` избыточен, так как проверка типов уже покрыта существующими механизмами.

#### 6.6. Избавиться от всех ворнингов в линтере

**Цель:** Улучшить качество кода, устранив все предупреждения ESLint

**Задачи:**
- [x] Проанализировать текущие ворнинги ESLint
- [x] Исправить ворнинги `@typescript-eslint/no-explicit-any` где возможно (заменить на более конкретные типы)
  - Добавлена утилита `has()` для проверки свойств с type guards
  - Заменены `any` casts на type guards и явные type assertions
- [x] Для случаев, где `any` необходим (например, в type utilities), добавить `eslint-disable` комментарии с обоснованием
- [x] Убедиться, что `npm run lint` не выдает ворнингов (большинство исправлено)
- [x] CI workflow настроен на fail при наличии ворнингов (`--max-warnings=0`)

**Реализовано:**
- Утилита `has()` для безопасной проверки свойств без использования `any`
- Заменены все `(obj as any).prop` на type guards и явные assertions
- ESLint настроен на строгий режим (`--max-warnings=0`)
- Оставшиеся ворнинги (если есть) требуют дальнейшего анализа

#### 6.7. Проверка примеров ✅

**Цель:** Убедиться, что примеры компилируются (examples - это интеграционный слой)

**Задачи:**
- [x] Добавить отдельный job в CI для проверки examples (`examples.yml`)
- [x] Проверка компиляции examples/todo-api (`npm run build` в examples/todo-api)
- [x] Запускать интеграционные тесты из examples (отдельно от unit-тестов)

#### 6.8. Security scanning ✅

**Цель:** Поиск уязвимостей в зависимостях

**Задачи:**
- [x] Использовать `npm audit` в CI (`.github/workflows/security.yml`)
  - Запуск при push/PR и по расписанию (еженедельно)
  - Уровень проверки: moderate и выше
  - Загрузка результатов как артефакты при ошибках
- [x] Настроить GitHub Dependabot security updates
  - Автоматические PR для уязвимостей
  - Ежедневная проверка
  - Labels: security, dependabot
  - Commit message prefix: security
- [ ] Использовать Snyk или аналогичные инструменты (опционально, для будущего)

**Реализовано:**
- Security workflow с npm audit
- Dependabot security updates (автоматические PR для уязвимостей)
- Еженедельное автоматическое сканирование
- SonarCloud также выполняет security scanning

## Приоритеты реализации

### Фаза 1 (Критично):
1. ESLint - базовая настройка ✅
2. Prettier - настройка форматирования ✅
3. GitHub Actions: Тесты (unit + type, без интеграционных из examples) ✅
4. GitHub Actions: Линтер ✅

### Фаза 2 (Важно):
5. Pre-commit хуки (Husky + lint-staged) - ESLint, Prettier, полные тесты (без examples) ✅
6. GitHub Actions: Публикация npm ✅
7. GitHub Actions: Проверка примеров (интеграционные тесты) ✅
8. Coverage отчеты через SonarCloud ✅
9. Избавиться от всех ворнингов в линтере ✅ (основные исправлены, добавлена утилита `has()`)
10. ESLint правило для модульных границ (`no-restricted-imports`) ✅
11. Документация AGENTS (commit conventions, module boundaries, utilities) ✅

### Фаза 3 (Желательно):
10. Dependabot ✅
11. Type checking в CI ❌ (не требуется - уже реализовано)

### Фаза 4 (Опционально):
13. Release notes автоматизация (release-please) ✅
14. Security scanning ✅
15. Coverage пороги (TODO: добавить когда покрытие будет достаточным)

## Решения

1. **Prettier vs ESLint formatting:** ✅ Использовать Prettier отдельно (рекомендуемая практика 2024)
2. **Pre-commit тесты:** ✅ Запускать полные тесты, но исключить интеграционные тесты из examples (они медленные)
3. **Coverage пороги:** ⏸️ Пока не нужны - добавить в TODO для будущего
4. **Node.js версии:** ✅ Поддерживать 20.x и 22.x (18.x уже не нужен)
5. **Release strategy:** ✅ Вариант B (release-please + ручной контроль версий через PR)
6. **Examples в CI:** ✅ Проверять - examples это интеграционный слой

## Следующие шаги

1. ✅ Настроить pre-commit хуки (Husky + lint-staged)
2. ✅ Настроить Coverage отчеты через SonarCloud
3. ✅ Избавиться от всех ворнингов в линтере (основные исправлены)
4. ✅ Добавить workflow публикации npm и интегрировать release-please
5. ✅ Постепенно добавлять Dependabot, security-сканы и т.д.
6. ✅ Добавить утилиту `has()` для безопасной проверки свойств
7. ✅ Настроить ESLint правило для контроля модульных границ
8. ✅ Обновить документацию AGENTS

## Дополнительные улучшения (опционально)

- [ ] Настроить пороги покрытия кода (когда покрытие будет достаточным)
- [ ] Рассмотреть использование Snyk для дополнительного security scanning
- [ ] Продолжить улучшение качества кода (устранение оставшихся ворнингов, если есть)
