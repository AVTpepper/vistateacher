import { z } from "zod";

export const coverThemes = [
  {
    id: "burgundy-bloom",
    label: "Burgundy Bloom",
    background: "linear-gradient(135deg, #a9759b 0%, #550527 100%)",
  },
  {
    id: "olive-sage",
    label: "Olive Sage",
    background: "linear-gradient(135deg, #b8c875 0%, #688E26 100%)",
  },
  {
    id: "warm-sunset",
    label: "Warm Sunset",
    background: "linear-gradient(135deg, #e8b5a0 0%, #d97d52 100%)",
  },
  {
    id: "amethyst-dusk",
    label: "Amethyst Dusk",
    background: "linear-gradient(135deg, #9d95b5 0%, #7a6f9b 100%)",
  },
  {
    id: "woodland-earth",
    label: "Woodland Earth",
    background: "linear-gradient(135deg, #a9a395 0%, #725e4a 100%)",
  },
] as const;

export type CoverThemeId = (typeof coverThemes)[number]["id"];

export const coverThemeIds = coverThemes.map((theme) => theme.id) as [
  CoverThemeId,
  ...CoverThemeId[],
];

export const coverThemeSchema = z.enum(coverThemeIds);

export const defaultCoverTheme: CoverThemeId = "burgundy-bloom";

export function resolveCoverTheme(value: unknown): CoverThemeId {
  const parsed = coverThemeSchema.safeParse(value);
  return parsed.success ? parsed.data : defaultCoverTheme;
}

export function coverThemeById(id: CoverThemeId) {
  return coverThemes.find((theme) => theme.id === id) ?? coverThemes[0];
}
