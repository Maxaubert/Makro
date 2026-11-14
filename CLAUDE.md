# Makro

Training and macro-tracking app. The MVP plan is in `docs/MVP.md`; every decision is logged in `DECISIONS.md`.

How to build, test and open PRs (accuracy rules, commands, tech choices): @AGENTS.md

## One source of truth for the roadmap
- **The MVP epic (#36) is the roadmap and the issue tracker.** Work is planned, ordered and tracked there. Do not keep a second roadmap in docs, chat or another tool.
- Every piece of work is an issue linked from the epic. New work gets an issue and a line in the epic first. Closing an issue ticks it in the epic.
- Out-of-MVP work carries the `later` label and stays in the backlog until the epic says otherwise.
- Changing a decision means adding a new entry to `DECISIONS.md` that supersedes the old one. Do not edit history.

## Design: the "B Night" canvas in the shared Claude design workspace
- Max builds the web dashboard and Nima builds the iOS app, so both follow one shared look.
- The landed design (2026-10-18) is the "B Night" page on the shared canvas: https://claude.ai/artifact/K6QcNcoePkCkXds6arS4fo (also linked from #36). Its screens cover home (Today, Diary, Weight, Profile), adding food (search, portion, scan, type the code, not in database, found without nutrition, custom food), voice logging, onboarding, per-portion menu items and daily supplements. The canvas is the visual authority: when it and this file disagree, the canvas wins. Do not start a screen in code without a design there.
- Style: pure black ground (#000000, since 2026-11-14), cards on #18181A with a 1 px #2A2A2D border and 20 px corners, text #F4F4F5 with #9A9AA0 for secondary text, one orange accent (#FF4C00, with lighter orange tints) for the primary action and progress. Space Grotesk throughout. Signature elements: a half-ring calorie gauge on Today, small macro rings, a bar chart for weight. Proposed, not yet agreed with Nima: shared design tokens in `packages/design/tokens.json`, generated for Swift and CSS.
- Change a screen on the shared canvas first, then in code, so the two apps stay in step.
