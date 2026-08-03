export function normalizeSearchText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function createSearchKeywords(values: string[]): string[] {
  const tokens = values
    .flatMap((value) => normalizeSearchText(value).split(" "))
    .filter((token) => token.length >= 2);

  return [...new Set(tokens)].slice(0, 50);
}
