// Minimal declarations for the Node built-ins used by these tests. The lead owns
// dependency manifests, so @types/node is not installed; this covers only the
// calls made here.

declare module 'node:test' {
  export function test(name: string, fn: () => void | Promise<void>): Promise<void>;
}

declare module 'node:assert/strict' {
  const assert: {
    (value: unknown, message?: string): asserts value;
    ok(value: unknown, message?: string): asserts value;
    equal<T>(actual: unknown, expected: T, message?: string): asserts actual is T;
    notEqual(actual: unknown, expected: unknown, message?: string): void;
    deepEqual<T>(actual: unknown, expected: T, message?: string): asserts actual is T;
    match(value: string, pattern: RegExp, message?: string): void;
    doesNotMatch(value: string, pattern: RegExp, message?: string): void;
    throws(fn: () => unknown, expected?: RegExp | object, message?: string): void;
    rejects(promise: Promise<unknown>, expected?: RegExp | object, message?: string): Promise<void>;
  };
  export default assert;
}

declare module 'node:fs' {
  export function readFileSync(path: string | URL, encoding: 'utf8'): string;
  export function readdirSync(path: string | URL): string[];
}
