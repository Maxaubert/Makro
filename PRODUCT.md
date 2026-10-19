# Product

<!-- impeccable:product-schema 1 -->

## Platform

ios

## Users

Gym-goers in Norway who train for strength or muscle and already track what they eat: people who weigh their chicken, care about protein per kg, and log Norwegian products like Barebells, Tine or kjøttdeig. Today they use generic trackers with wrong or missing Norwegian data. The first users are the two founders (Max and Nima), then a closed TestFlight beta of about 10 friends.

They log in short bursts many times a day: at the kitchen counter with food on a scale, in a shop aisle, on a gym floor with bad signal, in the evening checking what's left.

## Product Purpose

Log what you eat in seconds, with numbers you can trust, and get daily personal guidance toward your calorie and macro targets. Success: both founders log every day for 14 days without falling back to another app, a typical meal takes under 20 seconds, at least 90% of scanned barcodes are found, and nobody catches a wrong number without a warning first.

## Positioning

Norwegian product data that is actually right (126k Norway-relevant products, merged by barcode from 90+ sources, with source and verified status per product), and honesty about uncertainty: unknown values are never shown as zero, and totals show how much of the day they cover. A generic tracker cannot truthfully claim either.

## Operating Context

- One-handed phone use, often mid-task (holding food, standing in a shop, between sets).
- Offline is normal: logging and search work without signal.
- Entry paths: barcode scan, search (Norwegian words and typos), recents and favourites, saved meals, "repeat yesterday", later voice and typed lines ("to egg og 200 g kjøttdeig").
- Daily rhythm: quick logs through the day, a glance at what's left, an end-of-day check, a weekly summary.
- Apple surfaces matter: home and lock screen widgets, App Shortcuts, Control Center, Action button, Apple Health.

## Capabilities and Constraints

- Native SwiftUI, iPhone only, iOS 27 minimum (iOS 26 if a spike requires it), Apple Intelligence iPhones.
- Goals: calories, protein, carbs, fat and fibre. Other micronutrients shown when known, without goals.
- Accuracy rules: numbers come only from the database or deterministic code; AI never writes a number; missing means unknown, never zero; each log entry keeps a snapshot of its values; every product shows its source and verified status; logging never blocks (a missing product becomes a custom food immediately).
- Body weight: manual entry plus Apple Health, shown as a 7-day trend.
- Guidance is rule-based (what's left, suggestions that fit the gap, end-of-day and weekly summaries). No AI chat coach in the MVP.
- Interface language: English. Food names are mostly Norwegian.
- Out of the MVP: training tracking, the training agent, food photos, recipes, public API, Android.
- Safety: a calorie floor and a maximum weight-loss rate from Nordic guidance (exact values to be cited).
- One shared look across two apps: Nima builds the iOS app, Max builds the web app (#46, post-MVP). Colours, type and spacing are shared tokens in `packages/design/tokens.json` (decision 32).
- Spec and decisions: `docs/MVP.md`, `DECISIONS.md`.

## Brand Commitments

The name "Makro". The landed design (2026-10-18) is the "B Night" page on the shared Claude design canvas (https://claude.ai/artifact/K6QcNcoePkCkXds6arS4fo): dark ground, half-ring gauge, mini macro rings, bar chart. That canvas is the visual authority.

## Evidence on Hand

- Max's wireframes (Claude Design canvas "Makro MVP Wireframes"): Today, Log food, Add portion, Weight.
- The real product database in `loftspace/nutrition-data` (product names, brands, categories, macros) for realistic sample content.
- No users, testimonials, logos or metrics exist yet; none may be invented.

## Product Principles

1. Trust over polish: a number the user can't trust is worse than no number.
2. Speed is the feature: every common log is a few taps from anywhere.
3. Honest about gaps: show unknowns and coverage instead of hiding them.
4. Never block: there is always a way to log right now.
5. Personal, not generic: guidance uses your own history and targets.

## Accessibility & Inclusion

Follow iOS defaults: Dynamic Type, VoiceOver labels, sufficient contrast, 44 pt touch targets. No special-needs defaults beyond that.
