export function lazyGetter<T extends object>(fn: () => T): T {
  let value: T | undefined;
  return new Proxy<T>({} as T, {
    get(_target, prop: string | symbol) {
      if (!value) {
        value = fn();
      }
      return value[prop as keyof T];
    },
  });
}
