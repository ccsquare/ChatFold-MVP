import { Counter, EMPTY_OBJECT, randomString } from "@simplex/shared";

const ID_COUNTER = /* @__PURE__ */ new Counter(0);

export interface CreateIdOptions {
  prefix?: string;
  createIdValue?(current: number, prefix?: string): string;
}

export function createId(options: CreateIdOptions = EMPTY_OBJECT) {
  const { prefix, createIdValue = createIdValueWithDash } = options;

  return createIdValue(ID_COUNTER.next(), prefix);
}

function createIdValueWithDash(current: number, prefix?: string) {
  return [prefix || "id", current.toString(16), randomString(4)].join("-");
}
