# pi-todo

Pi package with a single extension (`extensions/todo.ts`, copied from pi's
`examples/extensions/todo.ts`):

- `todo` tool for the model — actions `list`, `add`, `toggle`, `clear`
- `/todos` command showing the current branch's todos in a TUI overlay
- `/todos clear` to remove every todo on the current branch

State lives in tool-result details, so branching keeps the list correct.
`/todos clear` records a `todo_cleared` session entry rather than only
resetting memory, so the reset survives reloads and branches with it.

## Use

```bash
pi install npm:@ravshansbox/pi-todo   # or -l for project settings
pi -e .                               # try without installing
npm run check                         # type-check
```
