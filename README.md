# pi-todo

Pi package with a single extension (`extensions/todo.ts`, copied from pi's
`examples/extensions/todo.ts`):

- `todo` tool for the model — actions `list`, `add`, `toggle`, `clear`
- `/todos` command showing the current branch's todos in a TUI overlay

Checking off the last open todo clears the list automatically, so the widget
disappears instead of lingering as a wall of ticks. The completed items stay
visible in the tool results that recorded them, and ids restart from `#1`.

State lives in tool-result details, so branching keeps the list correct.

## Use

```bash
pi install npm:@ravshansbox/pi-todo   # or -l for project settings
pi -e .                               # try without installing
npm run check                         # type-check
```
