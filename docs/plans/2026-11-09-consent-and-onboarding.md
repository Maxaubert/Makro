# Consent and onboarding: spec and plan (2026-11-09)

For #15 (health data, consent, safety) and Max's request for first-run onboarding: weight, height, gender, calorie goal, macro goal.
Research, with sources and what could not be verified: `C:\Users\Admin\Documents\Claude\research\makro\2026-11-09-health-data-consent-and-goal-safety.md`. It is not legal advice.

## What the research says

- **Treat weight, height, goals and food logs as health data.** No authority says so for these exact fields, but CJEU C-21/23 covers data "capable of revealing" health status. That means explicit consent under GDPR Art. 9(2)(a).
- **Consent must be specific, unbundled and as easy to withdraw as to give** (EDPB 05/2020). Norway's Grindr ruling (NOK 65m, Borgarting 2025) turned on consent that could not be refused separately from sharing.
- **GDPR most likely applies once friends use the app.** The household exemption is narrow. With no company, Max and Nima are probably joint controllers personally. A lawyer should confirm this.
- **Age:** the Norwegian digital age of consent is 13 (raising it to 15 is proposed). MyFitnessPal requires 18.
- **Eating-disorder risk is real but shown only as association** (Levinson 2017: 73% of users in a clinic sample felt MyFitnessPal contributed). No authority prescribes app safeguards, so these are design choices.
- **Not found:** a sourced minimum calorie intake or weekly loss cap for unsupervised adults, activity multipliers, and the Nordic protein range. Mifflin-St Jeor is confirmed only through secondary sources.

## The flow

Shown when a signed-in user has no consent on record, or no goal yet. Steps follow the B Night canvas, with the consent step added there first.

1. **Welcome** (exists on the canvas).
2. **Your data** (new): what is collected and why, who runs the app, where it is stored, how to withdraw, link to the privacy notice. Two separate unticked choices:
   - Required to use Makro: store my weight, height, goals and food log to track them.
   - Optional: let my logging count, anonymously, toward which foods are popular. Off by default, and declining changes nothing else.
   Declining the first offers sign out, or deleting anything already stored.
3. **About you**: gender (Male or Female, labelled "used only for the calorie estimate"), age, height, weight, activity. Under 18 stops here with a short message.
4. **Your goals**: lose, maintain or gain, with target weight and pace. Calories and macros are calculated and every number can be edited, within the safety limits.

Existing accounts (Max, Nima) see the flow once. Their logs stay.

## Goal calculation

Deterministic code only, never AI (accuracy rule 1).

- Mifflin-St Jeor times activity, adjusted by pace (7,700 kcal per kg is the usual convention).
- Protein 2.0 g per kg (the MVP range is 1.6 to 2.2), fat at least 25% of energy (NNR 2023 lower bound), carbs the rest, fibre 30 g (the canvas value).
- Shown as an estimate. The activity multipliers are the common ones (1.2, 1.55, 1.725) and are marked unverified in the code and the plan until checked.
- A golden file in `packages/contracts/nutrition/` holds the cases. **This needs a new decision:** today goal maths are Swift only and "the web never sets goals". Under decision 35 the web comes first, so the web gets the maths and Swift must pass the same file later.

## Safety

- Limits apply to calculated and hand-edited goals: at least 1,200 kcal for women and 1,500 for men, and at most 1 kg per week (Max, 2026-11-09). This is an industry convention, not a sourced standard, and stays marked provisional until a dietitian or a primary source confirms it.
- 18 or older only. Age is asked as a number and stored as `birth_year`.
- Neutral wording, no praise for losing weight.
- "Need help?" link on the goal screen and in Account: ROS, 948 17 818, nettros.no (checked 2026-11-09).
- Follow-up issue, not in this work: hide-numbers mode.

## Data

- **New table `consents`** (RLS on, own rows only): user, kind (`health_data`, `popularity`), text version, granted_at, withdrawn_at. Written directly, because onboarding needs a connection anyway.
- **`goals` and `weight_entries` already exist** with `sex`, `birth_year`, `height_cm`, `activity_level` and `weight_kg`. Onboarding writes one of each through the normal outbox.
- **`product_popularity()`** counts only users with an active `popularity` consent.

## Your rights in the app (Account screen)

- **Withdraw and delete:** deletes the account and all its data (a new Edge Function with `verify_jwt` on; rows go by `on delete cascade`).
- **Withdraw popularity only:** one switch.
- **Export:** download everything as JSON.
- **Privacy notice page:** the Art. 13 contents, including Supabase and Vercel as processors. Who runs the app and how to reach them is a marked blank until Max fills it in, and invites stay on hold until then.

## Outside the code (Max)

- Accept the Supabase and Vercel data processing agreements.
- One hour with a lawyer. Questions: are body metrics Art. 9 data; joint controllership and whether to form a company; is a DPIA needed under Datatilsynet's list (the list could not be fetched); the consent wording; whether small-group popularity counts are anonymous.
- Friend invites stay on hold until these are done.

## Build order

One PR per step, each with tests first and its own merge question.

1. Canvas: add the consent step and any changed fields.
2. Goal maths with golden file, decision entry, safety limits.
3. `consents` table, RLS tests, popularity filter.
4. Onboarding screens and the first-run gate.
5. Withdraw, delete, export, privacy notice.
6. Update #15 with the decision note and open the follow-up issues.
