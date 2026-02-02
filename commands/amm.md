---
description: Query multiple AI models in parallel and synthesise responses
allowed-tools: Bash, Read, Write, AskUserQuestion
arguments:
  - name: prompt
    description: The question or prompt to send to all models
    required: true
---

# Ask Many Models

Query multiple AI models with the given prompt and synthesise their responses.

**Tip**: For faster execution without images, run `amm "prompt"` directly in terminal.

## Execution Steps

### Step 1: Check for images

Check if there are any images in the conversation context. If so, note this for Step 4.

### Step 2: Model selection

Read the config files:
- `/Users/ph/.claude/skills/ask-many-models/data/user-defaults.json`
- `/Users/ph/.claude/skills/ask-many-models/config.json`

Use AskUserQuestion with these preset options (matching the CLI):

- **Header**: "Models"
- **Question**: "Which models should I query?"
- **Options**:
  1. "Defaults" - GPT-5.2 Thinking, Claude 4.5 Opus Thinking, Gemini 3 Pro, Grok 4.1 (Recommended)
  2. "Quick" - Gemini 3 Flash, Grok 4.1 Fast, Claude 4.5 Sonnet (~10s)
  3. "Deep Research" - Defaults + OpenAI/Gemini deep research (20-40 min)
  4. "Pick models" - Choose individual models

If user selects "Pick models", print this numbered list and ask them to type the numbers they want:

```
Available models:
1. gpt-5.2-thinking (default)
2. claude-4.5-opus-thinking (default)
3. gemini-3-pro (default)
4. grok-4.1 (default)
5. gemini-3-flash
6. grok-4.1-non-reasoning
7. claude-4.5-sonnet
8. gpt-5.2
9. gpt-5.2-pro (slow)
10. claude-4.5-opus
11. openai-deep-research (20-40 min)
12. gemini-deep-research (20-40 min)

Enter numbers (e.g. 1,2,5):
```

Then map the user's numbers to model IDs.

### Step 3: Save image if present

If an image is present in the conversation:
1. Save it to `/Users/ph/.claude/skills/ask-many-models/multi-model-responses/image-TIMESTAMP.png`
2. Note the path for the `--image` flag

Vision-capable models: gpt-5.2-thinking, claude-4.5-opus-thinking, claude-4.5-sonnet, gemini-3-pro, gemini-3-flash

### Step 4: Run the query

Map the selection to models:
- **Defaults**: `gpt-5.2-thinking,claude-4.5-opus-thinking,gemini-3-pro,grok-4.1`
- **Quick**: `gemini-3-flash,grok-4.1-non-reasoning,claude-4.5-sonnet`
- **Deep Research**: `gpt-5.2-thinking,claude-4.5-opus-thinking,gemini-3-pro,grok-4.1,openai-deep-research,gemini-deep-research`
- **Pick models**: Use the selected model IDs

Generate a slug from the prompt (lowercase, replace non-alphanumeric with hyphens, max 50 chars).

Run the query:

```bash
cd /Users/ph/.claude/skills/ask-many-models && yarn query \
  --models "<comma-separated-model-ids>" \
  --live-file "/Users/ph/.claude/skills/ask-many-models/multi-model-responses/$(date +%Y-%m-%d-%H%M)-<slug>.md" \
  --synthesise \
  [--image "<image-path>"] \
  "<prompt>"
```

### Step 5: Confirm and open

1. Say: "Querying: [model list]"
2. Give the absolute path to the live markdown file
3. Open it based on `open_preference` in `data/user-defaults.json`:
   - `"html"` → `open "<live-file-path with .md replaced by .html>"`
   - `"markdown"` (or absent) → `open "<live-file-path>"`

The `--synthesise` flag runs Claude Opus 4.5 with extended thinking to synthesise responses automatically.

## Model Reference

### Presets

| Preset | Models | Speed |
|--------|--------|-------|
| Defaults | gpt-5.2-thinking, claude-4.5-opus-thinking, gemini-3-pro, grok-4.1 | ~30s |
| Quick | gemini-3-flash, grok-4.1-non-reasoning, claude-4.5-sonnet | ~10s |
| Deep Research | Defaults + openai-deep-research, gemini-deep-research | 20-40 min |

### All Models

| Model ID | Display Name | Vision | Notes |
|----------|--------------|--------|-------|
| gpt-5.2-thinking | GPT-5.2 Thinking | ✓ | |
| claude-4.5-opus-thinking | Claude 4.5 Opus Thinking | ✓ | |
| grok-4.1 | Grok 4.1 (Reasoning) | | |
| gemini-3-pro | Gemini 3 Pro | ✓ | |
| gemini-3-flash | Gemini 3 Flash | ✓ | |
| gpt-5.2 | GPT-5.2 | ✓ | |
| gpt-5.2-pro | GPT-5.2 Pro | ✓ | Slow |
| claude-4.5-opus | Claude 4.5 Opus | ✓ | |
| claude-4.5-sonnet | Claude 4.5 Sonnet | ✓ | |
| grok-4.1-non-reasoning | Grok 4.1 (Fast) | | |
| openai-deep-research | OpenAI Deep Research | | 20-40 min |
| gemini-deep-research | Gemini Deep Research | | 20-40 min |
