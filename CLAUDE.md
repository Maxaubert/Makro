# Makro

Training and macro-tracking app. The MVP plan is in `docs/MVP.md`; every decision is logged in `DECISIONS.md`.

## One source of truth for the roadmap
- **The MVP epic (#36) is the roadmap and the issue tracker.** Work is planned, ordered and tracked there. Do not keep a second roadmap in docs, chat or another tool.
- Every piece of work is an issue linked from the epic. New work gets an issue and a line in the epic first. Closing an issue ticks it in the epic.
- Out-of-MVP work carries the `later` label and stays in the backlog until the epic says otherwise.
- Changing a decision means adding a new entry to `DECISIONS.md` that supersedes the old one. Do not edit history.

## Design: wireframes in the shared Claude design workspace
- Max builds the web dashboard and Nima builds the iOS app, so both follow one shared look.
- Wireframes and mockups are made with Claude design in the shared workspace (the MVP wireframes canvas: https://claude.ai/artifact/K6QcNcoePkCkXds6arS4fo#page-dcb81aee8d83, also linked from #36). Do not start a screen in code without a wireframe there.
- Style: off-white background, orange accent, clean and professional, taken from the Firecrawl home page. Proposed, not yet agreed with Nima: shared design tokens in `packages/design/tokens.json`, generated for Swift and CSS.
- Change a screen on the shared canvas first, then in code, so the two apps stay in step.
