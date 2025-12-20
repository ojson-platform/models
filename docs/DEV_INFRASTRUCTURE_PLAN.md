# План настройки Dev инфраструктуры

## Текущее состояние

- ✅ TypeScript с кастомным патчером (tspc)
- ✅ Vitest для unit-тестов
- ✅ Type tests через tsconfig.types.json
- ✅ ESLint (flat config, v9)
- ✅ Prettier
- ✅ Скрипты lint/format в package.json
- ✅ GitHub Actions для тестов и линтера
- ✅ Отдельный workflow для examples (интеграционный слой)
- ✅ Pre-commit хуки (Husky + lint-staged)
- ✅ Coverage отчеты через SonarCloud
- ❌ Нет workflow для публикации npm пакета
- ❌ Нет release-please / автоматизации релизов

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

### 5. GitHub Actions: Публикация npm пакета

**Цель:** Автоматическая публикация при создании release/tag

**Задачи:**
- [ ] Создать `.github/workflows/publish.yml`:
  - Триггер: `release` event или tag `v*`
  - Проверка версии в package.json
  - Сборка проекта (`npm run build`)
  - Запуск тестов перед публикацией
  - Публикация в npm registry
  - Использование `NPM_TOKEN` секрета
  - Условная публикация (только для main/master ветки)

**Важные моменты:**
- Проверять, что версия в package.json соответствует тегу
- Не публиковать, если тесты не прошли
- Использовать `npm publish --dry-run` для проверки перед реальной публикацией

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

#### 6.3. Dependabot / Renovate

**Цель:** Автоматическое обновление зависимостей

**Задачи:**
- [ ] Настроить Dependabot через `.github/dependabot.yml`:
  - Проверка npm зависимостей
  - Создание PR для обновлений
  - Группировка обновлений (опционально)
- [ ] Или использовать Renovate (более гибкий)

#### 6.4. Release notes автоматизация (вариант B: release-please)

**Цель:** Автоматическая генерация changelog и подготовка релизов

**Задачи:**
- [ ] Добавить `release-please` как GitHub Action
- [ ] Настроить стратегию релизов (вариант B: PR с версией, merge → релиз + npm publish)
- [ ] Интегрировать с workflow публикации

#### 6.5. Type checking в CI

**Цель:** Проверка типов отдельно от тестов

**Задачи:**
- [ ] Добавить отдельный job в workflow для type checking (опционально, сверх `test:types`)
- [ ] Использовать `tsc --noEmit` для проверки типов

#### 6.6. Избавиться от всех ворнингов в линтере

**Цель:** Улучшить качество кода, устранив все предупреждения ESLint

**Задачи:**
- [ ] Проанализировать текущие ворнинги ESLint
- [ ] Исправить ворнинги `@typescript-eslint/no-explicit-any` где возможно (заменить на более конкретные типы)
- [ ] Для случаев, где `any` необходим (например, в type utilities), добавить `eslint-disable` комментарии с обоснованием
- [ ] Убедиться, что `npm run lint` не выдает ворнингов
- [ ] Обновить CI workflow для fail при наличии ворнингов (опционально)

#### 6.7. Проверка примеров ✅

**Цель:** Убедиться, что примеры компилируются (examples - это интеграционный слой)

**Задачи:**
- [x] Добавить отдельный job в CI для проверки examples (`examples.yml`)
- [x] Проверка компиляции examples/todo-api (`npm run build` в examples/todo-api)
- [x] Запускать интеграционные тесты из examples (отдельно от unit-тестов)

#### 6.8. Security scanning

**Цель:** Поиск уязвимостей в зависимостях

**Задачи:**
- [ ] Использовать `npm audit` в CI
- [ ] Или использовать GitHub Dependabot security updates
- [ ] Использовать Snyk или аналогичные инструменты (опционально)

## Приоритеты реализации

### Фаза 1 (Критично):
1. ESLint - базовая настройка ✅
2. Prettier - настройка форматирования ✅
3. GitHub Actions: Тесты (unit + type, без интеграционных из examples) ✅
4. GitHub Actions: Линтер ✅

### Фаза 2 (Важно):
5. Pre-commit хуки (Husky + lint-staged) - ESLint, Prettier, полные тесты (без examples) ✅
6. GitHub Actions: Публикация npm
7. GitHub Actions: Проверка примеров (интеграционные тесты) ✅
8. Coverage отчеты через SonarCloud ✅
9. Избавиться от всех ворнингов в линтере

### Фаза 3 (Желательно):
10. Dependabot
11. Type checking в CI

### Фаза 4 (Опционально):
13. Release notes автоматизация (release-please)
14. Security scanning
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
3. Избавиться от всех ворнингов в линтере
4. Добавить workflow публикации npm и интегрировать release-please
5. Постепенно добавлять Dependabot, security-сканы и т.д.
