# daily-report

> Antigravity skill suite — automated daily work reports, peer code review, and standup summaries.
> No commit, no push, one command.

---

## ⚡ Install (1 line)

```bash
npx github:Zee7X/daily-report-antigravity
```

Or once published to npm:

```bash
npx daily-report-antigravity
```

The installer auto-detects your OS and copies all skills to the correct Antigravity directory:

| OS | Target |
|----|--------|
| Windows | `%APPDATA%\Antigravity\skills\` |
| macOS / Linux | `~/.antigravity/skills/` |

---

## 🚀 Skills

### `/daily-report`

Full daily work report (08:00–17:00). Extracts session history + git diff and generates
a structured Markdown report with sections for features, UI state changes, file changes, and type-check status.

### `/daily-report-review`

Deep peer-review of today's local code changes. Runs `git diff`, analyzes each changed
file for correctness, naming, type safety, performance, and security — outputs structured
per-file feedback with actionable suggestions.

### `/daily-report-summary`

Ultra-compact TL;DR (3–5 sentences) ready to paste into Slack, Teams, or a standup.
Supports variants:

```
/daily-report-summary slack      → casual, emoji OK, max 280 chars
/daily-report-summary standup    → Done / Doing / Blockers format
/daily-report-summary email      → formal, with salutation
```

---

## 📋 Example Output (`/daily-report`)

```markdown
# 📋 Daily Report — Thursday, October 8, 2026
**Working Hours:** 08:00 – 17:00

## ✅ Features / Logic Worked On
- Implemented optimistic update for createOrder mutation
- Fixed skeleton loading state on dashboard
- Refactored form persistence using localStorage

## 📁 Local File Changes (Git)
M  src/components/OrderForm.tsx
M  src/hooks/useOrder.ts
A  src/components/ui/Skeleton.tsx

## 🔍 Type-Check Status
Clean (0 errors)
```

---

## 📁 Package Structure

```
daily-report/
├── plugin.json
├── package.json
├── cli/
│   └── install.js
├── skills/
│   ├── daily-report/
│   │   └── SKILL.md           ← /daily-report
│   ├── daily-report-review/
│   │   └── SKILL.md           ← /daily-report-review
│   └── daily-report-summary/
│       └── SKILL.md           ← /daily-report-summary
└── README.md
```

---

## 🛠 Requirements

- Node.js ≥ 18
- Antigravity (latest)
- Git (optional, for file change detection)

---

## License

MIT © [Zee7X](https://github.com/Zee7X)
