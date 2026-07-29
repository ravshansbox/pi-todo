/**
 * Todo Extension - Demonstrates state management via session entries
 *
 * This extension:
 * - Registers a `todo` tool for the LLM to manage todos
 * - Registers a `/todos` command for users to view the list
 * - Shows a persistent widget above the editor, which disappears once every
 *   todo is checked off because the list clears itself
 *
 * State is stored in tool result details (not external files), which allows
 * proper branching - when you branch, the todo state is automatically
 * correct for that point in history.
 */

import { StringEnum } from '@earendil-works/pi-ai';
import type {
  AgentToolResult,
  ExtensionAPI,
  ExtensionContext,
  Theme,
} from '@earendil-works/pi-coding-agent';
import { matchesKey, Text, truncateToWidth } from '@earendil-works/pi-tui';
import { type Static, Type } from 'typebox';

const TOOL_NAME = 'todo';
const WIDGET_KEY = 'todo';
/** Items shown before collapsing to a "N more" line. */
const WIDGET_MAX_ITEMS = 5;
const RESULT_MAX_ITEMS = 5;

type TodoAction = 'list' | 'add' | 'toggle' | 'clear';

interface Todo {
  id: number;
  text: string;
  done: boolean;
}

/** Mutable in-memory state, rebuilt from session entries on load. */
interface TodoState {
  todos: Todo[];
  nextId: number;
}

interface TodoDetails {
  action: TodoAction;
  todos: Todo[];
  nextId: number;
  error?: string | undefined;
}

const TodoParams = Type.Object({
  action: StringEnum(['list', 'add', 'toggle', 'clear'] as const),
  text: Type.Optional(Type.String({ description: 'Todo text (for add)' })),
  id: Type.Optional(Type.Number({ description: 'Todo ID (for toggle)' })),
});
type TodoParams = Static<typeof TodoParams>;

// --- Formatting -------------------------------------------------------------

const plainTodoLine = (todo: Todo): string =>
  `${todo.done ? '[x]' : '[ ]'} #${todo.id}: ${todo.text}`;

const formatPlainList = (todos: Todo[]): string =>
  todos.length === 0 ? 'No todos' : todos.map(plainTodoLine).join('\n');

/**
 * `openColor` differs per surface: the widget uses full-contrast text, while
 * inline tool results stay muted so they recede into the transcript.
 */
const styledTodoLine = (
  todo: Todo,
  theme: Theme,
  openColor: 'text' | 'muted',
): string => {
  const check = todo.done ? theme.fg('success', '✓') : theme.fg('dim', '○');
  const text = todo.done
    ? theme.fg('dim', todo.text)
    : theme.fg(openColor, todo.text);
  return `${check} ${theme.fg('accent', `#${todo.id}`)} ${text}`;
};

const firstText = (
  content: readonly { type: string; text?: string }[],
): string => {
  const first = content[0];
  return first?.type === 'text' ? (first.text ?? '') : '';
};

// --- Tool actions -----------------------------------------------------------

const toolResult = (
  text: string,
  details: TodoDetails,
): AgentToolResult<TodoDetails> => ({
  content: [{ type: 'text', text }],
  details,
});

const snapshot = (
  state: TodoState,
  action: TodoAction,
  error?: string,
): TodoDetails => ({
  action,
  todos: [...state.todos],
  nextId: state.nextId,
  error,
});

type ActionHandler = (
  state: TodoState,
  params: TodoParams,
) => AgentToolResult<TodoDetails>;

const ACTIONS: Record<TodoAction, ActionHandler> = {
  list: (state) =>
    toolResult(formatPlainList(state.todos), snapshot(state, 'list')),

  add: (state, params) => {
    if (!params.text) {
      return toolResult(
        'Error: text required for add',
        snapshot(state, 'add', 'text required'),
      );
    }
    const todo: Todo = { id: state.nextId++, text: params.text, done: false };
    state.todos.push(todo);
    return toolResult(
      `Added todo #${todo.id}: ${todo.text}`,
      snapshot(state, 'add'),
    );
  },

  toggle: (state, params) => {
    if (params.id === undefined) {
      return toolResult(
        'Error: id required for toggle',
        snapshot(state, 'toggle', 'id required'),
      );
    }
    const todo = state.todos.find((t) => t.id === params.id);
    if (!todo) {
      return toolResult(
        `Todo #${params.id} not found`,
        snapshot(state, 'toggle', `#${params.id} not found`),
      );
    }
    todo.done = !todo.done;

    // Finishing the last open item retires the whole list: the completed rows
    // carry no further action, and the tool result above still records them.
    // Resetting here (rather than in the widget) persists via the snapshot, so
    // it survives reloads and branches correctly.
    if (state.todos.every((t) => t.done)) {
      const cleared = state.todos.length;
      state.todos = [];
      state.nextId = 1;
      return toolResult(
        `Todo #${todo.id} completed — all ${cleared} done, list cleared`,
        snapshot(state, 'toggle'),
      );
    }

    return toolResult(
      `Todo #${todo.id} ${todo.done ? 'completed' : 'uncompleted'}`,
      snapshot(state, 'toggle'),
    );
  },

  clear: (state) => {
    const count = state.todos.length;
    state.todos = [];
    state.nextId = 1;
    return toolResult(`Cleared ${count} todos`, snapshot(state, 'clear'));
  },
};

// --- Result rendering -------------------------------------------------------

interface ResultRenderArgs {
  details: TodoDetails;
  text: string;
  theme: Theme;
  expanded: boolean;
}

const RESULT_RENDERERS: Record<TodoAction, (args: ResultRenderArgs) => Text> = {
  list: ({ details, theme, expanded }) => {
    const todos = details.todos;
    if (todos.length === 0) {
      return new Text(theme.fg('dim', 'No todos'), 0, 0);
    }
    const shown = expanded ? todos : todos.slice(0, RESULT_MAX_ITEMS);
    const lines = [theme.fg('muted', `${todos.length} todo(s):`)];
    for (const todo of shown) {
      lines.push(styledTodoLine(todo, theme, 'muted'));
    }
    const hidden = todos.length - shown.length;
    if (hidden > 0) {
      lines.push(theme.fg('dim', `... ${hidden} more`));
    }
    return new Text(lines.join('\n'), 0, 0);
  },

  add: ({ details, theme }) => {
    const added = details.todos.at(-1);
    if (!added) {
      return new Text(theme.fg('dim', 'No todos'), 0, 0);
    }
    return new Text(
      `${theme.fg('success', '✓ Added ')}${theme.fg('accent', `#${added.id}`)} ${theme.fg('muted', added.text)}`,
      0,
      0,
    );
  },

  toggle: ({ text, theme }) =>
    new Text(theme.fg('success', '✓ ') + theme.fg('muted', text), 0, 0),

  clear: ({ theme }) =>
    new Text(
      theme.fg('success', '✓ ') + theme.fg('muted', 'Cleared all todos'),
      0,
      0,
    ),
};

// --- Widget and overlay -----------------------------------------------------

const widgetLines = (todos: Todo[], theme: Theme): string[] => {
  const done = todos.filter((t) => t.done).length;
  // Open items first, so the widget stays useful as the list grows.
  const ordered = [
    ...todos.filter((t) => !t.done),
    ...todos.filter((t) => t.done),
  ];
  const lines = [
    theme.fg('accent', 'Todos ') + theme.fg('muted', `${done}/${todos.length}`),
  ];
  for (const todo of ordered.slice(0, WIDGET_MAX_ITEMS)) {
    lines.push(styledTodoLine(todo, theme, 'text'));
  }
  const hidden = ordered.length - WIDGET_MAX_ITEMS;
  if (hidden > 0) {
    lines.push(theme.fg('dim', `… ${hidden} more (/todos)`));
  }
  return lines;
};

/** Renders the widget above the editor, clearing it when there is nothing to show. */
const renderWidget = (ctx: ExtensionContext, todos: Todo[]): void => {
  if (!ctx.hasUI) return;
  ctx.ui.setWidget(
    WIDGET_KEY,
    todos.length === 0 ? undefined : widgetLines(todos, ctx.ui.theme),
    { placement: 'aboveEditor' },
  );
};

const overlayLines = (todos: Todo[], theme: Theme, width: number): string[] => {
  const lines = [''];
  lines.push(
    truncateToWidth(
      theme.fg('borderMuted', '─'.repeat(3)) +
        theme.fg('accent', ' Todos ') +
        theme.fg('borderMuted', '─'.repeat(Math.max(0, width - 10))),
      width,
    ),
  );
  lines.push('');

  if (todos.length === 0) {
    lines.push(
      truncateToWidth(
        `  ${theme.fg('dim', 'No todos yet. Ask the agent to add some!')}`,
        width,
      ),
    );
  } else {
    const done = todos.filter((t) => t.done).length;
    lines.push(
      truncateToWidth(
        `  ${theme.fg('muted', `${done}/${todos.length} completed`)}`,
        width,
      ),
    );
    lines.push('');
    for (const todo of todos) {
      lines.push(
        truncateToWidth(`  ${styledTodoLine(todo, theme, 'text')}`, width),
      );
    }
  }

  lines.push('');
  lines.push(
    truncateToWidth(`  ${theme.fg('dim', 'Press Escape to close')}`, width),
  );
  lines.push('');
  return lines;
};

/** UI component for the /todos command. */
class TodoListComponent {
  private cachedWidth?: number | undefined;
  private cachedLines?: string[] | undefined;

  constructor(
    private todos: Todo[],
    private theme: Theme,
    private onClose: () => void,
  ) {}

  handleInput(data: string): void {
    if (matchesKey(data, 'escape') || matchesKey(data, 'ctrl+c')) {
      this.onClose();
    }
  }

  render(width: number): string[] {
    if (!this.cachedLines || this.cachedWidth !== width) {
      this.cachedWidth = width;
      this.cachedLines = overlayLines(this.todos, this.theme, width);
    }
    return this.cachedLines;
  }

  invalidate(): void {
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }
}

// --- Session state ----------------------------------------------------------

/**
 * Reconstruct state from session entries.
 * Scans tool results for this tool and applies them in order.
 */
const reconstructState = (ctx: ExtensionContext, state: TodoState): void => {
  state.todos = [];
  state.nextId = 1;

  for (const entry of ctx.sessionManager.getBranch()) {
    if (entry.type !== 'message') continue;
    const msg = entry.message;
    if (msg.role !== 'toolResult' || msg.toolName !== TOOL_NAME) continue;

    const details = msg.details as TodoDetails | undefined;
    if (details) {
      state.todos = details.todos;
      state.nextId = details.nextId;
    }
  }
};

export default function (pi: ExtensionAPI) {
  const state: TodoState = { todos: [], nextId: 1 };

  const reload = (ctx: ExtensionContext) => {
    reconstructState(ctx, state);
    renderWidget(ctx, state.todos);
  };

  pi.on('session_start', (_event, ctx) => reload(ctx));
  pi.on('session_tree', (_event, ctx) => reload(ctx));

  // Refresh the widget after the tool mutates state
  pi.on('tool_result', (event, ctx) => {
    if (event.toolName === TOOL_NAME) renderWidget(ctx, state.todos);
  });

  pi.registerTool({
    name: TOOL_NAME,
    label: 'Todo',
    description:
      'Manage a todo list. Actions: list, add (text), toggle (id), clear',
    parameters: TodoParams,

    async execute(_toolCallId, params) {
      return ACTIONS[params.action](state, params);
    },

    renderCall(args, theme) {
      let text =
        theme.fg('toolTitle', theme.bold('todo ')) +
        theme.fg('muted', args.action);
      if (args.text) text += ` ${theme.fg('dim', `"${args.text}"`)}`;
      if (args.id !== undefined)
        text += ` ${theme.fg('accent', `#${args.id}`)}`;
      return new Text(text, 0, 0);
    },

    renderResult(result, { expanded }, theme) {
      const details = result.details as TodoDetails | undefined;
      const text = firstText(result.content);
      if (!details) {
        return new Text(text, 0, 0);
      }
      if (details.error) {
        return new Text(theme.fg('error', `Error: ${details.error}`), 0, 0);
      }
      return RESULT_RENDERERS[details.action]({
        details,
        text,
        theme,
        expanded,
      });
    },
  });

  pi.registerCommand('todos', {
    description: 'Show all todos on the current branch',
    handler: async (_args, ctx) => {
      if (ctx.mode !== 'tui') {
        ctx.ui.notify('/todos requires interactive mode', 'error');
        return;
      }

      await ctx.ui.custom<void>((_tui, theme, _kb, done) => {
        return new TodoListComponent(state.todos, theme, () => done());
      });
    },
  });
}
