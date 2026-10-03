# pi-todo

Todo list extension for pi.

## Install

```bash
pi install git:github.com/ravshansbox/pi-todo
```

Add `-l` to install it in project settings.

## Usage

Pi loads the extension from `./index.ts`, adapted from pi's `examples/extensions/todo.ts`:

- `todo` tool for the model — actions `list`, `add`, `toggle`, `clear`
- `/todos` command showing the current branch's todos in a TUI overlay

Checking off the last open todo clears the list automatically, so the widget disappears instead of lingering as a wall of ticks. The completed items stay visible in the tool results that recorded them, and ids restart from `#1`.

State lives in tool-result details, so branching keeps the list correct.

## Development

```bash
npm install
npm run check
```
