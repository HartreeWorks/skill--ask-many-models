# Ask Many Models — CLI and configuration reference

Background detail for maintaining the skill. Not needed to run it — `SKILL.md`
is self-contained.

## Invocation

The skill runs through the local `yarn query` tooling in the skill directory.
There is no standalone terminal command, and none should be added: the skill is
invoked from an agent session, either in natural language or via `/amm`.

```bash
cd "$HOME/.claude/skills/ask-many-models" && yarn query [options] "<prompt>"
```

| Command | Purpose |
|---------|---------|
| `yarn query menu` | Print the preset selection menu |
| `yarn query menu --pick` | Print the numbered individual-model picker |
| `yarn query presets` | Preset names, descriptions and members |
| `yarn query models` | Available models by type |
| `yarn query synthesise <dir>` | Generate a synthesis prompt for existing responses |

| Option | Purpose |
|--------|---------|
| `-p, --preset <name>` | Run a named preset |
| `--models <ids>` | Comma-separated model IDs |
| `--output-format <fmt>` | `markdown`, `html`, or `both` |
| `--image <path>` | Attach an image for vision-capable models |
| `--system-prompt <path>` | Custom system prompt file |
| `--context <path>` | Prepend a file or folder's contents to the prompt |
| `--no-save` | Do not write responses to disk |
| `--chrome` | Enable browser-based models |

## Model and preset configuration

`models.json` is the single source of truth for both. It defines `presets`,
`models`, `defaults` and `synthesis_depths`, and everything the skill shows the
user is rendered from it by `printMenu()` in `scripts/models.ts`.

To add or change a model, edit `models.json` alone. Relevant per-model keys:

| Key | Meaning |
|-----|---------|
| `display_name` | Shown in menus and results |
| `vision` | Accepts image input — drives image routing and the menu's `[vision]` tag |
| `slow` | Extra compute; triggers progressive synthesis |
| `deep_research` | Long-running research model (10–20 min) |
| `type: browser` | Requires `--chrome` |

To customise without editing the shipped file, create `config.json` with only
the keys to override; it merges on top of `models.json`. See
`config.example.json`.

## API keys

Create `.env` from `.env.example`:

| Variable | Provider |
|----------|----------|
| `OPENAI_API_KEY` | GPT models |
| `ANTHROPIC_API_KEY` | Claude models |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Gemini models |
| `XAI_API_KEY` | Grok models |
| `MISTRAL_API_KEY` | Mistral / Magistral models |

## Output

Results are written to `data/model-outputs/<timestamp>-<slug>/`:

```
├── results.md          # Live results + synthesis (markdown)
├── results.html        # Same, serif typography for long-form reading
├── responses.json      # Raw API responses
├── prompt.md           # The prompt as sent
└── individual/
    └── <model>.md      # One file per model
```

A default output format can be stored in `data/user-defaults.json` under
`output_format`, and a preferred file to open under `open_preference`
(`"html"` or `"markdown"`).

## Synthesis

Synthesis is produced by an in-session Opus subagent (SKILL.md Step 4b) so it
draws on the operator's plan quota rather than billing the Anthropic API. The
API path — `yarn query --synthesise`, or `resynthesise.ts` without `--file` —
remains as a fallback for scheduled or unattended runs.

It identifies consensus, unique insights, disagreements, and an overall
confidence assessment. Depths are `brief` (2–3 sentences), `executive`
(default) and `full` (multi-section).

## Deep research

`openai-deep-research` and `gemini-deep-research` conduct web research and take
10–20 minutes each. They run in parallel with progress polling; each response is
written to the output directory as it completes, and synthesis runs once the
whole set finishes. Use `--context` to ground a research run in a project's
files.

## Slow models and progressive synthesis

Models marked `slow` can take 10–60 minutes. When one is included:

1. A progress display shows per-model status with ✓/✗/◐ icons.
2. Fast models finish first and a preliminary synthesis runs immediately.
3. Slow models continue in the background, marked "(slow)".
4. The final synthesis replaces the preliminary one.

The live markdown file updates continuously, so responses are readable as they
arrive.

## Error handling

| Failure | Behaviour |
|---------|-----------|
| Model timeout | Marked failed; remaining responses still synthesised |
| API error | Retries with exponential backoff (3 attempts) |
| Partial failure | Synthesis proceeds with what succeeded |
| Browser unavailable | Warns to restart with `--chrome` |

Desktop notifications fire on completion, async completion and errors, via
`terminal-notifier` (`brew install terminal-notifier`).
