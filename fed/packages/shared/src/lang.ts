export const EMPTY_OBJECT = {};

export const EMPTY_ARRAY = [];

export const EMPTY_FUNCTION = () => {};

export const EMPTY_PROMISE = /* @__PURE__ */ Promise.resolve();

export const TRUE = () => true;

export const FALSE = () => false;

export const IDENTITY = <T>(value: T) => value;

export function isUndefined(target: any): target is undefined {
  return target === undefined;
}

export function isNull(target: any): target is null {
  return target === null;
}

export function isBoolean(target: any, type: string = typeof target): target is boolean {
  return type === "boolean";
}

export function isNumber(target: any, type: string = typeof target): target is number {
  return type === "number";
}

export function isString(target: any, type: string = typeof target): target is string {
  return type === "string";
}

export function isBigint(target: any, type: string = typeof target): target is bigint {
  return type === "bigint";
}

export function isSymbol(target: any, type: string = typeof target): target is symbol {
  return type === "symbol";
}

export function isFunction(
  target: any,
  type: string = typeof target,
): target is (...args: any[]) => any {
  return type === "function";
}

export function isObject(target: any, type: string = typeof target): target is object {
  return type === "object" && !isNull(target);
}

export function isArray(target: any): target is unknown[] {
  return Array.isArray(target);
}

export function isNullish(target: any): target is undefined | null {
  return isUndefined(target) || isNull(target);
}

export function isPlainObject(target: any) {
  if (
    target &&
    (target.constructor === Object ||
      target.constructor === null ||
      (typeof target === "object" && Object.getPrototypeOf(target) === null))
  ) {
    return true;
  }

  return false;
}

const {
  prototype: { hasOwnProperty: $hasOwnProperty },
} = Object;

export function hasOwnProperty(target: any, key: PropertyKey) {
  if (isNullish(target)) {
    return false;
  }

  return $hasOwnProperty.call(target, key);
}

export function strictEquals(a: any, b: any) {
  return Object.is(a, b);
}

export function shallowEquals(a: any, b: any) {
  if (strictEquals(a, b)) {
    return true;
  }

  if (typeof a !== typeof b) {
    return false;
  }

  if (isArray(a) && isArray(b)) {
    if (a.length !== b.length) {
      return false;
    }

    for (let index = 0, { length } = a; index < length; index += 1) {
      if (!strictEquals(a[index], b[index])) {
        return false;
      }
    }

    return true;
  }

  if (isPlainObject(a) && isPlainObject(b)) {
    const xKeys = Object.keys(a);
    const yKeys = Object.keys(b);

    if (xKeys.length !== yKeys.length) {
      return false;
    }

    for (let index = 0, { length } = xKeys; index < length; index += 1) {
      const key = xKeys[index];

      if (!hasOwnProperty(b, key) || !strictEquals(a[key], b[key])) {
        return false;
      }
    }

    return true;
  }

  return false;
}
