# pi-todo

Pi package with a single extension (`extensions/todo.ts`, copied from pi's
`examples/extensions/todo.ts`):

- `todo` tool for the model — actions `list`, `add`, `toggle`, `clear`
- `/todos` command showing the current branch's todos in a TUI overlay

State lives in tool-result details, so branching keeps the list correct.

## Use

```bash
pi install /Users/ravshan/Projects/pi-todo   # or -l for project settings
pi -e .                                      # try without installing
npm run check                                # type-check
```
