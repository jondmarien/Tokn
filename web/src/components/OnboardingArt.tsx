/**
 * The four illustrations in the welcome flow.
 *
 * Drawn rather than photographed, and animated in CSS rather than shipped as
 * GIFs or videos. That choice is not just about file size: these inherit the
 * reader's accent through the theme tokens, so they stay correct in every one
 * of the site's palettes and sharp at any size. A raster mock would be wrong in
 * eleven themes out of twelve and blurry on a retina display.
 *
 * Every animation is wrapped in a prefers-reduced-motion guard. Motion here is
 * decoration, showing a thing happening that the text already says, so for a
 * reader who has asked for less of it the art holds still in its finished state
 * rather than degrading to nothing.
 *
 * ## Two traps, both paid for
 *
 * Every class below is prefixed. The first version used plain names like "bar",
 * the app's stylesheet already had a .bar progress component at height 3px, and
 * because width/height/r/y are *presentation attributes* on SVG geometry, any
 * stylesheet rule outranks the attribute on the element. Eight bars with
 * height="34" upward silently rendered as 3px dashes. Nothing warns about this.
 *
 * And geometry is revealed with clip-path, never scaleY. Scaling an SVG shape
 * needs transform-box: fill-box before transform-origin means the shape's own
 * box instead of the viewport, which is a second silent failure of the same
 * kind. A clip needs no origin, so it cannot be anchored wrong.
 */

const STYLE = `
  .art { width: 100%; height: auto; display: block; }
  .art .a-bg { fill: var(--sub-alt); }
  .art .a-line { stroke: var(--sub); stroke-width: 1.5; fill: none; stroke-linecap: round; }
  .art .a-dim { fill: var(--sub); }
  .art .a-text { fill: var(--text); }
  .art .a-accent { fill: var(--main); }

  /* --- typing: a caret stepping along a line of characters -------------- */
  @keyframes a-caret { 0%, 45% { opacity: 1 } 50%, 95% { opacity: 0 } 100% { opacity: 1 } }
  /* The caret travels with the reveal rather than sitting where the text will
     eventually end. A caret that does not track what is being typed reads as a
     rendering fault rather than as typing. Both use steps(22), one step per
     character of the command, so they land together. */
  .art .a-caret { animation: a-caret 1.1s steps(1) infinite, a-track 2.6s steps(22) infinite; }
  @keyframes a-track {
    0%       { transform: translateX(-139px) }
    45%,100% { transform: translateX(0) }
  }
  .art .a-typed { animation: a-reveal 2.6s steps(22) infinite; }
  @keyframes a-reveal {
    0%      { clip-path: inset(0 100% 0 0) }
    45%,80% { clip-path: inset(0 0 0 0) }
    100%    { clip-path: inset(0 0 0 0) }
  }

  /* --- a packet travelling down a wire ---------------------------------- */
  @keyframes a-travel {
    0%   { offset-distance: 0%;   opacity: 0 }
    12%  { opacity: 1 }
    88%  { opacity: 1 }
    100% { offset-distance: 100%; opacity: 0 }
  }
  .art .a-packet {
    offset-path: path("M 40 96 C 96 96, 104 60, 160 60");
    animation: a-travel 2.2s ease-in-out infinite;
  }

  /* --- a soft pulse, for the thing that just received something --------- */
  @keyframes a-pulse { 0%,100% { opacity: .25; r: 16 } 50% { opacity: 0; r: 30 } }
  .art .a-pulse { animation: a-pulse 2.2s ease-out infinite; }

  /* --- a padlock opening ------------------------------------------------ */
  /* Modelled on the iOS/macOS unlock: the shackle does not simply slide up, it
     springs past its resting height and settles back. That overshoot is the
     whole character of the motion — a linear lift reads as a diagram, and the
     same glyph with a spring reads as a mechanism releasing.

     Pure translateY, deliberately. A rotation or scale would need
     transform-box: fill-box to anchor correctly on an SVG element, and that
     failure mode is silent (see the header). A translate needs no origin. */
  .art .a-shackle { animation: a-unlock 2.8s ease-in-out infinite; }
  @keyframes a-unlock {
    0%, 32%  { transform: translateY(0) }
    46%      { transform: translateY(-17px) }
    56%, 86% { transform: translateY(-14px) }
    100%     { transform: translateY(0) }
  }

  /* The pulse Apple plays on a successful authentication, timed to the instant
     the shackle breaks free rather than to the start of the lift. */
  .art .a-unlock-ring { fill: none; stroke: var(--main); stroke-width: 2; }
  .art .a-unlock-ring { animation: a-unlock-ring 2.8s ease-out infinite; }
  @keyframes a-unlock-ring {
    0%, 40%   { opacity: 0;  r: 32 }
    50%       { opacity: .5; r: 38 }
    74%, 100% { opacity: 0;  r: 54 }
  }

  /* --- bars growing, for the payoff screen ------------------------------ */
  @keyframes a-grow {
    from { clip-path: inset(100% 0 0 0) }
    to   { clip-path: inset(0 0 0 0) }
  }
  .art .a-bar { animation: a-grow .9s cubic-bezier(.2,.8,.3,1) both; }

  @media (prefers-reduced-motion: reduce) {
    .art .a-caret, .art .a-typed, .art .a-packet, .art .a-pulse, .art .a-bar,
    .art .a-shackle, .art .a-unlock-ring {
      animation: none;
    }
    .art .a-caret { transform: translateX(0); opacity: 1; }
    .art .a-typed { clip-path: none; }
    .art .a-packet { offset-distance: 100%; opacity: 1; }
    .art .a-bar { clip-path: inset(0 0 0 0); }
    .art .a-shackle { transform: translateY(-14px); }
    .art .a-unlock-ring { opacity: 0; }
  }
`;

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <svg className="art" viewBox="0 0 320 180" role="img" aria-hidden="true">
      <style>{STYLE}</style>
      {children}
    </svg>
  );
}

/** A terminal chrome, reused by two of the four panels. */
function Window({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <>
      <rect className="a-bg" x="24" y="26" width="272" height="128" rx="10" />
      <rect x="24" y="26" width="272" height="26" rx="10" fill="var(--bg)" opacity="0.45" />
      <circle cx="42" cy="39" r="3.5" className="a-dim" opacity="0.5" />
      <circle cx="54" cy="39" r="3.5" className="a-dim" opacity="0.35" />
      <circle cx="66" cy="39" r="3.5" className="a-dim" opacity="0.25" />
      <text x="160" y="43" className="a-dim" fontSize="9" textAnchor="middle" fontFamily="monospace">
        {title}
      </text>
      {children}
    </>
  );
}

/** Step 1 — the install command being typed. */
export function ArtInstall() {
  return (
    <Frame>
      <Window title="terminal">
        <g fontFamily="monospace" fontSize="11">
          <text x="44" y="78" className="a-accent">
            $
          </text>
          <g className="a-typed">
            <text x="58" y="78" className="a-text">
              npm install -g toknhq
            </text>
          </g>
          <rect className="a-accent a-caret" x="196" y="69" width="6" height="12" rx="1" />
          <text x="44" y="100" className="a-dim" fontSize="10">
            added 1 package in 2s
          </text>
          <text x="44" y="122" className="a-accent">
            $
          </text>
          <text x="58" y="122" className="a-dim" fontSize="11">
            tokn
          </text>
        </g>
      </Window>
    </Frame>
  );
}

/** Step 2 — a code leaving the browser and arriving at a machine. */
export function ArtLink() {
  return (
    <Frame>
      {/* the browser, holding the code */}
      <rect className="a-bg" x="18" y="62" width="70" height="68" rx="8" />
      <rect x="18" y="62" width="70" height="16" rx="8" fill="var(--bg)" opacity="0.45" />
      <text
        x="53"
        y="104"
        className="a-accent"
        fontSize="13"
        fontFamily="monospace"
        textAnchor="middle"
      >
        A1B2
      </text>

      {/* the wire */}
      <path className="a-line" d="M 40 96 C 96 96, 104 60, 160 60" strokeDasharray="3 5" opacity="0.5" />
      <circle className="a-accent a-packet" r="4" />

      {/* the machine */}
      <rect className="a-bg" x="150" y="30" width="146" height="84" rx="8" />
      <rect x="150" y="30" width="146" height="18" rx="8" fill="var(--sub-alt)" opacity="0.6" />
      {/* On the wire's landing point, not over the text it would otherwise sit
          on top of and make unreadable. */}
      <circle className="a-accent a-pulse" cx="160" cy="60" r="16" />
      <g fontFamily="monospace" fontSize="10">
        <text x="174" y="74" className="a-accent">
          $
        </text>
        <text x="186" y="74" className="a-text">
          tokn link
        </text>
        <text x="174" y="94" className="a-dim">
          ✓ linked
        </text>
      </g>
      <rect className="a-dim" x="196" y="120" width="60" height="5" rx="2.5" opacity="0.3" />
    </Frame>
  );
}

/**
 * Step 3 — a padlock springing open.
 *
 * The shackle is drawn before the body so the body covers its legs; what you
 * see rise is the arc pulling out of a solid block, which is why the legs are
 * long enough to stay seated even at full lift. If they were short the lock
 * would come apart at the top of the travel.
 */
export function ArtSecure() {
  return (
    <Frame>
      <rect className="a-bg" x="96" y="26" width="128" height="128" rx="14" />

      {/* the success pulse, behind everything */}
      <circle className="a-unlock-ring" cx="160" cy="92" r="32" />

      {/* the shackle, drawn first so the body hides where it seats */}
      <g className="a-shackle">
        <path
          d="M 143 105 v -32 a 17 17 0 0 1 34 0 v 32"
          fill="none"
          stroke="var(--main)"
          strokeWidth="9"
        />
      </g>

      {/* the body */}
      <rect className="a-accent" x="130" y="81" width="60" height="44" rx="10" />

      {/* keyhole, cut out of the body */}
      <circle cx="160" cy="98" r="5" fill="var(--bg)" />
      <rect x="157.5" y="98" width="5" height="12" rx="2.5" fill="var(--bg)" />
    </Frame>
  );
}

/** Step 4 — the payoff: your usage, drawn. */
export function ArtDone() {
  const bars = [34, 52, 28, 70, 46, 88, 62, 96];
  return (
    <Frame>
      <rect className="a-bg" x="24" y="26" width="272" height="128" rx="10" />
      <text x="44" y="52" className="a-dim" fontSize="9" fontFamily="monospace">
        your usage
      </text>
      <text x="44" y="72" className="a-text" fontSize="16" fontFamily="monospace">
        $10,669
      </text>
      {bars.map((h, i) => (
        <rect
          key={i}
          className="a-accent a-bar"
          x={44 + i * 30}
          y={134 - h}
          width="18"
          height={h}
          rx="3"
          opacity={0.45 + (i / bars.length) * 0.55}
          style={{ animationDelay: `${i * 90}ms` }}
        />
      ))}
    </Frame>
  );
}
