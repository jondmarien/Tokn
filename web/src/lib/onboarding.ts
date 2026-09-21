/**
 * Whether this browser has already been offered the setup flow.
 *
 * ## Why a cookie and not a column
 *
 * The obvious home for this is a field on the profile row, and the obvious
 * shortcut is the existing `prefs` blob. Neither survives contact:
 *
 * `prefs` is parsed with a whitelist and re-serialised from four known keys, so
 * anything else stored there is erased the next time someone saves their
 * profile appearance. A real column means an Appwrite attribute, which means a
 * provisioning run against production with an API key — a schema migration to
 * decide whether a tutorial opens.
 *
 * So the durable half of the signal is something the database already knows:
 * an account with no linked machine has not finished setting up, which is
 * exactly who the flow is for and exactly who stops matching it once they
 * link. The cookie only carries the part the database cannot know — that this
 * person was already shown the flow and chose to skip it.
 *
 * The consequence, accepted deliberately: someone who skips setup and later
 * opens the site in a different browser is offered it again. For an unfinished
 * setup that is closer to right than wrong, and it costs one dismissal.
 */

export const SETUP_SEEN_COOKIE = "tokn_setup_seen";

/** A year. Long enough that it never expires in a session that matters. */
export const SETUP_SEEN_MAX_AGE = 60 * 60 * 24 * 365;
