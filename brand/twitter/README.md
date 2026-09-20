# tokn — X / Twitter image kit

Regenerate everything with `python3 brand/make-kit.py`. The script is the
source of truth; these PNGs are its output. Editing them by hand means the next
run silently reverts your change.

| file | size | where it goes |
|---|---|---|
| `avatar-400.png` | 400×400 | profile picture — lime mark on dark |
| `avatar-lime.png` | 400×400 | alternate — dark mark on lime, louder in a timeline |
| `header-1500x500.png` | 1500×500 | profile header |
| `card-1200x630.png` | 1200×630 | link preview, already served by the site |
| `_contact-sheet.png` | — | all of it at once, for checking before upload |

## What the sizes are actually for

**The avatar is cropped to a circle.** The mark is sized against the inscribed
circle rather than the square, with margin left over because several clients
draw a ring just inside the edge. It stays legible down to 24px, which is the
size it appears at in a reply thread — where most people will see it.

**The header's lower-left is unusable.** X overlays the profile picture there
and re-crops the image on narrow screens. Everything that has to be read sits
in a band across the vertical middle, clear of both. The heatmap texture starts
only after the longest line of type ends, so it never competes with words.

**The link card is 1200×630**, the same image the site serves as its OpenGraph
and Twitter card. Tweeting a tokn link shows this.

## Colours

Straight from the site's tokens, so nothing drifts:

    --bg    #121214      --text  #d9d9d6
    --sub   #73737b      --main  #ccff33

## The font

Geist Mono, the interface face of the site. `brand/.fonts/` holds the two
weights the script needs; they are downloaded from Google Fonts and are not
committed.
