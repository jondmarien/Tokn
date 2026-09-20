<img src="https://raw.githubusercontent.com/toknlabs/.github/main/profile/logo.png" width="72" alt="">

# tokn

**Track what AI coding actually costs you.**

A CLI reads the session logs your AI tools already write to disk, works out
what those tokens cost at published API rates, and publishes daily totals to a
leaderboard.

```bash
npm install -g tokn
tokn
```

That's the whole setup: it finds your tools, shows you what you've spent, and
asks whether to link an account and keep it up to date.

### What it reads

Claude Code, Claude Desktop, Codex, GitHub Copilot CLI and opencode. Adding a
tool is one adapter.

### What it sends

One line per day, per model: how many requests, how many tokens, what it cost.
Plus your time zone, so day boundaries line up. Never your prompts, your code,
file paths or project names — run `tokn sync --dry-run` to see the exact
payload before sending anything.

### The numbers are estimates

Costs are calculated, not billed: token counts from your local logs multiplied
by published API rates. Subscription plans, free tiers, credits and committed-use
discounts are invisible to us, so your real invoice will differ. Good for
comparing your own weeks against each other. Not for expense reports.

---

## Repositories

| | |
|---|---|
| **tokn** | the CLI — reads sessions, prices them, publishes totals |
| **tokn-web** | the leaderboard, profiles and stats |

GPL-3.0 licensed.  ·  [toknhq.com](https://toknhq.com)
