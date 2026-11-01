# OpenCode_MCPClassify

> TUI-плагин для OpenCode V2: делит MCP-серверы в сайдбаре сессии на
> **классы**. Корневой узел `MCP (N)` сворачивается и показывает общее число
> серверов; внутри — сворачиваемые классы `Класс (Nk)`, а под ними серверы со
> статусом. Всё, что не подошло ни под один класс, попадает в `Other` и
> рисуется **в конце**.

```
MCP (11)
  ▼ WebSearch (3)
      • searxng        Connected
      • tavily         Disabled
      • deepseek-search Connected
  ▶ Browser (2)
  ▼ Documents (1)
      • markitdown     Connected
  ▼ Other (2)
      • laya           Disabled
      • rea            Disabled
```

## Описание

Встроенная секция MCP в сайдбаре — плоский список: все серверы под одним
заголовком «MCP», свернуть можно только весь список. В схеме OpenCode у
MCP-сервера нет поля «класс/группа», а эфирного API для группировки
встроенной секции нет.

Плагин решает это на уровне TUI: он рисует **свою** секцию в
`sidebar.content`, где каждый класс — сворачиваемый узел, а серверы вложены
под него. Встроенная плоская секция отключается одной директивой. Имена
серверов и инструментов при этом **не меняются**.

**Возможности:**

- классы настраиваются картой `class -> [server, ...]`; есть дефолты под
  типовой глобальный `opencode.json`;
- корневой узел `MCP (N)` и каждый класс `Класс (Nk)` сворачиваются; состояние
  свёртки запоминается между запусками (`storage`);
- `Other` для всего, что не подошло, — всегда последним;
- клик по серверу **подключает/отключает** его через клиентскую API OpenCode
  V2 (`experimental.mcp`; фолбэк на устаревший `client.mcp` и legacy
  `client.api.mcp`); если API недоступна — понятный тост вместо ошибки; на
  время вызова показывается `Connecting`;
- пока идёт подключение, список MCP опрашивается, поэтому статус обновляется
  даже если событие `mcp.status.changed` потерялось; если сервер висит в
  `pending` дольше 45 с, строка показывает `Timeout`, а клик по ней
  перезапускает подключение;
- показывает статус сервера (`Connected` / `Disabled` / `Error` / `Sign in`);
- не трогает имена серверов, имена инструментов и `opencode.json`;
- без сети и внешних зависимостей.

## Требования

- OpenCode **V2** (проверено на `2.2.5`; клик по MCP использует
  `context.client.experimental.mcp`).

## Структура

```
MCPClassify_OCV2/
├── opencode.json          # пустой проектный конфиг (только $schema)
├── install.bat            # установка плагина в глобальный каталог OpenCode (Windows)
├── plugin/
│   ├── index.js           # серверная заглушка (чтобы пакет был корректным)
│   ├── tui.tsx            # TUI-плагин: секция MCP по классам в сайдбаре
│   ├── classes.js         # чистая логика классов (тестируется отдельно)
│   ├── client.js          # резолвер MCP API клиента V2 (тестируется отдельно)
│   └── package.json
├── tmp/
│   ├── test-classes.mjs   # юнит-тест логики (локально, не в git): node tmp/test-classes.mjs
│   └── test-client.mjs    # юнит-тест резолвера MCP API: node tmp/test-client.mjs
├── README.md
├── CHANGES.md             # незакоммиченные изменения
├── AGENTS.md              # описание архитектуры проекта
└── LICENSE                # MIT
```

## Классы по умолчанию

Под серверы типового глобального `opencode.json`:

| Класс | Серверы |
|---|---|
| `WebSearch` | `searxng`, `tavily`, `deepseek-search` |
| `Browser` | `playwright`, `chrome-devtools` |
| `Messaging` | `TelegramMCP` |
| `Documents` | `markitdown` |
| `System` | `windows-mcp` |
| `CAD` | `freecad` |
| `Other` | всё остальное (напр. `rea`, `laya`) — рисуется последним |

Сопоставление — без учёта регистра. Порядок классов — порядок объявления.

## Установка

### Вариант 1. Автоматически, силами нейросети (рекомендуется)

Скопируй промт ниже и отправь его OpenCode. Агент установит плагин, отключит
встроенную секцию и проверит результат.

```text
Установи мне плагин OpenCode V2 MCPClassify из репозитория
https://github.com/StandarterDF/MCPClassify_OCV2 (замени URL на свой форк, если он у тебя другой).

Что нужно сделать:
1. Определи каталог глобального конфига OpenCode:
   - Windows: %USERPROFILE%\.config\opencode  (или %XDG_CONFIG_HOME%\opencode)
   - Linux/macOS: ~/.config/opencode  (или $XDG_CONFIG_HOME/opencode)
   Каталог глобальных плагинов — <config>/plugins/.
2. Установи плагин: скопируй файлы из папки plugin/ репозитория
   (index.js, tui.tsx, classes.js, client.js, package.json) в
   <config>/plugins/mcp-classify/.
3. Отключи встроенную плоскую секцию MCP: в <config>/cli.json (это CLI-конфиг,
   НЕ opencode.json) добавь в массив "plugins" строку "-opencode.sidebar.mcp".
   Остальное содержимое cli.json не трогай.
4. Перезапусти сервис: opencode service restart. Затем попроси меня заново
   открыть OpenCode (TUI подхватывает плагин при запуске).
5. Проверь, что нет ошибок: в ~/.local/share/opencode/log/opencode.log не
   должно быть ошибок плагина opencode.mcp-classify. Покажи мне список
   классов, которые я должен увидеть.

Действуй автономно. В конце кратко отчитайся: что установил, какие файлы
изменил. Если секция не появилась — продиагностируй и доведи до конца.
```

### Вариант 2. Вручную (Windows)

Запусти из корня репозитория:

```bat
install.bat
```

Скрипт скопирует файлы плагина в
`%USERPROFILE%\.config\opencode\plugins\mcp-classify\`.

### Отключение встроенной секции (обязательно)

В `cli.json` (`~/.config/opencode/cli.json`, **не** `opencode.json`):

```jsonc
{
  "$schema": "https://opencode.ai/v2/cli.json",
  "plugins": ["-opencode.sidebar.mcp"]
}
```

Без этой строки будут видны обе секции: встроенная плоская и наша по классам.

## Настройка

Классы и класс по умолчанию передаются через `options`. Локальный каталог
плагина подхватывается автоматически, но, чтобы задать параметры, объяви его
в `cli.json` явно объектом:

```jsonc
{
  "$schema": "https://opencode.ai/v2/cli.json",
  "plugins": [
    "-opencode.sidebar.mcp",
    {
      "package": "./plugins/mcp-classify",
      "options": {
        "defaultClass": "Other",
        "classes": {
          "WebSearch": ["searxng", "tavily", "deepseek-search"],
          "Media": ["laya"]
        }
      }
    }
  ]
}
```

Путь `./plugins/mcp-classify` — относительно каталога `cli.json`.

| Опция | По умолчанию | Описание |
|---|---|---|
| `defaultClass` | `"Other"` | Класс для серверов, не попавших ни в одну карту. Рисуется последним. |
| `classes` | см. таблицу выше | Карта `класс -> [серверы]`. Мержится с дефолтами **по классу**: указанный класс заменяет свой список, остальные дефолтные сохраняются. Значение `null` удаляет класс. |

## Проверка

Автономные тесты чистой логики (без OpenCode):

```bash
node tmp/test-classes.mjs
node tmp/test-client.mjs
```

Проверка в TUI (OpenCode `2.2.5`): открой сессию и посмотри сайдбар справа —
должен быть сворачиваемый корень `MCP (N)`, внутри — сворачиваемые классы
`Класс (Nk)` с серверами, а `Other` — внизу. Клик по заголовку
сворачивает/разворачивает уровень; клик по серверу подключает/отключает его
через клиентскую API V2 (`experimental.mcp`). Если в этой сборке API нет,
вместо падения появится тост `<сервер>: MCP API недоступна в этой версии
OpenCode (нет experimental.mcp)`.

Проверка ошибок загрузки:

```powershell
Select-String -Path "$env:USERPROFILE\.local\share\opencode\log\opencode.log" -Pattern "mcp-classify" | Select-Object -Last 20
```

## Удаление

1. Убери из `cli.json` строку `"-opencode.sidebar.mcp"` и запись нашего
   плагина (если добавлял).
2. Удали каталог `<config>/plugins/mcp-classify/`.
3. Перезапусти сервис: `opencode service restart` и заново открой OpenCode.

Встроенная секция MCP вернётся сама.

## Ссылки

- [OpenCode V2 — CLI-плагины](https://opencode.ai/v2/docs/build/plugins/cli)
- [OpenCode V2 — плагины](https://opencode.ai/v2/docs/build/plugins)
- [OpenCode V2 — MCP-серверы](https://opencode.ai/v2/docs/mcp-servers)

## Лицензия

MIT — см. [LICENSE](LICENSE).
