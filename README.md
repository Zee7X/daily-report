# daily-report

Antigravity skill suite — daily work reports, code review, and standup summaries. No commit or push required.

## Install

```bash
npx daily-report-antigravity
```

Copies all three skills to your Antigravity skills directory automatically.

| OS | Target |
|----|--------|
| Windows | `%APPDATA%\Antigravity\skills\` |
| macOS / Linux | `~/.antigravity/skills/` |

## Skills

| Command | What it does |
|---------|-------------|
| `/daily-report` | Full daily report (08:00–17:00): session history + git diff + type-check status |
| `/daily-report-review` | Per-file code review of today's local changes with actionable feedback |
| `/daily-report-summary` | 3–5 sentence TL;DR for standup, Slack, or email |

### `/daily-report-summary` variants

```
/daily-report-summary slack     → casual, max 280 chars
/daily-report-summary standup   → Done / Doing / Blockers
/daily-report-summary email     → formal with salutation
```

## Example output

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

## Package structure

```
daily-report/
├── index.js                       ← installer (npx entry point)
├── plugin.json
├── package.json
└── skills/
    ├── daily-report/SKILL.md
    ├── daily-report-review/SKILL.md
    └── daily-report-summary/SKILL.md
```

## Requirements

- Node.js ≥ 18
- Antigravity (latest)
- Git (optional)

## License

MIT © [Zee7X](https://github.com/Zee7X)
