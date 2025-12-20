# Настройка Coverage отчетов

## Обзор

Coverage отчеты показывают, какой процент кода покрыт тестами. Это помогает:
- Найти непокрытые участки кода
- Отслеживать изменения покрытия со временем
- Убедиться, что новые изменения не снижают покрытие

## Настройка Vitest Coverage

### 1. Установка

```bash
npm install --save-dev @vitest/coverage-v8
```

### 2. Конфигурация

Vitest автоматически использует coverage-v8, если он установлен. Можно настроить через:
- `vitest.config.ts` (если есть)
- Или через флаги командной строки
- Или через переменные окружения

**Рекомендуемый подход:** Создать `vitest.config.ts`:

```typescript
import {defineConfig} from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'build/',
        'examples/',
        'dist/',
        '**/*.spec.ts',
        '**/*.test.ts',
        '**/__tests__/**',
      ],
    },
  },
});
```

### 3. Скрипты в package.json

```json
{
  "scripts": {
    "test:coverage": "vitest --run --coverage",
    "test:coverage:watch": "vitest --coverage"
  }
}
```

## Публикация Coverage в GitHub Actions

Есть два основных подхода:

### Вариант 1: Публикация артефактов (простой)

**Как работает:**
- Генерируем coverage отчеты (HTML, JSON, LCOV)
- Сохраняем их как GitHub Actions artifacts
- Можно скачать и посмотреть локально

**Плюсы:**
- Не требует внешних сервисов
- Простая настройка
- Работает сразу

**Минусы:**
- Нет автоматических комментариев в PR
- Нет истории изменений покрытия
- Нет бейджей в README

**Пример workflow:**
```yaml
- name: Run tests with coverage
  run: npm run test:coverage

- name: Upload coverage reports
  uses: actions/upload-artifact@v4
  with:
    name: coverage-reports
    path: coverage/
    retention-days: 30
```

### Вариант 2: Codecov (рекомендуется)

**Как работает:**
1. Генерируем LCOV отчет
2. Загружаем его в Codecov через их GitHub Action
3. Codecov анализирует и показывает:
   - Coverage в комментариях к PR
   - Графики изменения покрытия
   - Diff coverage (покрытие только измененных строк)
   - Бейджи для README

**Плюсы:**
- ✅ Автоматические комментарии в PR с diff coverage
- ✅ История изменений покрытия
- ✅ Красивые графики и визуализация
- ✅ Бейджи для README
- ✅ Бесплатно для open source проектов
- ✅ Хорошая интеграция с GitHub
- ✅ Поддержка нескольких языков и форматов

**Минусы:**
- Требует регистрацию на codecov.io (но бесплатно для open source)
- Нужен токен (но Codecov Action может использовать GitHub token)

**Пример workflow:**
```yaml
- name: Run tests with coverage
  run: npm run test:coverage

- name: Upload coverage to Codecov
  uses: codecov/codecov-action@v4
  with:
    files: ./coverage/lcov.info
    flags: unittests
    name: codecov-umbrella
    fail_ci_if_error: false  # Не падать CI если загрузка не удалась
```

### Вариант 3: Coveralls

**Как работает:**
Аналогично Codecov, но через сервис Coveralls.

**Плюсы:**
- Автоматические комментарии в PR
- История изменений
- Бейджи

**Минусы:**
- ❌ Менее популярный (меньше активной разработки)
- ❌ Менее удобный интерфейс
- ❌ Меньше функций (например, хуже diff coverage)
- ❌ Может требовать платную подписку для некоторых функций

## Альтернативы Codecov

### 1. Coveralls
**Описание:** Классический сервис для coverage reporting, один из первых в этой области.

**Особенности:**
- Автоматические комментарии в PR
- История изменений покрытия
- Бейджи для README
- Бесплатно для open source

**Минусы:**
- Менее популярный сейчас
- Устаревший интерфейс
- Медленнее развивается
- Хуже diff coverage

**GitHub Action:** `coverallsapp/github-action@v2`

### 2. SonarQube / SonarCloud
**Описание:** Платформа для анализа качества кода, включает coverage как часть более широкого анализа.

**Особенности:**
- ✅ Не только coverage, но и качество кода, безопасность, дублирование
- ✅ Очень мощная платформа
- ✅ Отличная интеграция с GitHub
- ✅ Бесплатно для open source (SonarCloud)

**Минусы:**
- ❌ Избыточно, если нужен только coverage
- ❌ Более сложная настройка
- ❌ Может быть медленнее

**GitHub Action:** `SonarSource/sonarcloud-github-action`

### 3. Codacy
**Описание:** Инструмент для автоматического анализа кода, включает coverage.

**Особенности:**
- ✅ Анализ качества кода + coverage
- ✅ Автоматические комментарии в PR
- ✅ Бесплатно для open source

**Минусы:**
- ❌ Меньше фокуса на coverage, больше на качестве кода
- ❌ Менее популярный для pure coverage

**GitHub Action:** `codacy/codacy-analysis-cli-action`

### 4. GitHub Actions Artifacts (самостоятельное решение)
**Описание:** Просто сохраняем отчеты как artifacts, можно добавить комментарии через GitHub API.

**Особенности:**
- ✅ Не требует внешних сервисов
- ✅ Полный контроль
- ✅ Можно добавить комментарии в PR через GitHub API

**Минусы:**
- ❌ Нужно писать свой скрипт для комментариев
- ❌ Нет автоматической истории
- ❌ Нет готовых бейджей

**Пример:** Использовать `actions/upload-artifact` + кастомный скрипт для комментариев

### 5. Собственное решение через GitHub API
**Описание:** Генерируем отчеты локально и публикуем комментарии в PR через GitHub API.

**Особенности:**
- ✅ Полный контроль над форматом и содержанием
- ✅ Не зависит от внешних сервисов
- ✅ Можно кастомизировать под свои нужды

**Минусы:**
- ❌ Нужно писать и поддерживать код
- ❌ Нет готовой инфраструктуры
- ❌ Больше работы

**Пример:** Использовать `lcov-parse` для парсинга LCOV и GitHub API для комментариев

## Сравнение всех вариантов

| Функция | Codecov | Coveralls | SonarCloud | Codacy | Artifacts | Custom |
|---------|---------|-----------|------------|--------|-----------|--------|
| **Популярность** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | - | - |
| **Простота настройки** | ✅✅✅ | ✅✅✅ | ✅✅ | ✅✅ | ✅✅✅ | ❌ |
| **Diff Coverage** | ✅✅✅ | ✅ | ✅✅ | ✅ | ❌ | ✅ (если сделать) |
| **Комментарии в PR** | ✅✅✅ | ✅✅ | ✅✅✅ | ✅✅ | ❌ (нужен скрипт) | ✅ (нужен скрипт) |
| **История** | ✅✅✅ | ✅✅ | ✅✅✅ | ✅✅ | ❌ | ❌ |
| **Бейджи** | ✅✅✅ | ✅✅ | ✅✅ | ✅✅ | ❌ | ❌ |
| **Бесплатно OSS** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Доп. функции** | Coverage | Coverage | Quality+Security | Quality | - | - |
| **Зависимость от сервиса** | Да | Да | Да | Да | Нет | Нет |

## Рекомендация

### Для pure coverage reporting: **Codecov**
**Причины:**
1. Более популярный и активно развивающийся
2. Лучший diff coverage (показывает покрытие только измененных строк)
3. Более современный и удобный интерфейс
4. Лучшая документация и поддержка
5. Бесплатно для open source проектов
6. Простая настройка

### Если нужен анализ качества кода: **SonarCloud**
**Причины:**
1. Не только coverage, но и качество кода, безопасность, дублирование
2. Очень мощная платформа
3. Отличная интеграция с GitHub
4. Бесплатно для open source

### Если не хотите внешние сервисы: **GitHub Artifacts + Custom Script**
**Причины:**
1. Полный контроль
2. Не зависит от внешних сервисов
3. Можно добавить комментарии через GitHub API
4. Но требует больше работы для настройки

## Настройка Codecov

### Шаг 1: Регистрация (опционально)

Для публичных репозиториев регистрация не обязательна - Codecov Action может работать с GitHub token.

Для приватных репозиториев нужен токен из codecov.io.

### Шаг 2: Добавить в workflow

```yaml
- name: Upload coverage to Codecov
  uses: codecov/codecov-action@v4
  with:
    files: ./coverage/lcov.info
    fail_ci_if_error: false
```

### Шаг 3: Добавить бейдж в README (опционально)

```markdown
[![codecov](https://codecov.io/gh/username/repo/branch/main/graph/badge.svg)](https://codecov.io/gh/username/repo)
```

## Пример полной настройки

### 1. vitest.config.ts
```typescript
import {defineConfig} from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'build/',
        'examples/',
        'dist/',
        '**/*.spec.ts',
        '**/__tests__/**',
      ],
    },
  },
});
```

### 2. package.json scripts
```json
{
  "scripts": {
    "test:coverage": "vitest --run --coverage"
  }
}
```

### 3. GitHub Actions workflow
```yaml
- name: Run tests with coverage
  run: npm run test:coverage

- name: Upload coverage to Codecov
  uses: codecov/codecov-action@v4
  with:
    files: ./coverage/lcov.info
    fail_ci_if_error: false
```

## Пороги покрытия (будущее)

Когда покрытие будет достаточным, можно добавить пороги:

```typescript
coverage: {
  thresholds: {
    lines: 80,
    functions: 80,
    branches: 80,
    statements: 80,
  },
}
```

Это заставит тесты падать, если покрытие ниже порога.

