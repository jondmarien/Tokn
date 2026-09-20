/**
 * The site theme catalogue.
 *
 * One source of truth: the stylesheet for every theme is generated from this
 * array at render time, and the swatches in the picker read the same values.
 * A theme declared here needs no CSS written by hand, and a swatch can never
 * disagree with what selecting it actually does.
 *
 * Five colours each, matching the variables the whole interface reads:
 *
 *   bg     the page
 *   alt    recessed surfaces — table rows, inputs, buttons at rest
 *   sub    muted text, labels, secondary figures
 *   text   body text and headline figures
 *   main   the accent, which only ever marks the thing you are looking at
 *
 * `on-main` and the avatar tones are derived rather than declared, so adding a
 * theme is five hex values and a name.
 */

export interface Theme {
  id: string;
  name: string;
  bg: string;
  alt: string;
  sub: string;
  text: string;
  main: string;
}

export const DEFAULT_THEME = "tokn";

/**
 * Sorted by name, except the two house themes which lead. Everything else is
 * alphabetical so the list is scannable and the search is predictable.
 */
export const THEMES: Theme[] = [
  // The house pair. `tokn` is the default and matches the design the site
  // was built in; everything below is a guest.
  { id: "tokn", name: "tokn", bg: "#121214", alt: "#1b1b1e", sub: "#73737b", text: "#d9d9d6", main: "#ccff33" },
  { id: "tokn-light", name: "tokn light", bg: "#f6f6f4", alt: "#ebebe7", sub: "#85857e", text: "#26262a", main: "#5c8a0a" },

  { id: "aether", name: "aether", bg: "#1b1b2b", alt: "#26263c", sub: "#6f6f93", text: "#e6e6f5", main: "#c792ea" },
  { id: "alduin", name: "alduin", bg: "#1c1c1c", alt: "#262626", sub: "#6f6f6f", text: "#d3c2a5", main: "#c1a875" },
  { id: "aurora", name: "aurora", bg: "#0f1e28", alt: "#17303d", sub: "#4f7d8c", text: "#d8f2f7", main: "#4fd6be" },
  { id: "bento", name: "bento", bg: "#2d394d", alt: "#39465c", sub: "#7b8aa3", text: "#f7f7f7", main: "#ff7f7f" },
  { id: "bushido", name: "bushido", bg: "#1f1f26", alt: "#2b2b33", sub: "#6d6d7c", text: "#f2f2f2", main: "#e64c4c" },
  { id: "carbon", name: "carbon", bg: "#313131", alt: "#3d3d3d", sub: "#7d7d7d", text: "#f5f5f5", main: "#f66e0d" },
  { id: "cyberspace", name: "cyberspace", bg: "#181c26", alt: "#222836", sub: "#5c6780", text: "#e4e9f5", main: "#00e5ff" },
  { id: "dark-magic-girl", name: "dark magic girl", bg: "#0b0b12", alt: "#161620", sub: "#5f5f80", text: "#e8e8f5", main: "#f76ac8" },
  { id: "dracula", name: "dracula", bg: "#282a36", alt: "#343746", sub: "#6272a4", text: "#f8f8f2", main: "#bd93f9" },
  { id: "everforest", name: "everforest", bg: "#2d353b", alt: "#374247", sub: "#7a8478", text: "#d3c6aa", main: "#a7c080" },
  { id: "froyo", name: "froyo", bg: "#f2ece4", alt: "#e5dcd0", sub: "#8f8578", text: "#3b3530", main: "#d17b49" },
  { id: "github-dark", name: "github dark", bg: "#0d1117", alt: "#161b22", sub: "#6e7681", text: "#c9d1d9", main: "#58a6ff" },
  { id: "gruvbox-dark", name: "gruvbox dark", bg: "#282828", alt: "#32302f", sub: "#7c6f64", text: "#ebdbb2", main: "#d79921" },
  { id: "gruvbox-light", name: "gruvbox light", bg: "#fbf1c7", alt: "#f2e5bc", sub: "#928374", text: "#3c3836", main: "#b57614" },
  { id: "honey", name: "honey", bg: "#f2c94c", alt: "#e0b93f", sub: "#8a6d1e", text: "#332b0b", main: "#a15c00" },
  { id: "horizon", name: "horizon", bg: "#1c1e26", alt: "#232530", sub: "#6c6f93", text: "#e0e0e0", main: "#e95678" },
  { id: "iceberg-dark", name: "iceberg dark", bg: "#161821", alt: "#1e2132", sub: "#6b7089", text: "#c6c8d1", main: "#84a0c6" },
  { id: "laser", name: "laser", bg: "#1a1423", alt: "#251c33", sub: "#6b5b85", text: "#f2e9ff", main: "#ff2e88" },
  { id: "lavender", name: "lavender", bg: "#1e1b2e", alt: "#292540", sub: "#6e678f", text: "#ece8ff", main: "#a78bfa" },
  { id: "matcha", name: "matcha", bg: "#2c2e31", alt: "#37393c", sub: "#6c6f74", text: "#d1d0c5", main: "#a4cc79" },
  { id: "menthol", name: "menthol", bg: "#0e1f1c", alt: "#152b27", sub: "#4c7a70", text: "#d9f5ef", main: "#3ddc97" },
  { id: "midnight", name: "midnight", bg: "#06080f", alt: "#0d1220", sub: "#4a5578", text: "#dfe6ff", main: "#6c8cff" },
  { id: "milkshake", name: "milkshake", bg: "#ffffff", alt: "#f0f0f2", sub: "#9b9ba6", text: "#1c1c1f", main: "#6b5bd2" },
  { id: "mint", name: "mint", bg: "#052e26", alt: "#0f2a22", sub: "#4f8a75", text: "#e2fff3", main: "#5eead4" },
  { id: "modern-ink", name: "modern ink", bg: "#ffffff", alt: "#efefef", sub: "#8c8c8c", text: "#101010", main: "#ff3c00" },
  { id: "mono", name: "mono", bg: "#101010", alt: "#1a1a1a", sub: "#6e6e6e", text: "#ededed", main: "#ededed" },
  { id: "nautilus", name: "nautilus", bg: "#132237", alt: "#1b2f48", sub: "#5a7694", text: "#dbe9f7", main: "#f6c177" },
  { id: "nord", name: "nord", bg: "#2e3440", alt: "#3b4252", sub: "#6b7791", text: "#eceff4", main: "#88c0d0" },
  { id: "nord-light", name: "nord light", bg: "#eceff4", alt: "#e0e4eb", sub: "#7b8494", text: "#2e3440", main: "#5e81ac" },
  { id: "olive", name: "olive", bg: "#242a1e", alt: "#2f3628", sub: "#72805f", text: "#e8eede", main: "#b8d96a" },
  { id: "paper", name: "paper", bg: "#eeeeee", alt: "#e0e0e0", sub: "#8c8c8c", text: "#444444", main: "#444444" },
  { id: "peaches", name: "peaches", bg: "#2b1f1c", alt: "#3a2b26", sub: "#8a6c5f", text: "#f7e6dd", main: "#ff9f6e" },
  { id: "phantom", name: "phantom", bg: "#0b0f1a", alt: "#141a2b", sub: "#4f5a7d", text: "#e3e8f7", main: "#7c6bff" },
  { id: "red-dragon", name: "red dragon", bg: "#1a0d0d", alt: "#2a1414", sub: "#8a5a5a", text: "#f5e6e6", main: "#ff3b30" },
  { id: "repose-dark", name: "repose dark", bg: "#2b2b28", alt: "#36362f", sub: "#7d7d70", text: "#dcd7ba", main: "#c8c093" },
  { id: "rose-pine", name: "rose pine", bg: "#191724", alt: "#1f1d2e", sub: "#6e6a86", text: "#e0def4", main: "#ebbcba" },
  { id: "rose-pine-dawn", name: "rose pine dawn", bg: "#faf4ed", alt: "#f2e9e1", sub: "#9893a5", text: "#575279", main: "#b4637a" },
  { id: "serika", name: "serika", bg: "#e1e1e3", alt: "#d1d1d3", sub: "#8c8c8f", text: "#323437", main: "#e2b714" },
  { id: "serika-dark", name: "serika dark", bg: "#323437", alt: "#2c2e31", sub: "#787d84", text: "#d1d0c5", main: "#e2b714" },
  { id: "sewing-tin", name: "sewing tin", bg: "#14142b", alt: "#1d1d3a", sub: "#5c5c8a", text: "#ffffff", main: "#ffd93d" },
  { id: "sonokai", name: "sonokai", bg: "#2c2e34", alt: "#33353f", sub: "#7f8490", text: "#e2e2e3", main: "#e7c664" },
  { id: "strawberry", name: "strawberry", bg: "#fff0f3", alt: "#ffe0e7", sub: "#a87d88", text: "#3d1420", main: "#e0224e" },
  { id: "sunset", name: "sunset", bg: "#2a1c2b", alt: "#372639", sub: "#8a6b85", text: "#f7e8f2", main: "#ff8c69" },
  { id: "superuser", name: "superuser", bg: "#1c2326", alt: "#263033", sub: "#5f7a7d", text: "#e3f2ef", main: "#4aff9f" },
  { id: "tangerine", name: "tangerine", bg: "#ffeedd", alt: "#ffe0c4", sub: "#a8744a", text: "#3d2414", main: "#e8590c" },
  { id: "terminal", name: "terminal", bg: "#0f1410", alt: "#17201a", sub: "#5c7f63", text: "#cbe3cf", main: "#45ff8f" },
  { id: "terra", name: "terra", bg: "#131a13", alt: "#1c261c", sub: "#5c7a5c", text: "#e8f0e2", main: "#9ccc65" },
  { id: "tokyo-night", name: "tokyo night", bg: "#1a1b26", alt: "#24283b", sub: "#565f89", text: "#c0caf5", main: "#7aa2f7" },
  { id: "trance", name: "trance", bg: "#120c1c", alt: "#1c1329", sub: "#5c4b7a", text: "#f2e9ff", main: "#ff2f92" },
  { id: "tron-orange", name: "tron orange", bg: "#0b0b0b", alt: "#151515", sub: "#6b6b6b", text: "#f5f5f5", main: "#ff6a00" },
  { id: "vaporwave", name: "vaporwave", bg: "#241b2f", alt: "#30243f", sub: "#7a6a94", text: "#f5ecff", main: "#ff71ce" },
  { id: "vesper", name: "vesper", bg: "#101010", alt: "#1c1c1c", sub: "#7a7a7a", text: "#ffffff", main: "#ffc799" },
  { id: "viridescent", name: "viridescent", bg: "#1b2b26", alt: "#243832", sub: "#5f8578", text: "#e0f0e9", main: "#8fd6a9" },
  { id: "vscode", name: "vscode", bg: "#1e1e1e", alt: "#252526", sub: "#7a7a7a", text: "#d4d4d4", main: "#569cd6" },
  { id: "watermelon", name: "watermelon", bg: "#17301f", alt: "#1f3f2a", sub: "#5c8a6c", text: "#e8f7ec", main: "#ff5f7e" },
];

export const THEME_IDS = THEMES.map((theme) => theme.id);

export function findTheme(id: string | null | undefined): Theme {
  return THEMES.find((theme) => theme.id === id) ?? THEMES[0]!;
}

/* ------------------------------------------------------------- derivation */

/**
 * Relative luminance, the WCAG definition. Used to decide whether a colour
 * wants dark or light text on top of it, and whether a theme is a dark one.
 */
export function luminance(hex: string): number {
  const value = hex.replace("#", "").slice(0, 6).padEnd(6, "0");
  const channel = (offset: number) => {
    const raw = Number.parseInt(value.slice(offset, offset + 2), 16) / 255;
    return raw <= 0.03928 ? raw / 12.92 : ((raw + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

export const isDark = (theme: Theme): boolean => luminance(theme.bg) < 0.25;

/** Text that sits on top of the accent, picked for contrast rather than declared. */
export const onMain = (theme: Theme): string =>
  luminance(theme.main) > 0.4 ? "#101014" : "#ffffff";

/**
 * The generated stylesheet.
 *
 * Emitted once into the document head. `data-dark` rides alongside `data-theme`
 * so rules that need to know "is this a dark theme" — profile accents, the
 * generated avatars — do not have to enumerate theme names.
 */
export function themeStylesheet(): string {
  return THEMES.map((theme) => {
    const dark = isDark(theme);
    return `html[data-theme="${theme.id}"]{--bg:${theme.bg};--sub-alt:${theme.alt};--sub:${theme.sub};--text:${theme.text};--main:${theme.main};--on-main:${onMain(theme)};--av-base:${dark ? "20%" : "84%"};--av-tint:${dark ? "36%" : "62%"};color-scheme:${dark ? "dark" : "light"}}`;
  }).join("\n");
}
