export function lazyGetter<T extends object>(fn: () => T): T;
export function lazyGetter(fn: () => object) {
  let value: object | undefined;
  return new Proxy(
    {},
    {
      get(_target, prop: string | symbol) {
        if (!value) {
          value = fn();
        }
        return readProperty(value, prop);
      },
    },
  );
}

function readProperty<TTarget extends object>(target: TTarget, prop: string | symbol) {
  let current: object | null = target;
  while (current) {
    const descriptor = Object.getOwnPropertyDescriptor(current, prop);
    if (descriptor) {
      if (descriptor.get) {
        return descriptor.get.call(target);
      }
      return descriptor.value;
    }
    current = Object.getPrototypeOf(current);
  }
  return undefined;
}
