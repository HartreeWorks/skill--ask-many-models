---
name: ask-many-models
description: Query multiple model families and synthesise consensus and disagreement. Use for model comparisons or `/amm`; use `best-of-n` for repeated samples from one model.
---

# Ask Many Models

Send the same prompt to multiple AI models in parallel and synthesise their responses into a unified analysis.

When this skill is triggered — via `/amm` or natural language — execute the steps below. Do not merely describe what the skill does.

## Step 1: Get the seed prompt

**A) Cold start** (conversation just began, no prior discussion):
If the user provided a prompt/question, treat it as the *seed*. Otherwise ask: "What question would you like to send to multiple AI models?"

**B) Mid-conversation** (there's been substantive discussion before this):
Treat the user's invoking message as the *seed* and the prior conversation as background context.

Once a seed exists, proceed to Step 1a.

### Step 1a: Decide whether to clarify

The seed alone is rarely the strongest prompt. A short clarification quiz usually produces a better result — but forced quizzes on already-specific prompts just add friction.

**Skip the quiz** and go straight to drafting (Step 1d) when ANY of these is true:

- The user explicitly says "just draft", "go", "skip questions", "no questions", or similar.
- The seed is already long and specific (roughly >300 chars AND states intent, audience, and constraints).
- Mid-conversation invocation where prior discussion has already nailed down the intent.

Those three conditions are the only reasons to skip. The clarify/riff pass is the point of this skill, so a general sense that the user wants to keep moving — including running under Auto Mode — is not one of them.

If borderline, ask once. With `AskUserQuestion` available, use a single-question `AskUserQuestion` call. Without it, print: "I can either ask 2–3 quick clarifying questions first, or just draft — which? (1) clarify (2) draft" and wait for a reply.

### Step 1b: Clarify intent (tailored quiz)

The goal: surface what's *really* motivating the question and what kind of answer would feel useful. Ask 2–4 **tailored** questions. Never boilerplate.

**Always include a motivation question.** Draft 3–4 motivation options based on the *specific seed*, plus an Other free-text field. Tailoring matters more than completeness — generic motivation options are worse than skipping the question.

Examples — for a seed like *"Should I rewrite an email app's onboarding flow?"*:

1. Decide whether to do the rewrite at all
2. Stress-test a rewrite I'm already planning
3. Generate options I haven't considered
4. Find reasons NOT to do it

For a seed like *"Explain how MCP servers work"*:

1. Quick mental model for skim-reading
2. Deep understanding so I can implement one
3. Compare with alternatives (plugins, hooks)
4. Explain to a non-technical person

**Then add 1–2 more tailored questions** keyed to the question shape:

- *Decision* → decision criteria (cost / speed / reversibility / optionality) and timeframe.
- *Explainer* → depth, audience, prior knowledge.
- *Critique or review* → kind of pushback wanted (devil's advocate / steelman the alternative / numbers-focused / spot risks).
- *Generate options* → the constraint space (timebox, budget, who else is involved).
- *Forecast or predict* → timeframe and what would update the user's view.

**Bad (boilerplate — do not do this):**

1. "What's the context?"
2. "Who is the audience?"
3. "How long should the answer be?"

**Good (tailored to *"Should I sunset the Outlook add-in?"*):**

1. What's really driving this? (4 motivation options + Other)
2. Which matters more: cutting maintenance burden, or keeping the user base happy?
3. Timeframe — next 3 months, or next 2 years?

**How to ask:**

When `AskUserQuestion` is available (Claude Code), use one `AskUserQuestion` call with all 2–4 questions. Single-select (`multiSelect: false`). Each option gets a short label and a one-line description. **Provide only 3–4 real options per question — the runtime auto-adds an "Other" free-text field. Do NOT add an Other option manually (it would push the question over the 4-option ceiling).**

When `AskUserQuestion` is unavailable (Codex or other runtimes), print the questions as a numbered list. **Append an explicit "Other (type freely)" option to each question** since there's no runtime auto-add. Ask the user to reply with one line per question. Example format:

```
A few quick clarifying questions:

Q1 — What's really driving this?
  1. Decide whether to do the rewrite at all
  2. Stress-test a rewrite I'm already planning
  3. Generate options I haven't considered
  4. Find reasons NOT to do it
  5. Other (type freely)

Q2 — Which matters more: cutting maintenance burden, or keeping the user base happy?
  1. Cutting maintenance burden
  2. Keeping the user base happy
  3. Other (type freely)

Reply with one line per question, e.g.:
  Q1: 2
  Q2: 1
or use free text where Other applies, e.g. "Q1: I want to compare against alternatives I haven't thought of".
```

### Step 1c: Brainstorm riffs (adjacent angles)

After clarification, draft 3–5 *adjacent* angles or sub-questions the seed didn't explicitly ask but that often pay off. Each option needs a one-line rationale.

Examples for *"Should I sunset the Outlook add-in?"*:

- "Also ask: what would I need to see to change my mind?" — surfaces update conditions.
- "Also ask: top 3 failure modes either way." — symmetric risk analysis.
- "Reframe as: if I were starting today, would I build this?" — disentangles sunk cost.
- "Also ask: cheapest experiment to test the hypothesis first." — surfaces lower-cost alternatives.

Present as a multi-select. Always include a "None — just answer the original question" option.

When `AskUserQuestion` is available, use one `AskUserQuestion` call with `multiSelect: true`.

When `AskUserQuestion` is unavailable, print options as a numbered list and ask for comma-separated numbers (or "none"):

```
Adjacent angles I could bundle in (pick any, comma-separated, or "none"):

  1. Also ask: what would I need to see to change my mind?
     — surfaces update conditions, useful for forecasting decisions
  2. Also ask: top 3 failure modes either way
     — symmetric risk analysis
  3. Reframe as: if I were starting today, would I build this?
     — disentangles sunk cost from forward-looking value
  4. Also ask: cheapest experiment to test the hypothesis first
     — surfaces lower-cost alternatives
  5. None

Reply with numbers (e.g. "1, 3") or "none".
```

If the user picks none or skips, that's fine — proceed.

### Step 1d: Draft and approve the prompt

Draft a comprehensive prompt. **Incorporate the Step 1b answers directly**: use them to populate motivation, criteria, audience, depth, and timeframe in the draft. Use the chosen-and-skipped riffs from Step 1c to decide which sub-questions to bundle in.

The prompt should:

1. **Capture the full context** — relevant background, constraints, and goals.
2. **Include substantive content** — actual excerpts, code snippets, or data, not just file references.
3. **State the clarified motivation** — one explicit line drawn from the Step 1b motivation answer: *"I'm trying to do X because Y."*
4. **State the core question clearly** — primary question plus any bundled riffs from Step 1c.
5. **Note constraints or preferences** — depth, format, audience, timeframe (drawn from Step 1b answers).

**Prompt drafting checklist:**

- [ ] Background context (2–4 paragraphs minimum)
- [ ] Any relevant file contents or code (include actual content, not "see attached")
- [ ] Stated motivation (1 line, from Step 1b)
- [ ] Primary question(s) + bundled riffs (from Step 1c)
- [ ] Constraints/audience/timeframe (from Step 1b)
- [ ] What format/depth of response is useful

Err on the side of including MORE context than seems necessary. Other models don't have access to this conversation — they only see the prompt. A prompt that seems "too long" is usually about right.

Save the draft to a uniquely-named file to avoid collisions with concurrent sessions, using a heredoc to preserve formatting:

```bash
slug="$(date +%s)"
cat > "/tmp/amm-prompt-draft-$slug.md" <<'EOF'
<paste full prompt text here>
EOF
open "/tmp/amm-prompt-draft-$slug.md"
```

After opening the file, also summarise inline (2–3 sentences) so the user can react without switching windows.

**The approval message depends on which steps ran:**

- If Steps 1b AND 1c both ran and the user picked at least one riff:
  > "Drafted. **Included riffs:** failure modes, cheapest experiment. **Skipped:** reframe, change-mind conditions. Let me know if you'd like changes, or say 'go' to proceed."

- If Step 1c ran but the user picked "none":
  > "Drafted using your clarifying answers — no extra riffs bundled. Let me know if you'd like changes, or say 'go' to proceed."

- If Step 1a skipped clarification entirely:
  > "I've drafted a prompt. Review and let me know if you'd like changes, or say 'go' to proceed."

## Step 2: Model selection

Always present the model selection menu and wait for the user's choice before running any queries. Never assume which models the user wants, even when they supplied a prompt file path or seem to want a quick answer. The user always chooses.

Print the menu by running it — `models.json` is the source of truth, so never transcribe the options from memory:

```bash
cd "$HOME/.claude/skills/ask-many-models" && yarn query menu
```

Show its output to the user and wait for a number. Do not use `AskUserQuestion` here; it caps at four options.

The user may type just a number (e.g. `1`) or a number followed by `SYS` (e.g. `1 SYS`, `2 sys`). Parse the number for model selection. If `SYS` is present (case-insensitive), proceed to Step 2b after resolving models.

The last option is **pick individual models**. If the user selects it, print the picker and ask for comma-separated numbers:

```bash
cd "$HOME/.claude/skills/ask-many-models" && yarn query menu --pick
```

Map the user's numbers back to model IDs from that output, and check for `SYS` as above.

### Step 2b: System prompt (only if user typed SYS)

Only run this step if the user included `SYS` in their model selection input. Otherwise skip to Step 3.

1. **Check for saved prompts** in `$HOME/.claude/skills/ask-many-models/data/system-prompts.json`. If the file does not exist, treat the saved-prompt list as empty.
2. If saved prompts exist, show them with letter labels:

```
Saved system prompts:

  A) Expert VC analyst — You are an experienced venture capital...
  B) Devil's advocate — Challenge every assumption...

  N) Write a new system prompt

Select (A/B/.../N):
```

3. If the user selects a letter, use that saved prompt's content as the system prompt.
4. If the user selects **N**, ask them to type/paste a system prompt. Then ask if they want to save it:
   - If yes, ask for a name, then add it to `system-prompts.json` using:
     ```bash
     mkdir -p "$HOME/.claude/skills/ask-many-models/data"
     if [ ! -f "$HOME/.claude/skills/ask-many-models/data/system-prompts.json" ]; then printf '{"prompts":[]}\n' > "$HOME/.claude/skills/ask-many-models/data/system-prompts.json"; fi
     jq --arg name "<name>" --arg content "<content>" '.prompts += [{"name": $name, "content": $content}]' "$HOME/.claude/skills/ask-many-models/data/system-prompts.json" > /tmp/amm-sysprompts-tmp.json && mv /tmp/amm-sysprompts-tmp.json "$HOME/.claude/skills/ask-many-models/data/system-prompts.json"
     ```
5. Save the system prompt to a temp file and pass it via `--system-prompt <path>` in Step 4.

If the user presses Enter (empty input), skip — no system prompt.

## Step 3: Check for images

If an image is in the conversation, save it to:
`$HOME/.claude/skills/ask-many-models/data/model-outputs/image-TIMESTAMP.png`

Models without vision support receive just the text prompt, plus a note that an image was provided. The `menu --pick` output tags which models accept images.

## Step 4: Run the query

Pass a preset by name, or explicit model IDs when the user picked their own.

Run **without** `--synthesise` — synthesis happens in Step 4b using an in-session subagent, so it uses the operator's existing plan quota instead of billing the Anthropic API:

```bash
cd "$HOME/.claude/skills/ask-many-models" && yarn query \
  --preset "<preset-name>" \
  --output-format both \
  [--image "<path>"] \
  [--system-prompt "<path>"] \
  "<prompt>"
```

For an individually-picked set, swap `--preset` for `--models "<id1>,<id2>,..."`.

The script prints the auto-generated output directory path (`data/model-outputs/<timestamp>-<slug>/`) and writes `results.md`, `results.html`, `responses.json`, `prompt.md`, and `individual/<model>.md` files.

Warn the user about duration before starting a deep-research preset — those models take 10–20 minutes each.

### Step 4b: Synthesise in-session (subagent)

Capture the output directory path from Step 4's stdout, then spawn a general-purpose subagent to produce the synthesis:

```
Agent tool with subagent_type: "general-purpose"
description: "Synthesise multi-model responses"
prompt: |
  Read the following files and produce a synthesis of the model responses.

  Prompt: <output-dir>/prompt.md
  Individual model responses: <output-dir>/individual/*.md
  (Skip any file whose content starts with "**Error:**" — that model failed.)

  Produce an executive-depth synthesis with these sections, using British English
  and sentence-case headings:

  ## Overview
  (1 short paragraph — the core question and the shape of the answer.)

  ## Points of consensus
  (Bullets — points where 2+ models agree, with [model] attribution tags.)

  ## Points of disagreement
  (Bullets — contradictions with a short pros/cons. Tag each view with [model].)

  ## Unique insights
  (Bullets — valuable points only one model raised. Tag with [model].)

  ## Confidence level
  (One paragraph — how much to trust this synthesis and why.)

  Write the synthesis to /tmp/amm-synthesis-<slug>.md and return only the file path.
  Do NOT edit results.md, results.html, or any file in the output directory —
  the orchestrator will handle insertion.
```

Once the subagent returns the synthesis file path, run the insert helper:

```bash
cd "$HOME/.claude/skills/ask-many-models" && \
  npx tsx scripts/resynthesise.ts "<output-dir>" --file "<synthesis-file>"
```

This inserts the synthesis at the top of `results.md` (after the `# Multi-Model Query` metadata, before the first model section) and regenerates `results.html`.

**Fallback** — if for any reason you need API-based synthesis (running unattended, or the in-session context is wedged), omit `--file`:

```bash
npx tsx scripts/resynthesise.ts "<output-dir>"
```

This calls Claude Opus 4.8 via the Anthropic API and costs tokens.

## Step 5: Open results

Say "Querying: [models]" and open the results file. If `data/user-defaults.json` exists, check it for `open_preference`:

- `"html"` → `open "<output-dir>/results.html"`
- `"markdown"` (or absent) → `open "<output-dir>/results.md"`

## Resources

- `references/cli-reference.md` — full command and option reference, model configuration, API keys, output structure, synthesis, deep research, error handling.
- `models.json` — single source of truth for models and presets. Adding a model there is the only edit needed; the menus render from it.
