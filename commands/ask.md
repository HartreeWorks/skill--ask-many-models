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

**Tip**: For faster execution without images, use `amm "prompt"` directly in terminal.

## Execution Steps

### Step 1: Check for images and ask about model selection

First, check if there are any images in the conversation context.

Then ask the user ONE question with these options:

- **Header**: "Mode"
- **Question**: "How should I run this query?"
- **Options**:
  1. "Use defaults" - Use default models from user-defaults.json (fastest)
  2. "Let me choose" - Show model selection dialog
  3. "Quick preset" - Use the quick preset (gemini-3-flash, gemini-2.5-flash, grok-4)

If user selects "Let me choose", proceed to Step 2. Otherwise skip to Step 3.

### Step 2: Model selection (only if requested)

Read the config and defaults:
- `/Users/ph/.claude/skills/ask-many-models/data/user-defaults.json`
- `/Users/ph/.claude/skills/ask-many-models/config.json`

Use AskUserQuestion with multiSelect. Mark default models with "(default)" in the label.

### Step 3: Save image if present

If an image is present in the conversation:
1. Save it to `/Users/ph/.claude/skills/ask-many-models/multi-model-responses/image-TIMESTAMP.png`
2. Note the path for the `--image` flag

Vision-capable models: GPT-5.2 Thinking, Claude 4.5 Opus Thinking, Gemini 3 Pro, Gemini 3 Flash, Gemini 2.5 Flash.

### Step 4: Run the query

Read defaults if not already read:
```
/Users/ph/.claude/skills/ask-many-models/data/user-defaults.json
```

Generate output path and run:

```bash
cd /Users/ph/.claude/skills/ask-many-models && yarn query \
  --models "<comma-separated-model-ids>" \
  --live-file "/Users/ph/.claude/skills/ask-many-models/multi-model-responses/$(date +%Y-%m-%d-%H%M)-query.md" \
  --synthesise \
  [--image "<image-path>"] \
  "$prompt"
```

The `--synthesise` flag automatically runs Claude Opus 4.5 with extended thinking to synthesise responses and insert the synthesis into the markdown file.

### Step 5: Confirm and open

1. Confirm: "Query submitted to [model names]"
2. Give the absolute path to the markdown file
3. Open it: `open "<live-file-path>"`

Synthesis is handled automatically by the script - no manual synthesis needed.

## Available Models

| Model ID | Display Name | Provider |
|----------|--------------|----------|
| gpt-5.2-thinking | GPT-5.2 Thinking | OpenAI |
| claude-4.5-opus-thinking | Claude 4.5 Opus Thinking | Anthropic |
| grok-4 | Grok 4 | xAI |
| gemini-3-pro | Gemini 3 Pro | Google |
| gemini-3-flash | Gemini 3 Flash | Google |
| gpt-5.2 | GPT-5.2 | OpenAI |
| claude-4.5-opus | Claude 4.5 Opus | Anthropic |
| gemini-2.5-flash | Gemini 2.5 Flash | Google |
| grok-4.1 | Grok 4.1 | xAI |
