---
name: ask-many-models
description: Query multiple AI models and synthesise the results.
---

# Ask Many Models

Send the same prompt to multiple AI models in parallel and synthesise their responses into a unified analysis.

## When this skill is invoked

**IMPORTANT**: When this skill is triggered (via `/ask-many-models` or natural language), follow the execution steps below. Do NOT just describe what the skill does.

### Execution Steps

#### Step 1: Get the seed prompt

**A) Cold start** (conversation just began, no prior discussion):
If the user provided a prompt/question, treat it as the *seed*. Otherwise ask: "What question would you like to send to multiple AI models?"

**B) Mid-conversation** (there's been substantive discussion before this):
Treat the user's invoking message as the *seed* and the prior conversation as background context.

Once a seed exists, proceed to Step 1a.

#### Step 1a: Decide whether to clarify

The seed alone is rarely the strongest prompt. A short clarification quiz usually produces a better result — but forced quizzes on already-specific prompts just add friction.

**Skip the quiz** and go straight to drafting (Step 1d) when ANY of these is true:
- The user explicitly says "just draft", "go", "skip questions", "no questions", or similar.
- The seed is already long and specific (roughly >300 chars AND states intent, audience, and constraints).
- Mid-conversation invocation where prior discussion has already nailed down the intent.

**Otherwise**, run Steps 1b and 1c.

**Auto Mode does NOT bypass the quiz.** The clarify/riff pass is the point of this skill — skipping it on the assumption that "the user wants to keep moving" defeats the purpose. Skip only when one of the conditions above is met.

If borderline, ask once. With `AskUserQuestion` available, use a single-question `AskUserQuestion` call. Without it, print: "I can either ask 2–3 quick clarifying questions first, or just draft — which? (1) clarify (2) draft" and wait for a reply.

#### Step 1b: Clarify intent (tailored quiz)

The goal: surface what's *really* motivating the question and what kind of answer would feel useful. Ask 2–4 **tailored** questions. Never boilerplate.

**Always include a motivation question.** Draft 3–4 motivation options based on the *specific seed*, plus an Other free-text field. Tailoring matters more than completeness — generic motivation options are worse than skipping the question.

Examples — for a seed like *"Should I rewrite the IWR onboarding flow?"*:
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

**Good (tailored to *"Should I sunset the IWR Outlook add-in?"*):**
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

#### Step 1c: Brainstorm riffs (adjacent angles)

After clarification, draft 3–5 *adjacent* angles or sub-questions the seed didn't explicitly ask but that often pay off. Each option needs a one-line rationale.

Examples for *"Should I sunset IWR Outlook?"*:
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

#### Step 1d: Draft and approve the prompt

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

**IMPORTANT**: Err on the side of including MORE context than seems necessary. Other models don't have access to this conversation — they only see the prompt. A prompt that seems "too long" is usually about right.

Save the draft to a uniquely-named file to avoid collisions with concurrent sessions, using a heredoc to preserve formatting:
```bash
slug="$(date +%s)"
cat > "/tmp/amm-prompt-draft-$slug.md" <<'EOF'
<paste full prompt text here>
EOF
open "/tmp/amm-prompt-draft-$slug.md"
```
Or use a descriptive slug: `/tmp/amm-prompt-draft-<slug>.md`.

After opening the file, also summarise inline (2–3 sentences) so the user can react without switching windows.

**The approval message depends on which steps ran:**

- If Steps 1b AND 1c both ran and the user picked at least one riff:
  > "Drafted. **Included riffs:** failure modes, cheapest experiment. **Skipped:** reframe, change-mind conditions. Let me know if you'd like changes, or say 'go' to proceed."

- If Step 1c ran but the user picked "none":
  > "Drafted using your clarifying answers — no extra riffs bundled. Let me know if you'd like changes, or say 'go' to proceed."

- If Step 1a skipped clarification entirely:
  > "I've drafted a prompt. Review and let me know if you'd like changes, or say 'go' to proceed."

#### Step 2: Model selection

**MANDATORY**: You MUST always present the model selection menu and wait for the user's choice before running any queries. Never skip this step or assume which models the user wants, even if they provided a prompt file path or seem to want a quick answer. The user always chooses.

**Do NOT use AskUserQuestion for model selection** (it has a 4-option limit which is too restrictive). Instead, print this menu and wait for user input:

```
Which models should I query?

1. ⚡ Defaults - GPT-5.5 Thinking, Claude 4.8 Opus Thinking, Gemini 3.1 Pro, Grok 4.3 (Recommended)
2. 🚀 Quick - Gemini 3 Flash, Grok 4.3 Low Reasoning, Claude 4.6 Sonnet (~10s)
3. 📊 Comprehensive - Defaults + GPT-5.5 Pro (slow, extra compute)
4. 🔬 Deep Research - OpenAI/Gemini deep research + GPT-5.5 Pro (10-20 min)
5. 🔧 Pick models - Choose individual models

_(To use a custom system prompt, type SYS after the number, e.g. "1 SYS")_

Enter a number (1-5):
```

**Parsing the input**: The user may type just a number (e.g. `1`) or a number followed by `SYS` (e.g. `1 SYS`, `2 sys`, `3 SYS`). Parse the number for model selection. If `SYS` is present (case-insensitive), proceed to Step 2b after resolving models.

If user selects **5 (Pick models)**, print this list and ask for comma-separated numbers:

```
Available models:
1. gpt-5.5-thinking (default)
2. claude-4.8-opus-thinking (default)
3. gemini-3.1-pro (default)
4. grok-4.3 (default)
5. gemini-3-flash
6. grok-4.3-low
7. claude-4.6-sonnet
8. gpt-5.5-pro (slow, extra compute)
9. openai-deep-research (10-20 min)
10. gemini-deep-research (10-20 min)
11. gpt-5.4-thinking
12. gpt-5.4-pro (slow, extra compute)
13. gemini-3.1-flash-lite
14. magistral-medium (Mistral's smartest — frontier reasoning)

Enter numbers (e.g. 1,2,5). Add SYS for a custom system prompt (e.g. "1,3 SYS"):
```

Then map user's numbers to model IDs. Check for `SYS` in the input as described above.

#### Step 2b: System prompt (only if user typed SYS)

Only run this step if the user included `SYS` in their model selection input. Otherwise skip to Step 3.

1. **Check for saved prompts** in `/Users/ph/.claude/skills/ask-many-models/data/system-prompts.json`
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
     jq --arg name "<name>" --arg content "<content>" '.prompts += [{"name": $name, "content": $content}]' /Users/ph/.claude/skills/ask-many-models/data/system-prompts.json > /tmp/amm-sysprompts-tmp.json && mv /tmp/amm-sysprompts-tmp.json /Users/ph/.claude/skills/ask-many-models/data/system-prompts.json
     ```
5. Save the system prompt to a temp file and pass it via `--system-prompt <path>` in Step 4.

If the user presses Enter (empty input), skip — no system prompt.

#### Step 3: Check for images

If an image is in the conversation, save it to:
`/Users/ph/.claude/skills/ask-many-models/data/model-outputs/image-TIMESTAMP.png`

#### Step 4: Run the query

Map selection to model IDs:
- **Defaults**: `gpt-5.5-thinking,claude-4.8-opus-thinking,gemini-3.1-pro,grok-4.3`
- **Quick**: `gemini-3-flash,grok-4.3-low,claude-4.6-sonnet`
- **Comprehensive**: `gpt-5.5-thinking,claude-4.8-opus-thinking,gemini-3.1-pro,grok-4.3,gpt-5.5-pro`
- **Deep Research**: `openai-deep-research,gemini-deep-research,gpt-5.5-pro`

Generate slug from prompt (lowercase, non-alphanumeric → hyphens, max 50 chars).

Run the query **without** `--synthesise` — synthesis happens in Step 4b using an in-session subagent so it rides Peter's existing Max quota instead of billing the Anthropic API:

```bash
cd /Users/ph/.claude/skills/ask-many-models && yarn query \
  --models "<model-ids>" \
  --output-format both \
  [--image "<path>"] \
  [--system-prompt "<path>"] \
  "<prompt>"
```

The script prints the auto-generated output directory path (`data/model-outputs/<timestamp>-<slug>/`) and writes `results.md`, `results.html`, `responses.json`, `prompt.md`, and `individual/<model>.md` files.

#### Step 4b: Synthesise in-session (subagent)

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
cd /Users/ph/.claude/skills/ask-many-models && \
  npx tsx scripts/resynthesise.ts "<output-dir>" --file "<synthesis-file>"
```

This inserts the synthesis at the top of `results.md` (after the `# Multi-Model Query` metadata, before the first model section) and regenerates `results.html`.

**Fallback** — if for any reason you need API-based synthesis (running from Hermes/cron, or Claude's in-session context is wedged), omit `--file`:
```bash
npx tsx scripts/resynthesise.ts "<output-dir>"
```
This calls Claude Opus 4.8 via the Anthropic API and costs tokens.

#### Step 5: Open results

Say "Querying: [models]" and open the results file. Check `data/user-defaults.json` for `open_preference`:
- `"html"` → `open "<output-dir>/results.html"`
- `"markdown"` (or absent) → `open "<output-dir>/results.md"`

---

## Reference documentation

### Claude usage

This skill is intended to be used from Claude, either via natural language or the `/amm` command wrapper. Do not instruct users to install or run a standalone `amm` terminal command.

### Output format

Results can be output as markdown, HTML, or both. The preference is stored in `data/user-defaults.json` under `output_format`. The HTML version uses serif typography optimised for long-form reading.

- `--output-format markdown` — markdown only (default for script invocation)
- `--output-format html` — HTML only
- `--output-format both` — both markdown and HTML

### Image Support

Paste an image into your message along with your question to have vision-capable models analyse it:

```
/amm "What's in this image?" [paste image]
```

Vision-capable models: GPT-5.5 Thinking, GPT-5.5, GPT-5.5 Pro, GPT-5.4 Thinking, Claude 4.8 Opus Thinking, Claude 4.6 Sonnet, Gemini 3.1 Pro, Gemini 3 Flash, Gemini 3.1 Flash-Lite

Models without vision support will receive just the text prompt with a note that an image was provided.

### Internal implementation

The skill currently runs through the local `yarn query` tooling in this directory. Treat that as an implementation detail for maintainers, not a separate user-facing interface.

## Model Presets

| Preset | Models | Use Case |
|--------|--------|----------|
| `quick` | Gemini 3 Flash, Grok 4.3 Low Reasoning, Claude 4.6 Sonnet | Fast responses (~10s) |
| `comprehensive` | Defaults + GPT-5.5 Pro | Thorough coverage (~60s) |
| `deep-research` | OpenAI Deep Research, Gemini Deep Research, GPT-5.5 Pro | In-depth research (API, 10-20 min) |
| `comprehensive-deep` | Quick models + deep research | Best of both worlds |

## Deep Research Mode

Deep research models (OpenAI o3-deep-research and Gemini Deep Research) conduct comprehensive web research and take 10-20 minutes per model.

### Using Deep Research

From Claude, choose the "Deep Research" option during model selection.

When deep research is selected:
1. **Duration warning** is shown (10-20 minutes expected)
2. **Context picker** lets you add files/folders as background context
3. **Quick models** return results in ~30 seconds with preliminary synthesis
4. **Deep research** shows progress updates every 10 seconds
5. **Final synthesis** updates when deep research completes
6. **Desktop notification** fires on completion

### Context Files

Add context to your deep research queries:

1. When prompted, select "Add context file/folder..."
2. Choose a file (`.md`, `.txt`) or folder
3. Context is prepended to the prompt for all models

This is useful for:
- Research related to a specific project
- Questions about documents you've written
- Follow-up research with prior findings

### How It Works

1. Quick models (GPT, Claude, Gemini, Grok) query in parallel → results in ~30s
2. Deep research models start in background with progress polling
3. Preliminary synthesis runs with quick model responses
4. Deep research updates show status every 10 seconds
5. Final synthesis incorporates deep research findings when complete

## Synthesis Approach

Synthesis is produced by an in-session Opus subagent by default (see Step 4b above) so it rides Peter's Max quota. The older API-path synthesis (via `yarn query --synthesise` or `resynthesise.ts` without `--file`) still works and is kept as a fallback for Hermes/cron runs.

The synthesis identifies:

1. **Consensus** - Points where multiple models agree (high confidence)
2. **Unique insights** - Valuable points only one model mentioned
3. **Disagreements** - Contradictions with pros/cons analysis
4. **Confidence assessment** - Overall reliability based on agreement

### Synthesis Depths

| Depth | Output | Use Case |
|-------|--------|----------|
| `brief` | 2-3 sentences | Quick sanity check |
| `executive` | 1-2 paragraphs + bullets | Default, most queries |
| `full` | Multi-section document | Important decisions |

## Configuration

### API Keys

Create `.env` from `.env.example`:
```bash
cp .env.example .env
```

Required keys:
- `OPENAI_API_KEY` - For GPT models
- `ANTHROPIC_API_KEY` - For Claude models
- `GOOGLE_GENERATIVE_AI_API_KEY` - For Gemini models
- `XAI_API_KEY` - For Grok models
- `MISTRAL_API_KEY` - For Mistral / Magistral models

### Model Configuration

Model definitions and presets are in `models.json` (shipped with the skill). To customise, create a `config.json` with just the keys you want to override—it merges on top of `models.json`. See `config.example.json` for the format.

**When updating model IDs**, also update the `VISION_MODELS` array in `scripts/query.ts` — it has a hardcoded list of vision-capable model keys that must match `models.json`.

## Output Structure

```
data/model-outputs/
└── 2026-01-12-1430-your-question/
    ├── results.md          # Live results + synthesis (markdown)
    ├── results.html        # Live results + synthesis (HTML)
    ├── responses.json      # Raw API responses
    └── individual/
        ├── gpt-5.4-thinking.md
        ├── gpt-5.5-thinking.md
        ├── claude-4.8-opus-thinking.md
        ├── gemini-3.1-pro.md
        └── grok-4.3.md
```

## Available Models

### Quick/Standard Models

| Model ID | Display Name | Provider | Vision |
|----------|--------------|----------|--------|
| gpt-5.5-thinking | GPT-5.5 | OpenAI | ✓ |
| gpt-5.5-pro | GPT-5.5 Pro | OpenAI | ✓ |
| gpt-5.4-thinking | GPT-5.4 | OpenAI | ✓ |
| claude-4.8-opus-thinking | Claude 4.8 Opus | Anthropic | ✓ |
| grok-4.3 | Grok 4.3 | xAI | |
| gemini-3.1-pro | Gemini 3.1 Pro | Google | ✓ |
| gemini-3-flash | Gemini 3 Flash | Google | ✓ |
| gemini-3.1-flash-lite | Gemini 3.1 Flash-Lite | Google | ✓ |
| gpt-5.4-pro | GPT-5.4 Pro | OpenAI | ✓ |
| claude-4.6-sonnet | Claude 4.6 Sonnet | Anthropic | ✓ |
| grok-4.3-low | Grok 4.3 Low Reasoning | xAI | |
| magistral-medium | Magistral Medium | Mistral | |

### Deep Research Models

| Model ID | Display Name | Provider | Duration |
|----------|--------------|----------|----------|
| openai-deep-research | OpenAI Deep Research | OpenAI | 10-20 min |
| gemini-deep-research | Gemini Deep Research | Google | 10-20 min |

## Notifications

Desktop notifications via terminal-notifier:
- Install: `brew install terminal-notifier`
- Notifications sent when:
  - Query completes
  - Async request (deep research) completes
  - Errors occur

## Slow Models & Progressive Synthesis

Some models (like GPT-5.5 Pro) use extra compute and can take 10-60 minutes for complex queries. These are marked as "slow" in the config.

When slow models are included:
1. **Progress display** shows real-time status of all models with ✓/✗/◐ icons
2. **Fast models complete first** → preliminary synthesis runs immediately
3. **Slow models continue** in background with "(slow)" indicator
4. **Final synthesis** replaces preliminary when all models complete

The live markdown file updates continuously so you can read responses as they arrive.

## Error Handling

- **Model timeout**: Marked as failed, other responses still synthesised
- **API error**: Retries with exponential backoff (3 attempts)
- **Partial failure**: Synthesis proceeds with available responses
- **Browser not available**: Warns user to restart with `--chrome`

## Tips

1. **Start with `quick` preset** for rapid iteration
2. **Use defaults for important questions** where quality matters
3. **Save synthesis prompts** for consistent formatting
4. **Check individual responses** when synthesis seems off
5. **Override model IDs** via `config.json` as providers release new models
