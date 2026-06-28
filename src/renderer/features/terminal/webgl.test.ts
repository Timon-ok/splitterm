import { describe, it, expect, vi, beforeEach } from 'vitest';

// Drive the real WebglAddon out of the picture: a controllable stub lets us simulate WebGL being
// unavailable (constructor throws), a context that fails to initialize (loadAddon throws), and a
// context lost at runtime (invoke the registered onContextLoss). vi.hoisted keeps the shared state
// reachable from the hoisted vi.mock factory.
const h = vi.hoisted(() => {
  const state = { constructThrows: false, instances: [] as Array<{ lossCb: (() => void) | null; disposed: boolean }> };
  class FakeWebglAddon {
    lossCb: (() => void) | null = null;
    disposed = false;
    constructor() {
      if (state.constructThrows) throw new Error('WebGL2 unavailable');
      state.instances.push(this);
    }
    onContextLoss(cb: () => void): void {
      this.lossCb = cb;
    }
    dispose(): void {
      this.disposed = true;
    }
  }
  return { state, FakeWebglAddon };
});

vi.mock('@xterm/addon-webgl', () => ({ WebglAddon: h.FakeWebglAddon }));

// Minimal terminal: loadAddon can be told to throw to simulate a GL context that won't initialize.
function makeTerm(loadThrows = false): { loadAddon: (a: unknown) => void } {
  return { loadAddon: vi.fn(() => { if (loadThrows) throw new Error('context init failed'); }) };
}

// Fresh module per test so the module-level context counter starts at 0.
async function freshModule(): Promise<typeof import('./webgl')> {
  vi.resetModules();
  return import('./webgl');
}

beforeEach(() => {
  h.state.constructThrows = false;
  h.state.instances.length = 0;
});

describe('tryAttachWebgl', () => {
  it('attaches, tracks the context, and frees it on dispose', async () => {
    const { tryAttachWebgl, activeWebglContexts } = await freshModule();
    const term = makeTerm();
    const handle = tryAttachWebgl(term as never);
    expect(handle).not.toBeNull();
    expect(activeWebglContexts()).toBe(1);
    expect(term.loadAddon).toHaveBeenCalledOnce();

    handle!.dispose();
    expect(activeWebglContexts()).toBe(0);
    expect(h.state.instances[0]!.disposed).toBe(true);
  });

  it('falls back (returns null) when WebGL is unavailable, without consuming budget', async () => {
    const { tryAttachWebgl, activeWebglContexts } = await freshModule();
    h.state.constructThrows = true;
    expect(tryAttachWebgl(makeTerm() as never)).toBeNull();
    expect(activeWebglContexts()).toBe(0);
  });

  it('falls back and rolls back the budget when GL init throws', async () => {
    const { tryAttachWebgl, activeWebglContexts } = await freshModule();
    expect(tryAttachWebgl(makeTerm(true) as never)).toBeNull();
    expect(activeWebglContexts()).toBe(0); // the increment was undone
    // a subsequent healthy attach still works (the failed one didn't leak a slot)
    expect(tryAttachWebgl(makeTerm() as never)).not.toBeNull();
    expect(activeWebglContexts()).toBe(1);
  });

  it('caps live contexts and reuses a freed slot', async () => {
    const { tryAttachWebgl, activeWebglContexts } = await freshModule();
    const handles = Array.from({ length: 8 }, () => tryAttachWebgl(makeTerm() as never));
    expect(handles.every(Boolean)).toBe(true);
    expect(activeWebglContexts()).toBe(8);

    expect(tryAttachWebgl(makeTerm() as never)).toBeNull(); // 9th over budget → DOM renderer
    expect(activeWebglContexts()).toBe(8);

    handles[0]!.dispose();
    expect(activeWebglContexts()).toBe(7);
    expect(tryAttachWebgl(makeTerm() as never)).not.toBeNull(); // freed slot granted again
    expect(activeWebglContexts()).toBe(8);
  });

  it('frees the slot on context loss and dispose stays idempotent', async () => {
    const { tryAttachWebgl, activeWebglContexts } = await freshModule();
    const handle = tryAttachWebgl(makeTerm() as never);
    expect(activeWebglContexts()).toBe(1);

    h.state.instances[0]!.lossCb!(); // the GPU drops the context
    expect(activeWebglContexts()).toBe(0);
    expect(h.state.instances[0]!.disposed).toBe(true);

    handle!.dispose(); // explicit close afterward must not double-decrement
    expect(activeWebglContexts()).toBe(0);
  });
});
