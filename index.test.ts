import assert from 'node:assert/strict';
import { test } from 'node:test';
import todoExtension from './index.ts';

type Handler = (event: unknown, ctx: unknown) => unknown;

const setup = () => {
  const handlers = new Map<string, Handler>();
  let tool: { execute: (id: string, params: unknown) => Promise<any> } | undefined;
  const pi = {
    on: (event: string, handler: Handler) => handlers.set(event, handler),
    registerTool: (def: typeof tool) => {
      tool = def;
    },
    registerCommand: () => {},
  };
  todoExtension(pi as any);

  let branch: unknown[] = [];
  const ctx = { hasUI: false, sessionManager: { getBranch: () => branch } };

  const run = async (params: unknown) => {
    const result = await tool!.execute('call', params);
    branch = [
      ...branch,
      { type: 'message', message: { role: 'toolResult', toolName: 'todo', ...result } },
    ];
    return result;
  };
  const navigate = (length: number) => {
    branch = branch.slice(0, length);
    handlers.get('session_tree')!({}, ctx);
  };
  const start = () => handlers.get('session_start')!({ reason: 'resume' }, ctx);

  return { run, navigate, start };
};

test('navigating back restores todos that were toggled later', async () => {
  const { run, navigate } = setup();
  await run({ action: 'add', text: 'A' });
  await run({ action: 'add', text: 'B' });
  await run({ action: 'toggle', id: 1 });
  navigate(2);
  const list = await run({ action: 'list' });
  assert.equal(list.content[0].text, '[ ] #1: A\n[ ] #2: B');
});

test('navigating back restores todos after adding to a reloaded list', async () => {
  const { run, navigate, start } = setup();
  await run({ action: 'add', text: 'A' });
  start();
  await run({ action: 'add', text: 'B' });
  navigate(1);
  const list = await run({ action: 'list' });
  assert.equal(list.content[0].text, '[ ] #1: A');
});
