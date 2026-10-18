# AGENTS.md — архитектура OpenCode_MCPClassify

## Назначение

Плагин OpenCode V2, который делит MCP-серверы в сайдбаре сессии на классы.
Дерево: корневой сворачиваемый узел `MCP (N)` (N — всего серверов), под ним
сворачиваемые классы `Класс (Nk)`, под ними серверы класса со статусом.
Неклассифицированные серверы попадают в класс `Other` и рисуются последними.

Схема OpenCode не содержит поля «класс» у MCP-сервера, а встроенную секцию
сайдбара (`opencode.sidebar.mcp`) через публичный API не расширить. Поэтому
плагин **заменяет** встроенную секцию своей: рисует собственную в
`sidebar.content`, а встроенную отключает директивой `plugins` в `cli.json`.
Имена серверов и инструментов не меняются.

## Файлы

| Файл | Роль |
|---|---|
| `plugin/tui.tsx` | TUI-плагин. `Plugin.define({ id, setup })`, слот `sidebar.content`. |
| `plugin/classes.js` | Чистая логика классов: `buildClasses`, `classify`, `groupServers`. Без импортов OpenCode. |
| `plugin/index.js` | Серверная заглушка: чтобы каталог был корректным пакетом и был виден в `opencode plugin list`. Ничего не делает. |
| `plugin/package.json` | `"type": "module"`, `main`, `exports` (`.`, `./tui`). |
| `opencode.json` | Проектный конфиг (только `$schema`). |
| `install.bat` | Копирует `plugin/` в глобальный каталог плагинов (Windows) и напоминает про `cli.json`. |
| `tmp/test-classes.mjs` | Юнит-тест `classes.js` на Node. |
| `README.md` | Описание, установка, настройка, проверка. |
| `CHANGES.md` | Незакоммиченные изменения. |
| `AGENTS.md` | Этот файл. |
| `LICENSE` | MIT. |

## Точка входа

`plugin/tui.tsx` экспортирует по умолчанию:

```ts
export default Plugin.define({
  id: "opencode.mcp-classify",
  setup(context) {
    context.ui.slot({
      append: "sidebar.content",
      render: (input) => <McpClasses context={context} sessionID={input.sessionID} ... />,
    })
  },
})
```

OpenCode (TUI) загружает `./tui` из каталога плагина. Для локального каталога
`Host.resolve` ищет файл `<dir>/tui` с расширениями `.ts/.tsx/.js/.jsx/...`,
поэтому имя файла — `tui.tsx`.

## Поток данных

1. `setup(context)` читает `context.options` (`classes`, `defaultClass`),
   строит `Map<classLabel, Set<lowercasedMember>>` (`buildClasses`) и
   регистрирует слот `sidebar.content`.
2. Компонент `McpClasses` читает серверы:
   `context.data.location.mcp.server.list(session?.location)` — реактивно
   через `createMemo`.
3. `groupServers(servers, classes, defaultClass)` раскладывает серверы по
   классам и возвращает упорядоченные пары `[label, servers[]]`: классы в
   порядке объявления, `Other` — последним. Пустые классы выкидываются,
   серверы внутри класса сортируются по имени.
4. Рендер: корневой заголовок `MCP (N)`, под ним (если раскрыт) заголовки
   классов `Класс (Nk)` (треугольник + имя + число серверов), под каждым
   классом (если раскрыт) строки серверов — маркер статуса, имя, статус.
5. Свёртка узлов хранится в `context.storage.store("classes", ...)`
   (`{ [label]: false }` — свёрнут; ключ `"$mcp"` — корень) и переживает
   перезапуск TUI.
6. Клик по строке сервера — `context.client.api.mcp.connect`/
   `disconnect({ server, location: { directory } })` (та же API, что у
   встроенного `/mcps`). Пока вызов в полёте — строка показывает
   `Connecting`; список обновляется событием `mcp.status.changed`, ошибки —
   через `context.ui.toast.show`.

## Почему не переименование

В версии 0.1.0 класс зашивался в имя сервера (`WebSearch/searxng`). Это
портит имена инструментов (они включают имя сервера) и не даёт настоящей
вложенности — список всё равно плоский. Отброшено в пользу TUI-рендера.

## Ключевые функции (`plugin/classes.js`)

| Функция | Назначение |
|---|---|
| `buildClasses(options)` | Мержит `DEFAULT_CLASSES` с `options.classes` в `Map<label, Set<lowercased>>`. Порядок ключей = порядок отображения. |
| `classify(name, classes)` | Класс сервера по имени (без учёта регистра) или `undefined`. |
| `groupServers(servers, classes, defaultClass)` | Упорядоченная группировка, `defaultClass` последним, сортировка серверов. |

## Настройки (константы в `plugin/classes.js`)

| Константа | Значение | Смысл |
|---|---|---|
| `DEFAULT_CLASS` | `"Other"` | Класс для неклассифицированных; рисуется последним. |
| `DEFAULT_CLASSES` | WebSearch / Browser / Messaging / Documents / System / CAD | Дефолтная раскладка MCP типового глобального `opencode.json`. |

## Конфигурация (`cli.json`)

- Отключение встроенной секции: `"plugins": ["-opencode.sidebar.mcp"]`.
  Директива `-<id>` (или `-<prefix>.*`) выключает совпавшие плагины, включая
  встроенные (см. реестр плагинов TUI).
- Наш плагин подхватывается из `<config>/plugins/mcp-classify` автоматически;
  чтобы передать `options`, добавь его в `plugins` объектом
  `{ "package": "./plugins/mcp-classify", "options": {...} }` — таргет
  дедуплицируется по пути, объектная запись выигрывает.

## Внешние зависимости

Нет. TUI-плагин импортирует `@opencode/plugin/tui` и `solid-js` — их
резолвит рантайм OpenCode. Логика классов не импортирует ничего.

## Архитектурные ограничения

- Плагин **рисует** секцию и по клику **подключает/отключает** MCP через
  клиентскую API (`context.client.api.mcp`). Конфиг он не меняет:
  включение/выключение сервера — рантайм-состояние, а не правка `opencode.json`.
- Встроенную секцию нельзя «расширить» — только заменить/отключить. Если
  рантайм изменит id встроенного плагина, директиву отключения нужно
  поправить.
- Если наш плагин не загрузится, а встроенная секция отключена, MCP-секции в
  сайдбаре не будет — вернуть её можно удалением строки из `cli.json`.
- Формат `tui.tsx` завязан на API TUI-плагинов OpenCode V2; сборка/проверка
  JSX возможна только рантаймом OpenCode (в репозитории нет билд-шага).
