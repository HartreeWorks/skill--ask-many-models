---
description: Query multiple AI models in parallel and synthesise responses
allowed-tools: Bash, Read, Glob, AskUserQuestion, Edit, Write
arguments:
  - name: prompt
    description: The question or prompt to send to all models
    required: true
---

# Ask Many Models

Query multiple AI models with the given prompt and synthesise their responses.

## Execution Steps

### Step 0: Check for images

Check if there are any images in the recent conversation context (i.e., the user's message that triggered this command).

If an image is present:
1. Save it to `/Users/ph/.claude/skills/ask-many-models/multi-model-responses/image-TIMESTAMP.png` (use actual timestamp)
2. Note the path - you'll pass it to the query command later with `--image <path>`

Vision-capable models (GPT-5.2 Thinking, Claude 4.5 Opus Thinking, Gemini 3 Pro, Gemini 2.5 Flash) will receive the image. Other models will receive just the text prompt with a note that an image was provided.

### Step 1: Read defaults and config

Read the user's default model selection:
```
/Users/ph/.claude/skills/ask-many-models/data/user-defaults.json
```

Read the available models from config:
```
/Users/ph/.claude/skills/ask-many-models/config.json
```

### Step 2: Ask user which models to use

Use AskUserQuestion with multiSelect to let the user choose models. The question should be structured as:

- **Header**: "Models"
- **Question**: "Which models should I query? (Enter to use defaults)"
- **Options**: List all API models from config (exclude browser-only models)
- For the default models from user-defaults.json, mark them as selected by default by putting "(default)" in the label

The user's defaults are stored in `data/user-defaults.json` - these should be the first options listed.

Example options structure:
1. GPT-5.2 Thinking (default)
2. Claude 4.5 Opus Thinking (default)
3. Grok 4 (default)
4. Gemini 3 Pro (default)
5. GPT-5.2
6. Claude 4.5 Opus
7. Gemini 2.5 Flash
8. Grok 4.1

If user selects "Other", ask them to type model names comma-separated.

### Step 3: Generate output file path

```bash
echo "/Users/ph/.claude/skills/ask-many-models/multi-model-responses/$(date +%Y-%m-%d-%H%M)-query.md"
```

### Step 4: Run the query with selected models

Convert the selected model display names back to model IDs and run:

```bash
cd /Users/ph/.claude/skills/ask-many-models && yarn query --models "<comma-separated-model-ids>" --live-file "<live-file-path>" [--image "<image-path>"] "$prompt"
```

If an image was saved in Step 0, include `--image "<image-path>"` in the command.

### Step 5: Confirm and open the file

After submitting the command:
1. Confirm: "Query submitted to [model names]"
2. Give the absolute path to the markdown file
3. Open it: `open "<live-file-path>"`

### Step 6: Synthesise after completion

Once all responses are in, read the live file and provide a synthesis identifying:
- **Consensus**: Points where multiple models agree (high confidence)
- **Unique insights**: Valuable points only one model mentioned
- **Disagreements**: Where models contradict, with analysis
- **Overall assessment**: Brief quality/reliability note

After printing the synthesis to the console, insert it into the markdown file immediately after the `---` line that follows the Time field (before the first model response). Use the Edit tool to insert a new section:

```markdown
# Synthesis

[Your synthesis content here]

---
```

## Available Models

| Model ID | Display Name | Provider |
|----------|--------------|----------|
| gpt-5.2-thinking | GPT-5.2 Thinking | OpenAI |
| claude-4.5-opus-thinking | Claude 4.5 Opus Thinking | Anthropic |
| grok-4 | Grok 4 | xAI |
| gemini-3-pro | Gemini 3 Pro | Google |
| gpt-5.2 | GPT-5.2 | OpenAI |
| claude-4.5-opus | Claude 4.5 Opus | Anthropic |
| gemini-2.5-flash | Gemini 2.5 Flash | Google |
| grok-4.1 | Grok 4.1 | xAI |
