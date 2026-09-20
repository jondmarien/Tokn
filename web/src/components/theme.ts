import { DEFAULT_THEME, THEMES, isDark } from "@/lib/themes";

/**
 * Theme persistence and the inline boot script.
 *
 * No React here, so the server layout can import the boot script without
 * pulling a client component into it.
 */

export const THEME_KEY = "tokn-theme";

export { DEFAULT_THEME };

/**
 * Runs before first paint, so the page never flashes the default and then
 * corrects itself.
 *
 * It sets two attributes. `data-theme` selects the palette; `data-dark` lets
 * rules that only care whether the ground is dark — profile accents, the
 * generated avatars — avoid enumerating fifty theme names.
 */
export const themeBootScript = `
(function () {
  var dark = ${JSON.stringify(Object.fromEntries(THEMES.map((theme) => [theme.id, isDark(theme)])))};
  var fallback = ${JSON.stringify(DEFAULT_THEME)};
  var root = document.documentElement;
  try {
    var stored = localStorage.getItem(${JSON.stringify(THEME_KEY)});
    var id = Object.prototype.hasOwnProperty.call(dark, stored) ? stored : fallback;
    root.dataset.theme = id;
    root.dataset.dark = String(dark[id]);
  } catch (e) {
    root.dataset.theme = fallback;
    root.dataset.dark = String(dark[fallback]);
  }
})();
`;
