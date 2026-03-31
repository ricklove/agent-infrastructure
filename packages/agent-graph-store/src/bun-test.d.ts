declare module "bun:test" {
  export const describe: (label: string, body: () => void) => void
  export const test: (label: string, body: () => void | Promise<void>) => void
  export function expect<T>(value: T): {
    toBe(expected: unknown): void
    toEqual(expected: unknown): void
    toBeNull(): void
  }
}
