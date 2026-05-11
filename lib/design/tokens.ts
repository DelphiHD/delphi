// Design tokens for HD Reports. All values here are TBD until Kaycee finalizes
// the visual identity. Phase 1 ships a neutral zinc-based palette; the values
// below will be replaced wholesale once IDENTITY.md is filled in.

export const colors = {
  // TBD: brand primary. Currently the Tailwind zinc-900 neutral.
  primary: "#18181b",
  // TBD: brand accent.
  accent: "#52525b",
  // TBD: background tones.
  background: "#ffffff",
  backgroundDark: "#0a0a0a",
  // TBD: text tones.
  foreground: "#171717",
  foregroundDark: "#ededed",
  // TBD: semantic colors (success, warning, error).
  success: "#059669",
  warning: "#d97706",
  error: "#dc2626",
} as const;

export const fonts = {
  // TBD: replace with brand-chosen typeface once the type stack is final.
  sans: "var(--font-geist-sans)",
  mono: "var(--font-geist-mono)",
  // TBD: a serif for long-form report body copy.
  serif: "Georgia, 'Times New Roman', serif",
} as const;

export const radius = {
  sm: "0.25rem",
  md: "0.5rem",
  lg: "0.75rem",
  // TBD: pill, used for primary CTAs.
  pill: "9999px",
} as const;

export const spacing = {
  // TBD: bespoke spacing scale. Currently aligned to Tailwind default.
  pageGutter: "1.5rem",
  pageMaxWidth: "48rem",
} as const;
