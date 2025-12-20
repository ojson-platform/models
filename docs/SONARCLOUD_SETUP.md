# Настройка SonarCloud

## Что уже настроено локально

✅ **Установлен `@vitest/coverage-v8`** - для генерации coverage отчетов  
✅ **Создан `vitest.config.ts`** - конфигурация для coverage  
✅ **Добавлен скрипт `test:coverage`** - запуск тестов с coverage  
✅ **Создан `sonar-project.properties`** - базовая конфигурация SonarCloud  
✅ **Создан GitHub Actions workflow** - `.github/workflows/sonarcloud.yml`

## Что нужно сделать на SonarCloud

### 1. Регистрация и создание проекта

1. Зайдите на [sonarcloud.io](https://sonarcloud.io)
2. Войдите через GitHub
3. Создайте новую организацию (или используйте существующую)
4. Создайте новый проект:
   - Выберите "Analyze new project"
   - Выберите ваш репозиторий
   - SonarCloud автоматически создаст `sonar-project.properties` (но мы уже создали свой)

### 2. Получение токена

1. В SonarCloud перейдите в **My Account** → **Security**
2. Создайте новый токен (например, `github-actions`)
3. **Скопируйте токен** (он показывается только один раз!)

### 3. Настройка GitHub Secrets

1. В вашем GitHub репозитории перейдите в **Settings** → **Secrets and variables** → **Actions**
2. Нажмите **New repository secret**
3. Добавьте:
   - **Name:** `SONAR_TOKEN`
   - **Value:** токен из SonarCloud
4. Сохраните

### 4. Обновление sonar-project.properties

После создания проекта в SonarCloud, вам нужно обновить `sonar.organization` и `sonar.projectKey` в `sonar-project.properties`:

1. В SonarCloud найдите ваш проект
2. Перейдите в **Project Settings** → **Information**
3. Скопируйте:
   - **Organization Key** (например, `your-org` или `username`)
   - **Project Key** (например, `your-org_ojson-models`)
4. Обновите значения в `sonar-project.properties`

**Пример:**
```properties
sonar.organization=your-org
sonar.projectKey=your-org_ojson-models
```

**Важно:** `sonar.organization` - обязательный параметр. Если он не указан, SonarCloud выдаст ошибку.

## Проверка локально

### Генерация coverage отчетов

Для SonarCloud используется скрипт, который исключает интеграционные тесты из examples:

```bash
npm run test:coverage:fast
```

Этот скрипт исключает `examples/**` из тестов, так как они требуют дополнительных зависимостей (например, express), которые установлены только в `examples/todo-api/package.json`.

Для полного coverage (включая examples) можно использовать:

```bash
npm run test:coverage
```

Это создаст:
- `coverage/lcov.info` - для SonarCloud
- `coverage/index.html` - для просмотра локально
- `coverage/coverage-final.json` - JSON отчет

### Просмотр coverage локально

Откройте `coverage/index.html` в браузере для визуализации покрытия.

## Как это работает

1. **GitHub Actions запускается** при push/PR
2. **Устанавливаются зависимости** и запускаются тесты с coverage
3. **Генерируется LCOV отчет** (`coverage/lcov.info`)
4. **SonarCloud Action** загружает отчет и анализирует код
5. **Результаты появляются** в SonarCloud и в комментариях к PR

**Важно:** В workflow используется `SonarSource/sonarqube-scan-action@v7.0.0` (новый action, заменивший устаревший `sonarcloud-github-action`). Используется конкретная версия тега для безопасности, чтобы избежать неожиданных изменений.

## Что анализирует SonarCloud

- ✅ **Coverage** - покрытие кода тестами
- ✅ **Code Quality** - качество кода, code smells
- ✅ **Security** - уязвимости безопасности
- ✅ **Maintainability** - поддерживаемость кода
- ✅ **Reliability** - надежность (bugs)
- ✅ **Duplications** - дублирование кода

## Комментарии в PR

SonarCloud автоматически добавляет комментарии в Pull Requests с:
- Изменением coverage
- Найденными проблемами качества кода
- Рекомендациями по улучшению

## Бейджи

После настройки можно добавить бейдж в README:

```markdown
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=your-org_ojson-models&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=your-org_ojson-models)
```

## Troubleshooting

### Coverage не отображается

1. Проверьте, что `coverage/lcov.info` создается
2. Проверьте путь в `sonar-project.properties`: `sonar.typescript.lcov.reportPaths=coverage/lcov.info`
3. Убедитесь, что токен правильный

### Ошибка "Project not found"

1. Проверьте `sonar.projectKey` в `sonar-project.properties`
2. Убедитесь, что проект создан в SonarCloud
3. Проверьте права доступа токена

### Coverage показывает 0%

1. Проверьте `sonar.exclusions` - возможно, все файлы исключены
2. Убедитесь, что `sonar.sources=src` указывает на правильную директорию
3. Проверьте, что тесты действительно запускаются

### Предупреждение "You are running CI analysis while Automatic Analysis is enabled"

Это предупреждение появляется, когда включены и CI анализ (через GitHub Actions), и автоматический анализ SonarCloud.

**Решение:** Отключите автоматический анализ, так как мы используем CI анализ:

1. В SonarCloud перейдите в ваш проект
2. Откройте **Project Settings** → **Analysis Method**
3. Выберите **With GitHub Actions** (или **CI/CD Integration**)
4. Отключите **Automatic Analysis** (если включен)
5. Сохраните изменения

Теперь анализ будет запускаться только через GitHub Actions workflow, что более предсказуемо и контролируемо.

## Дополнительные настройки

### Исключение файлов из анализа

В `sonar-project.properties`:
```properties
sonar.exclusions=**/*.spec.ts,**/__tests__/**,build/**,examples/**
```

### Исключение правил для конкретных файлов

Если нужно исключить определенное правило для конкретного файла (например, для type tests):

```properties
# Ignore S2699 (tests without assertions) for type tests
# Type tests validate types at compile time, not runtime, so they don't need runtime assertions
sonar.issue.ignore.multicriteria=e1
sonar.issue.ignore.multicriteria.e1.ruleKey=typescript:S2699
sonar.issue.ignore.multicriteria.e1.resourceKey=**/types.spec.ts
```

Это полезно для type tests, которые проверяют типы на этапе компиляции, а не во время выполнения.

### Настройка порогов качества

В SonarCloud: **Project Settings** → **Quality Gates**
- Можно настроить минимальные пороги для coverage, code smells и т.д.

### Локальный анализ (опционально)

Можно установить SonarScanner локально для анализа без CI:

```bash
# Установка SonarScanner (через npm)
npm install -g sonarqube-scanner

# Запуск анализа
sonar-scanner
```

Но для большинства случаев достаточно GitHub Actions.

