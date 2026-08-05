import { z } from "zod";

export const coverThemes = [
  {
    id: "coastal-mist",
    label: "Coastal Mist",
    background: "linear-gradient(135deg, #b7cfdf 0%, #7fa3bd 100%)",
  },
  {
    id: "sunset-apricot",
    label: "Sunset Apricot",
    background: "linear-gradient(135deg, #f8d3b5 0%, #d9886c 100%)",
  },
  {
    id: "forest-lumen",
    label: "Forest Lumen",
    background: "linear-gradient(135deg, #99c3b2 0%, #3f7664 100%)",
  },
  {
    id: "twilight-ink",
    label: "Twilight Ink",
    background: "linear-gradient(135deg, #a9afdc 0%, #4b597f 100%)",
  },
  {
    id: "sandstone",
    label: "Sandstone",
    background: "linear-gradient(135deg, #e8dcc8 0%, #c3a982 100%)",
  },
] as const;

export type CoverThemeId = (typeof coverThemes)[number]["id"];

export const coverThemeIds = coverThemes.map((theme) => theme.id) as [
  CoverThemeId,
  ...CoverThemeId[],
];

export const coverThemeSchema = z.enum(coverThemeIds);

export const defaultCoverTheme: CoverThemeId = "coastal-mist";

export function resolveCoverTheme(value: unknown): CoverThemeId {
  const parsed = coverThemeSchema.safeParse(value);
  return parsed.success ? parsed.data : defaultCoverTheme;
}

export function coverThemeById(id: CoverThemeId) {
  return coverThemes.find((theme) => theme.id === id) ?? coverThemes[0];
}
