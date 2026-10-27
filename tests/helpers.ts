import type { LockProvider } from "../packages/web/src/storage/store.js";
import { DomainError } from "@shop/domain";

export class MemoryStorage {
  values = new Map<string, string>();

  fail = false;

  writes = 0;

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    if (this.fail) throw new Error("QuotaExceededError");
    this.writes++;
    this.values.set(key, value);
  }
}
export class TestLocks implements LockProvider {
  private queues = new Map<string, Promise<unknown>>();

  async run<T>(
    name: string,
    ifAvailable: boolean,
    task: () => Promise<T> | T,
  ): Promise<T> {
    const previous = this.queues.get(name);

    if (ifAvailable && previous)
      throw new DomainError(
        "STATE_CONFLICT",
        "Another tab is editing this workspace.",
      );

    const result = (previous ?? Promise.resolve()).catch(() => {}).then(task);

    this.queues.set(name, result);

    try {
      return await result;
    } finally {
      if (this.queues.get(name) === result) this.queues.delete(name);
    }
  }
}
