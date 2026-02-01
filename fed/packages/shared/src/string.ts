export function randomString(size: number, radix: number = 36): string {
  let result = "";

  while (result.length < size) {
    result += Math.random().toString(radix).slice(2);
  }

  return result.length > size ? result.slice(0, size) : result;
}
