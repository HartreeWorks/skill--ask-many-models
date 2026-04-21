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

## Execution Steps

### Step 1: Check for images

Check if there are any images in the conversation context. If so, note this for Step 4.

### Step 2: Model selection

Read the config files:
- `/Users/ph/.claude/skills/ask-many-models/data/user-defaults.json`
- `/Users/ph/.claude/skills/ask-many-models/models.json`

Use AskUserQuestion with these preset options:

- **Header**: "Models"
- **Question**: "Which models should I query?"
- **Options**:
  1. "Defaults" - GPT-5.4 Thinking, Claude 4.7 Opus Thinking, Gemini 3.1 Pro, Grok 4.1 (Recommended)
  2. "Quick" - Gemini 3 Flash, Grok 4.1 Fast, Claude 4.5 Sonnet (~10s)
  3. "Comprehensive" - Defaults + GPT-5.4 Pro (slow, extra compute)
  4. "Deep Research" - OpenAI/Gemini deep research + GPT-5.4 Pro (10-20 min)
  5. "Pick models" - Choose individual models

If user selects "Pick models", print this numbered list and ask them to type the numbers they want:

```
Available models:
1. gpt-5.4-thinking (default)
2. claude-4.7-opus-thinking (default)
3. gemini-3.1-pro (default)
4. grok-4.1 (default)
5. gemini-3-flash
6. grok-4.1-non-reasoning
7. claude-4.5-sonnet
8. gpt-5.4
9. gpt-5.4-pro (slow)
10. claude-4.7-opus
11. openai-deep-research (10-20 min)
12. gemini-deep-research (10-20 min)

_(To use a custom system prompt, type SYS after the number, e.g. "1 SYS")_

Enter numbers (e.g. 1,2,5). Add SYS for a custom system prompt (e.g. "1,3 SYS"):
```

Then map the user's numbers to model IDs. Check for `SYS` in the input; if present, run the system prompt flow from `SKILL.md` and pass the saved file via `--system-prompt`.

### Step 3: Save image if present

If an image is present in the conversation:
1. Save it to `/Users/ph/.claude/skills/ask-many-models/data/model-outputs/image-TIMESTAMP.png`
2. Note the path for the `--image` flag

Vision-capable models: gpt-5.4-thinking, claude-4.7-opus-thinking, claude-4.5-sonnet, gemini-3.1-pro, gemini-3-flash

### Step 4: Run the query

Map the selection to models:
- **Defaults**: `gpt-5.4-thinking,claude-4.7-opus-thinking,gemini-3.1-pro,grok-4.1`
- **Quick**: `gemini-3-flash,grok-4.1-non-reasoning,claude-4.5-sonnet`
- **Comprehensive**: `gpt-5.4-thinking,claude-4.7-opus-thinking,gemini-3.1-pro,grok-4.1,gpt-5.4-pro`
- **Deep Research**: `openai-deep-research,gemini-deep-research,gpt-5.4-pro`
- **Pick models**: Use the selected model IDs

Generate a slug from the prompt (lowercase, replace non-alphanumeric with hyphens, max 50 chars).

Run the query:

```bash
cd /Users/ph/.claude/skills/ask-many-models && yarn query \
  --models "<comma-separated-model-ids>" \
  --synthesise \
  --output-format both \
  [--image "<image-path>"] \
  [--system-prompt "<path>"] \
  "<prompt>"
```

The script auto-generates an output directory at `data/model-outputs/<timestamp>-<slug>/` containing `results.md`, `results.html`, and individual model responses.

### Step 5: Confirm and open

1. Say: "Querying: [model list]"
2. Give the absolute path to the output directory
3. Open results based on `open_preference` in `data/user-defaults.json`:
   - `"html"` → `open "<output-dir>/results.html"`
   - `"markdown"` (or absent) → `open "<output-dir>/results.md"`

The `--synthesise` flag runs Claude Opus 4.7 with extended thinking to synthesise responses automatically.

## Model Reference

### Presets

| Preset | Models | Speed |
|--------|--------|-------|
| Defaults | gpt-5.4-thinking, claude-4.7-opus-thinking, gemini-3.1-pro, grok-4.1 | ~30s |
| Quick | gemini-3-flash, grok-4.1-non-reasoning, claude-4.5-sonnet | ~10s |
| Comprehensive | Defaults + gpt-5.4-pro | ~60s |
| Deep Research | openai-deep-research, gemini-deep-research, gpt-5.4-pro | 10-20 min |

### All Models

| Model ID | Display Name | Vision | Notes |
|----------|--------------|--------|-------|
| gpt-5.4-thinking | GPT-5.4 Thinking | ✓ | |
| claude-4.7-opus-thinking | Claude 4.7 Opus Thinking | ✓ | |
| grok-4.1 | Grok 4.1 (Reasoning) | | |
| gemini-3.1-pro | Gemini 3.1 Pro | ✓ | |
| gemini-3-flash | Gemini 3 Flash | ✓ | |
| gpt-5.4 | GPT-5.4 | ✓ | |
| gpt-5.4-pro | GPT-5.4 Pro | ✓ | Slow |
| claude-4.7-opus | Claude 4.7 Opus | ✓ | |
| claude-4.5-sonnet | Claude 4.5 Sonnet | ✓ | |
| grok-4.1-non-reasoning | Grok 4.1 (Fast) | | |
| openai-deep-research | OpenAI Deep Research | | 10-20 min |
| gemini-deep-research | Gemini Deep Research | | 10-20 min |
