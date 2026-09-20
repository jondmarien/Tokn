import { permanentRedirect } from "next/navigation";

/**
 * Settings moved under the account section. Kept as a redirect because the old
 * path is in the wild — bookmarks, and the footer of every page shipped so far.
 */
export default function SettingsMoved() {
  permanentRedirect("/account/settings");
}
