<p align="center">
  <img src="assets/logo.png" alt="Daily Report Logo" width="120" />
</p>

# Daily Report

Automated daily engineering reports, code reviews, standup summaries, and automated localhost screenshot capture for Antigravity. Extracts context directly from active session history and local Git diffs without requiring daily commits or pushes.

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

### 1. `/daily-report [port]`

Generates a complete daily work report for standard working hours (08:00 - 17:00). Aggregates active session history, uncommitted local changes (`git status`, `git diff`), TypeScript status, and captures live localhost screenshots.

Usage:
- `/daily-report` (auto-detects open dev server port on localhost)
- `/daily-report 8001` (specifies port 8001 explicitly)
- `/daily-report --port 3000` (specifies port 3000)

Sections:
- Features and logic implemented
- UI state improvements (skeleton loaders, toast feedback, optimistic mutations, form persistence)
- Local Git modifications and diff breakdown
- Type checking results (`tsc --noEmit`)
- Automated visual verification: captures both Light Mode (`reports/screenshots/light.png`) and Dark Mode (`reports/screenshots/dark.png`)

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

## Standalone Screenshot CLI

You can also run the screenshot capture utility directly from your terminal:

```bash
daily-report-screenshot --port 8001
# or
npx daily-report-screenshot --port 8001
```

Options:
- `--port, -p <number>`: Port number to capture (e.g. 8001, 3000, 5173).
- `--url, -u <string>`: Full URL (e.g. `http://localhost:8001/dashboard`).
- `--path <string>`: Route path to append (defaults to `/`).
- `--output, -o <dir>`: Directory to save screenshots (defaults to `reports/screenshots`).
- `--wait, -w <ms>`: Wait time in ms for single-page app JS to render (defaults to 3500ms).

## Multi-Session Support

If you work across multiple chat sessions within the same project throughout the day, Git diffs remain workspace-wide and cumulative. Running `/daily-report` in any thread captures all modified files and synthesizes work across sessions.

## Requirements

- Node.js 18 or newer
- Antigravity
- Git (optional, required for local change inspection)

## License

MIT (c) [Zee7X](https://github.com/Zee7X)
