<p align="center">
  <img src="assets/logo.png" alt="Daily Report Logo" width="120" />
</p>

# Daily Report

Automated daily engineering reports, code reviews, and standup summaries for Antigravity. Extracts context directly from active session history and local Git diffs without requiring daily commits or pushes.

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

The installer provisions skills into Antigravity configuration paths:

| Platform | Destination Path |
| --- | --- |
| Primary (Antigravity Global) | `~/.gemini/config/skills/` |
| Windows (IDE) | `%APPDATA%\Antigravity\skills\` |
| macOS / Linux Fallback | `~/.antigravity/skills/` |

After running the installer, reload or restart Antigravity (`Ctrl + R`) to load newly added skills.

## Commands

### 1. `/daily-report`

Generates a complete daily work report for standard working hours (08:00 - 17:00). Aggregates active session history, uncommitted local changes (`git status`, `git diff`), and TypeScript status.

Sections:
- Features and logic implemented
- UI state improvements (skeleton loaders, toast feedback, optimistic mutations, form persistence)
- Local Git modifications and diff breakdown
- Type checking results (`tsc --noEmit`)
- Placeholders for visual artifacts (light and dark mode screenshots)

### 2. `/daily-report-review`

Performs an automated peer review of code modified during the day. Inspects uncommitted changes and local commits:
- Correctness and edge-case handling
- Naming conventions and domain clarity
- Side effects and potential state leaks
- TypeScript soundness
- Performance risks and premature abstractions
- Basic security hygiene

Strictly read-only: identifies defects and suggestions by file and line number without modifying any source files.

### 3. `/daily-report-summary`

Produces a concise 3 to 5 sentence summary of today's work, formatted for daily standup meetings and team chat channels (Slack, Teams, Discord).

Strictly read-only: outputs plain text without modifying code or workspace files.

## Multi-Session Support

If you work across multiple chat sessions within the same project throughout the day, Git diffs remain workspace-wide and cumulative. Running `/daily-report` in any thread captures all modified files and synthesizes work across sessions.

## Requirements

- Node.js 18 or newer
- Antigravity
- Git (optional, required for local change inspection)

## License

MIT (c) [Zee7X](https://github.com/Zee7X)
