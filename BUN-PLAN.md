# Plan: Migrate nike-release-checker to latest Bun

## Context

Сейчас проект — npm-monorepo на Node.js v24.14.0 (`tsx` для запуска TS, `node --test` с `mock.module`, `rspack` → Node SEA + `postject` + `sharp` через кастомный native-bootstrap, npm workspaces). Бранч `node-26-migration` уже трогает `.nvmrc`/`package.json` и содержит черновой `PLAN.md` (удалённый в staged-стейте) — миграция назрела.

Цель — заменить Node-тулчейн на Bun целиком: runtime + package manager + `bun:test` + `bun build --compile` вместо SEA. Поддержка macOS (arm64) и Windows (x64) бинарника обязательна. Persistent `localStorage` (`local.db`) сохраняем через Bun, не SQLite-адаптер.

Главные риски: `sharp` (NAPI) внутри `bun build --compile`; точное поведение `mock.module` в `bun:test` относительно `node:test`; Windows cross-compile из macOS.

## High-level mapping (Node → Bun)

| Сейчас | Станет |
|---|---|
| `tsx src/index.tsx` | `bun src/index.tsx` |
| `node --test --experimental-test-module-mocks` | `bun test` |
| `node:test`, `mock.method`, `mock.module` | `bun:test` `test/describe/it`, `spyOn`/`mock`, `mock.module` |
| `--experimental-webstorage --localstorage-file=local.db` | `bunfig.toml` → `[run] localStorageFile = "local.db"` (см. Risk R1) |
| `node --watch-path=./src` | `bun --watch` |
| `node --inspect-brk --experimental-network-inspection` | `bun --inspect-brk` |
| `cross-env LOG_LEVEL=debug` | `LOG_LEVEL=debug bun …` (Bun ставит env кроссплатформенно) |
| `rspack` + Node SEA + `postject` + `sea-native-bootstrap.cjs` | `bun build --compile --target=bun-darwin-arm64 \| bun-windows-x64` |
| `npm ci` / `package-lock.json` | `bun install --frozen-lockfile` / `bun.lock` |
| `actions/setup-node@v6` (`.nvmrc`) | `oven-sh/setup-bun@v2` (`.bun-version` или `packageManager`) |

## Phase A — Foundation

**Файлы:** root `package.json`, `bunfig.toml` (новый), `.bun-version` (новый), `.nvmrc` (удалить в конце), `package-lock.json` (удалить), `tsconfig.json`.

1. Зафиксировать целевую версию Bun (например `1.3.x`) в `.bun-version` и `packageManager: "bun@x.y.z"` в root `package.json`.
2. Создать `bunfig.toml`:
   ```toml
   [install]
   frozenLockfile = false  # переопределяется --frozen-lockfile в CI

   [test]
   # preload = ["./test-setup.ts"]  # если потребуется глобальный setup

   [run]
   # persistent Web Storage (см. R1 — точное имя ключа уточнить
   # https://bun.com/docs/runtime/web-apis#localstorage)
   ```
3. `bun install` → сгенерировать `bun.lock`, удалить `package-lock.json`.
4. Из root `package.json`:
   - убрать `engines.node`, добавить `engines.bun: ">=1.3.0"`;
   - оставить `workspaces` (Bun поддерживает нативно);
   - script-команды `npm run X --workspace …` → `bun --filter @nike-release-checker/cli run X`.
5. `tsconfig.json` менять не нужно — Bun уважает `allowImportingTsExtensions`, `verbatimModuleSyntax`, `erasableSyntaxOnly`. Только заменить `"types": ["node"]` → `"types": ["bun"]` и установить `@types/bun` (вместо `@types/node`).

## Phase B — Runtime scripts (CLI + SDK)

**Файлы:** `packages/cli/package.json:7-22`, `packages/sdk/package.json:21-35`.

- `start`: `tsx --experimental-webstorage --localstorage-file=local.db --no-warnings src/index.tsx` → `bun src/index.tsx` (флаги переезжают в `bunfig.toml`).
- `start:mock`: `bun src/devEntry.ts`.
- `start:debug`: `LOG_LEVEL=debug bun src/index.tsx`.
- `start:devtools-debug`: `bun --inspect-brk src/index.tsx` (network-inspection в Bun уже включён в DevTools-интеграцию; печать инструкции про `chrome://inspect` оставить).
- `start:watch`: `bun --watch src/index.tsx`.
- `build:check`: `bun dist/<binary>` (см. Phase D).
- `test` (CLI): `bun test`. Удалить флаг `--experimental-test-module-mocks` и `--experimental-webstorage --localstorage-file=test.db --no-warnings`.
- `test` (SDK): `bun test`.
- Тестовое покрытие: `bun test --coverage` заменяет `--experimental-test-coverage` и `--test-coverage-exclude` (см. R3).
- `regen:fixtures:*` и `check-product-feed`: `bun scripts/check-product-feed.ts` etc.
- `lint:prettier`: префиксы `bun run` — без изменений по сути.
- Удалить из devDeps: `tsx`, `cross-env` (и `@rspack/cli`, `@rspack/core` — см. Phase D).

## Phase C — Tests (node:test → bun:test)

**Файлы** (9 шт.):
- `packages/cli/src/utils/isEmpty.test.ts`
- `packages/cli/src/hooks/useInputProcess.test.ts`
- `packages/cli/src/store/country.test.ts`
- `packages/cli/src/store/product.test.ts` ⚠ использует `mock.module` (lines 77, 86, 95)
- `packages/sdk/utils/{jsonRequest,HttpError,delay,Error}.test.ts`
- `packages/sdk/productFeed/format.test.ts`

**Замены:**
- `import { test, describe, mock } from 'node:test'` → `import { test, describe, mock, spyOn, expect } from 'bun:test'`.
- `import assert from 'node:assert/strict'` → заменить на `expect()` из `bun:test` (Jest-API). Пройти по каждому файлу и переписать `assert.equal/deepEqual/throws/…` → `expect(…).toBe/toEqual/toThrow/…`.
- `mock.method(obj, 'fn', impl)` → `spyOn(obj, 'fn').mockImplementation(impl)`.
- `mock.method(obj, 'fn')` (без impl, spy-without-noop из памяти feedback) → `spyOn(obj, 'fn')` (по умолчанию вызовы проходят к оригиналу).
- `mock.module('./country.ts', () => ({...}))` → `mock.module('./country.ts', () => ({...}))` (имя идентично, но Bun рекомендует preload-файл для гарантированного перехвата до импорта; см. R2). В случае гонок поднять mock-инициализацию в preload `packages/cli/test-setup.ts`, прописать в `bunfig.toml` `[test] preload`.
- `localStorage.clear()` и `getItem`/`setItem` в тестах остаются как есть — Bun реализует Web Storage API.

**Проверка по нанотезисам из памяти:**
- `keepMount`, `allTasks`, `cleanStores` (nanostores) — работают идентично в bun:test, никакой адаптации.
- `mock.method` без noop как spy → используем `spyOn(...)` без `.mockImplementation`.

## Phase D — Build & cross-platform binaries (главный рисковый блок)

**Файлы:** `packages/cli/rspack.config.ts` (удалить), `packages/cli/scripts/pack-sea.ts` (полностью переписать), `packages/cli/scripts/sea-native-bootstrap.cjs` (вероятно удалить — см. ниже).

1. Удалить `rspack.config.ts`, devDeps `@rspack/{core,cli}`, `postject`.
2. Новый `packages/cli/scripts/build-binary.ts` (~50 строк):
   ```ts
   import { $ } from 'bun'
   const targets = [
     { target: 'bun-darwin-arm64', outfile: 'dist/nike-release-checker-macos-arm64' },
     { target: 'bun-windows-x64', outfile: 'dist/nike-release-checker-win-x64.exe' },
   ]
   for (const { target, outfile } of targets) {
     await Bun.build({
       entrypoints: ['./src/index.tsx'],
       compile: { target, outfile },
       minify: true,
       sourcemap: 'linked',
       external: ['sharp'],          // см. п.3
       define: { 'process.env.NODE_ENV': '"production"' },
     })
   }
   ```
   `define`-кейс из rspack (`process.env.DEV`, `process.browser`, `ENVIRONMENT`) переносим через опцию `define`.
3. **Sharp**: `bun build --compile` встраивает JS, но `.node` бинарники надо доставлять снаружи (NAPI-loader Bun читает их с ФС через `require(.node)`). Стратегия: `sharp` остаётся `external`, рядом с исполняемым файлом кладём папку `node_modules/sharp/...` и `node_modules/@img/...`, как сейчас делает `sea-native-bootstrap`. Можно либо:
   - **(a)** упаковать в zip-релиз (бинарник + папка native-deps) — простой путь;
   - **(b)** через `Bun.embeddedFiles` встроить `.node` в бинарник и распаковывать в `os.tmpdir()` на первом запуске — повторить логику `sea-native-bootstrap.cjs` на Bun API. Требует прототипа.
   - Решение: начать с (a) на macOS arm64, добиться зелёного запуска, потом оценить (b) для удобства дистрибуции.
4. Подпись macOS (`codesign --remove-signature` + ad-hoc `codesign --sign -`) — оставить, но применять к собранному Bun-бинарнику. См. https://bun.com/docs/runtime/codesign-macos-executable.
5. На Windows .exe-иконку/метаданные не трогаем (как сейчас).

## Phase E — CI/CD

**Файлы:** `.github/composite-actions/install/action.yml`, все 5 workflow в `.github/workflows/`.

1. `composite-actions/install`: заменить `actions/setup-node@v6` (с `node-version-file: .nvmrc`) на:
   ```yaml
   - uses: oven-sh/setup-bun@v2
     with:
       bun-version-file: .bun-version
   - run: bun install --frozen-lockfile
   ```
2. `ci.yml`: `npm run lint && npm run test` → `bun run lint && bun test`.
3. `cli-sea-release.yml`: матрица `macos-latest`, `windows-latest` — можно сократить до одной (macOS) благодаря cross-compile, но безопаснее оставить native-ранеры. Скрипт `npm run build:sea` → `bun run build:binary` (новое имя). Артефакт-имена остаются.
4. `sdk-tarball-release.yml`: heredoc `node --input-type=module` для правки `publishConfig` → `bun -e "..."` (идентичный API). `npm pack` → `bun pm pack` (или сохранить `npm pack` если он работает с Bun-структурой — npm всё ещё распакован в CI). См. R4.
5. `changesets-release-pr.yml`: команды `changeset version`/`tag` доступны через `bun run changeset …`.
6. `product-feed-health.yml`: `npm run ci:check-product-feed` → `bun run ci:check-product-feed`.

## Phase F — Cleanup & docs

- Удалить `.nvmrc` (после зелёного CI).
- Удалить из package.json: `tsx`, `cross-env`, `@rspack/cli`, `@rspack/core`, `postject`, `@types/node`. Добавить `@types/bun`.
- Обновить `README.md`, `RELEASING.md`, `AGENTS.md` — все упоминания `node`/`npm` заменить на `bun`. `npm run check-product-feed -- 15` → `bun run check-product-feed 15` (Bun не требует `--`).
- `DEPENDENCIES.md`: пометка про `ink-select-input@6.1.0` остаётся валидной.
- В конце удалить старые `PLAN.md`/`PLAN-ESM.md` (они уже staged как deletions).

## Risks & open questions

- **R1 — Persistent localStorage в Bun.** Bun реализует Web Storage API, но файл-бэкендом и его конфигом в `bunfig.toml` стоит подтвердить против актуальной доки (`https://bun.com/docs/runtime/web-apis`). Если ключа `[run].localStorageFile` нет — нужен один из: переменная окружения, флаг CLI, либо лёгкий адаптер поверх `bun:sqlite` под имя `localStorage` для CLI и тестов. План B запасной.
- **R2 — `mock.module` ordering.** В `bun:test` `mock.module` работает надёжнее через preload (`bunfig.toml [test] preload`), потому что Bun лениво резолвит модули. Для `product.test.ts` может потребоваться вынести моки `node:fs/promises` / `./country.ts` / `@nike-release-checker/sdk` в `packages/cli/test-setup.ts`.
- **R3 — Coverage.** Bun coverage даёт другой формат отчёта. `--test-coverage-exclude` мапится в `bunfig.toml [test] coveragePathIgnorePatterns` (синтаксис свой). Подтвердить именования при миграции.
- **R4 — sharp в `--compile`.** Cамый большой неизвестный — переносимость на Windows. Прототип на macOS первым, затем сразу прогон в `windows-latest` CI с external+sidecar. Если sidecar нестабилен — реализовать вариант (b) с `embeddedFiles`.
- **R5 — Ink/React под Bun.** Bun поддерживает React 19 и Ink исторически работает; неблокирующий риск, но первый `bun src/index.tsx` смок-тест надо снять до миграции CI.
- **R6 — `with { type: 'json' }`** в `pack-sea.ts` (sharp/package.json) — Bun поддерживает, при переписывании скрипта переезд тривиальный.

## Critical files to touch

- `package.json` (root + `packages/cli/package.json` + `packages/sdk/package.json`)
- `bunfig.toml` (новый), `.bun-version` (новый)
- `tsconfig.json` (типы)
- Удалить: `package-lock.json`, `.nvmrc`, `packages/cli/rspack.config.ts`, `packages/cli/scripts/sea-native-bootstrap.cjs` (опционально)
- Переписать: `packages/cli/scripts/pack-sea.ts` → `packages/cli/scripts/build-binary.ts`
- Все 9 `*.test.ts` (см. Phase C)
- `.github/composite-actions/install/action.yml` + 5 workflow
- Документация: `README.md`, `RELEASING.md`, `AGENTS.md`, `DEPENDENCIES.md`

## Verification (end-to-end)

1. `bun install --frozen-lockfile` — без ошибок, `bun.lock` коммитится.
2. `bun run lint` (prettier + `tsc --noEmit`) — зелёно.
3. `bun test` для SDK и CLI — все 9 файлов зелёные, в т.ч. `product.test.ts` с `mock.module`.
4. `bun run start:mock` — UI Ink рисуется в терминале, localStorage пишется в `local.db`.
5. `bun run start` — реальные запросы, persistent state выживает между запусками.
6. `bun run build:binary` локально (macOS arm64) → бинарник запускается, sharp работает (рендер изображений в Ink).
7. CI: `cli-sea-release.yml` поднимает Windows runner, кросс-сборка `bun-windows-x64` или native-сборка проходит, бинарник запускается в smoke-job (`./nike-release-checker-win-x64.exe --help` или эквивалент).
8. `product-feed-health.yml` отрабатывает без regression (`bun run ci:check-product-feed`).
9. Релизный путь: `bun run changeset && bun run changeset:version && bun run changeset:publish` — `changesets` совместим с Bun.

## Suggested execution order (incremental, mergeable)

1. **PR 1 — Foundation:** `bunfig.toml`, `.bun-version`, `bun install`, обновлённые scripts уровня runtime, `tsx`/`cross-env` уходят. CI остаётся на Node. Локально проверяем `bun run start`.
2. **PR 2 — Tests:** переписать `node:test → bun:test`. CI остаётся на Node, но добавляем job `bun test` в `ci.yml`. Когда зелёный — удаляем Node-тесты.
3. **PR 3 — Build:** новый `build-binary.ts`, удаление `rspack`, sharp-sidecar. Проверка локально на macOS.
4. **PR 4 — CI:** заменить composite action на Bun, обновить все workflow, удалить `.nvmrc`, `package-lock.json`. Проверить cross-platform SEA-релиз.
5. **PR 5 — Docs/cleanup:** обновить README/RELEASING/AGENTS, snake-bite через `DEPENDENCIES.md`.
