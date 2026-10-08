# daily-report

Antigravity skill suite for automated daily engineering reports, code reviews, and standup summaries. Extracts context directly from active session history and local Git diffs without requiring commits or pushes.

## Installation

Run via npx:

```bash
npx daily-report-antigravity
```

Or install globally:

```bash
npm install -g daily-report-antigravity
daily-report-antigravity
```

The installer detects your environment and provisions the skills into the appropriate Antigravity configuration paths:

| Platform | Destination Path |
| --- | --- |
| Primary (Antigravity Global) | `~/.gemini/config/skills/` |
| Windows (IDE) | `%APPDATA%\Antigravity\skills\` |
| macOS / Linux Fallback | `~/.antigravity/skills/` |

After running the installer, reload or restart Antigravity to refresh the available skills.

## Skills Reference

### 1. `/daily-report`

Generates a complete daily work report for standard working hours (08:00 - 17:00). Analyzes session prompt history, uncommitted local changes (`git status`, `git diff`), and TypeScript verification status.

Output includes:
- Features and logic implemented
- UI state improvements (skeleton loaders, toast feedback, optimistic mutations, form persistence)
- Local Git modifications and diff breakdown
- Type checking results (`tsc --noEmit`)
- Placeholders for visual artifacts (light and dark mode screenshots)

### 2. `/daily-report-review`

Performs an automated peer review of all code modified during the day. Inspects uncommitted changes and local commits for:
- Correctness and edge-case handling
- Naming conventions and domain consistency
- Side effects and potential state leaks
- TypeScript soundness
- Performance risks and premature abstractions
- Basic security hygiene

### 3. `/daily-report-summary`

Produces a compact 3 to 5 sentence overview intended for standups and team channels.

Supported arguments:
- `/daily-report-summary slack`: Single-paragraph message under 280 characters.
- `/daily-report-summary standup`: Formatted into Done, In Progress, and Blockers.
- `/daily-report-summary email`: Formal summary including salutations.

## Directory Structure

```
daily-report/
├── index.js
├── plugin.json
├── package.json
├── skills/
│   ├── daily-report/
│   │   └── SKILL.md
│   ├── daily-report-review/
│   │   └── SKILL.md
│   └── daily-report-summary/
│       └── SKILL.md
└── README.md
```

## System Requirements

- Node.js 18 or newer
- Antigravity
- Git (optional, required for local change inspection)

## License

MIT © [Zee7X](https://github.com/Zee7X)
