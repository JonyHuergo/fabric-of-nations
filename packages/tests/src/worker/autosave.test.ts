import {
  AutosaveScheduler,
  type AutosaveTimer,
} from "@century/sim-worker";

class ManualTimer implements AutosaveTimer {
  private now = 0;
  private nextId = 1;
  private readonly tasks = new Map<number, { readonly at: number; readonly callback: () => void }>();

  public setTimeout(callback: () => void, milliseconds: number): unknown {
    const id = this.nextId;
    this.nextId += 1;
    this.tasks.set(id, { at: this.now + milliseconds, callback });
    return id;
  }

  public clearTimeout(handle: unknown): void {
    this.tasks.delete(handle as number);
  }

  public advance(milliseconds: number): void {
    this.now += milliseconds;
    let ran = true;
    while (ran) {
      ran = false;
      const due = [...this.tasks.entries()]
        .filter(([, task]) => task.at <= this.now)
        .sort((left, right) => left[1].at - right[1].at)[0];
      if (due === undefined) return;
      this.tasks.delete(due[0]);
      due[1].callback();
      ran = true;
    }
  }

  public get count(): number {
    return this.tasks.size;
  }
}

describe("autosave scheduler (D-065)", () => {
  test("debounces repeated requests into one save", () => {
    const timer = new ManualTimer();
    let saves = 0;
    const scheduler = new AutosaveScheduler({
      delayMs: 500,
      canSave: () => true,
      save: () => {
        saves += 1;
      },
      timer,
    });
    expect(scheduler.request()).toBe(true);
    expect(scheduler.request()).toBe(false);
    scheduler.request();
    expect(timer.count).toBe(1);
    timer.advance(499);
    expect(saves).toBe(0);
    timer.advance(1);
    expect(saves).toBe(1);
    expect(timer.count).toBe(0);
  });

  test("does not schedule when saving is unsafe, and rechecks at fire time", () => {
    const timer = new ManualTimer();
    let safe = false;
    let saves = 0;
    const scheduler = new AutosaveScheduler({
      delayMs: 100,
      canSave: () => safe,
      save: () => {
        saves += 1;
      },
      timer,
    });
    expect(scheduler.request()).toBe(false);
    safe = true;
    expect(scheduler.request()).toBe(true);
    safe = false;
    timer.advance(100);
    expect(saves).toBe(0);
    safe = true;
    scheduler.request();
    timer.advance(100);
    expect(saves).toBe(1);
  });

  test("cancel and dispose leave no pending timer or late save", () => {
    const timer = new ManualTimer();
    let saves = 0;
    const scheduler = new AutosaveScheduler({
      delayMs: 100,
      canSave: () => true,
      save: () => {
        saves += 1;
      },
      timer,
    });
    scheduler.request();
    scheduler.cancel();
    expect(timer.count).toBe(0);
    scheduler.request();
    scheduler.dispose();
    expect(timer.count).toBe(0);
    timer.advance(1_000);
    expect(saves).toBe(0);
  });
});
