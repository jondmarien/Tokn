"use client";

import { useState } from "react";

/**
 * The two visibility switches.
 *
 * They are related but not the same thing, and the relationship only goes one
 * way: a private profile cannot be on the leaderboard, but a public one is free
 * to opt out of being ranked. Making the profile private therefore disables and
 * visually forces the leaderboard switch rather than silently contradicting it.
 *
 * Client-side so that dependency is visible as you click, and so the wording
 * underneath can say what the current combination actually means.
 */
export function Visibility({
  initialPublic,
  initialListed,
}: {
  initialPublic: boolean;
  initialListed: boolean;
}) {
  const [isPublic, setPublic] = useState(initialPublic);
  const [listed, setListed] = useState(initialListed);

  const effectivelyListed = isPublic && listed;

  return (
    <>
      <input type="hidden" name="isPublic" value={isPublic ? "on" : "off"} />
      <input type="hidden" name="listed" value={effectivelyListed ? "on" : "off"} />

      <div className="setting">
        <div className="setting-label">
          profile
          <small>who can open your profile page</small>
        </div>
        <div>
          <Switch
            checked={isPublic}
            onChange={setPublic}
            label={isPublic ? "public" : "private"}
          />
          <p className="micro" style={{ marginTop: "0.5rem" }}>
            {isPublic
              ? "anyone with the link can see your profile."
              : "only you can see your profile. to everyone else the page does not exist."}
          </p>
        </div>
      </div>

      <div className="setting">
        <div className="setting-label">
          leaderboard
          <small>whether you are ranked</small>
        </div>
        <div>
          <Switch
            checked={effectivelyListed}
            onChange={setListed}
            disabled={!isPublic}
            label={effectivelyListed ? "listed" : "not listed"}
          />
          <p className="micro" style={{ marginTop: "0.5rem" }}>
            {!isPublic
              ? "a private profile is never listed."
              : effectivelyListed
                ? "you appear on the leaderboard and in the records on the stats page."
                : "your profile stays public, but you are not ranked and not named anywhere. your usage still counts toward the site-wide totals."}
          </p>
        </div>
      </div>
    </>
  );
}

function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className="switch"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span className="track" data-on={checked} aria-hidden="true">
        <span className="knob" />
      </span>
      <span className="switch-label">{label}</span>
    </button>
  );
}
