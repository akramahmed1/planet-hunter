// "1 sector", "4 sectors": the noun agrees with the count. Pass the plural for irregular nouns.
export function noun(n: number, one: string, many: string = `${one}s`): string {
  return n === 1 ? one : many;
}

export function count(n: number, one: string, many?: string): string {
  return `${n} ${noun(n, one, many)}`;
}
