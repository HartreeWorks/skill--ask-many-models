---
name: Ask Many Models
description: This skill should be used when the user asks to "ask many models", "query multiple AI models", "get opinions from different AIs", "compare AI responses", "ask GPT and Gemini", "ask several models", or mentions wanting to send the same prompt to multiple AI models and synthesise the results.
version: 0.1.0
---

# Ask Many Models

Send the same prompt to multiple AI models in parallel and synthesise their responses into a unified analysis.

## Purpose

When users want to gather perspectives from multiple AI models (GPT, Gemini, Grok, etc.), this skill orchestrates:
1. Parallel queries to selected models via API
2. Collection and storage of responses
3. Synthesis that identifies consensus, unique insights, and disagreements

## Quick Start

### Terminal CLI (Fastest)

Run `amm` directly from your terminal for instant model selection:

```bash
amm "What are the key considerations for X?"
```

Options:
- `--quick` or `-q` - Skip model selection, use defaults
- `--no-synthesise` - Skip the synthesis step

The CLI will:
1. Show an interactive model selector (using gum) with defaults pre-checked
2. Query selected models in parallel
3. Run automatic synthesis using Claude Opus 4.5 with extended thinking
4. Open the results markdown file

**Default models** are configured in `data/user-defaults.json`.

### Claude Command

Use the `/amm` command from any Claude Code session:

```
/amm "What are the key considerations for X?"
```

When invoked, the command will:
1. Show a model selection dialog (defaults: GPT-5.2 Thinking, Claude 4.5 Opus Thinking, Grok 4, Gemini 3 Pro, Gemini 3 Flash)
2. Create a live-updating markdown file with all responses
3. Open the file automatically so you can watch responses come in
4. Synthesise results once all models respond

**Model selection**: Press Enter to use defaults, or select specific models from the list.

**Default models** are configured in `data/user-defaults.json`.

### Image Support

Paste an image into your message along with your question to have vision-capable models analyse it:

```
/amm "What's in this image?" [paste image]
```

Vision-capable models: GPT-5.2 Thinking, Claude 4.5 Opus Thinking, Gemini 3 Pro, Gemini 2.5 Flash

Models without vision support will receive just the text prompt with a note that an image was provided.

### Direct Script Invocation

Run the query script directly:

```bash
cd /Users/ph/.claude/skills/ask-many-models
yarn query "Your question here"
```

Options:
- `--preset <name>` - Use a preset: `quick`, `frontier`, `comprehensive`
- `--models <list>` - Specify models: `gpt-4o,gemini-2.0-flash`
- `--timeout <seconds>` - Timeout per model (default: 180)
- `--image <path>` - Include an image file for vision models

### Available Commands

```bash
yarn query presets    # List available presets
yarn query models     # List available models
yarn query list       # List recent queries
yarn query show <dir> # Display responses from a query
yarn query synthesise <dir> # Generate synthesis prompt
```

## Workflow

### Step 1: Query Models

```bash
yarn query --preset frontier "What are the key considerations for..."
```

This will:
- Query all models in the preset in parallel
- Save responses to `multi-model-responses/<timestamp>-<slug>/`
- Print a summary of successful/failed queries

### Step 2: Synthesise Responses

The skill generates a synthesis prompt. To synthesise:

1. Generate the prompt:
   ```bash
   yarn query synthesise multi-model-responses/<your-query-dir>
   ```

2. Copy the output and send it to Claude

3. Save Claude's synthesis to the query directory as `synthesis.md`

Alternatively, read the individual responses from the `individual/` subdirectory and ask Claude directly to synthesise them.

## Model Presets

| Preset | Models | Use Case |
|--------|--------|----------|
| `quick` | Gemini 2.5 Flash, Grok 4 | Fast responses (~5s) |
| `frontier` | GPT-5.2, Gemini 3 Pro, Grok 4 | Best reasoning (~30s) |
| `comprehensive` | All API models | Thorough coverage (~60s) |
| `deep-research` | ChatGPT Deep Research | In-depth research (browser, 30+ min) |

## Browser-Based Models

Some models require browser interaction:
- **GPT-5 Pro** - Subscription-only via ChatGPT web interface
- **ChatGPT Deep Research** - Async research mode (30+ minutes)

### Using Browser Models

For browser-based models, Claude must be started with `--chrome`:

```bash
claude --chrome
```

When browser models are requested:

1. Navigate to the appropriate web interface (e.g., chatgpt.com)
2. Enter the prompt manually or via browser automation
3. For Deep Research: submit and note the conversation URL
4. Wait for response (or track async requests)
5. Copy response to the output directory

### Deep Research Workflow

1. User requests deep research:
   ```
   Ask many models with deep-research preset: [complex question]
   ```

2. Claude navigates to ChatGPT and initiates Deep Research

3. Response is tracked in `data/pending.json`:
   ```json
   {
     "id": "req_...",
     "prompt": "...",
     "status": "pending",
     "started_at": "...",
     "chat_url": "https://chatgpt.com/c/..."
   }
   ```

4. When complete, Claude:
   - Retrieves the response
   - Saves to output directory
   - Sends desktop notification via terminal-notifier
   - Updates pending.json status

## Synthesis Approach

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

### Model Configuration

Edit `config.json` to:
- Add/remove models from presets
- Adjust timeouts
- Configure new models as they become available

## Output Structure

```
multi-model-responses/
└── 2026-01-12-1430-your-question/
    ├── responses.json      # Raw API responses
    ├── synthesis.md        # Claude's synthesis
    └── individual/
        ├── gpt-5.2-thinking.md
        ├── claude-4.5-opus-thinking.md
        ├── gemini-3-pro.md
        └── grok-4.md
```

## Available Models

| Model ID | Display Name | Provider | Vision |
|----------|--------------|----------|--------|
| gpt-5.2-thinking | GPT-5.2 Thinking | OpenAI | ✓ |
| claude-4.5-opus-thinking | Claude 4.5 Opus Thinking | Anthropic | ✓ |
| grok-4 | Grok 4 | xAI | |
| gemini-3-pro | Gemini 3 Pro | Google | ✓ |
| gemini-3-flash | Gemini 3 Flash | Google | ✓ |
| gpt-5.2 | GPT-5.2 | OpenAI | ✓ |
| gpt-5.2-pro | GPT-5.2 Pro | OpenAI | ✓ |
| claude-4.5-opus | Claude 4.5 Opus | Anthropic | ✓ |
| claude-4-sonnet | Claude 4 Sonnet | Anthropic | ✓ |
| gemini-2.5-flash | Gemini 2.5 Flash | Google | ✓ |
| grok-4.1 | Grok 4.1 | xAI | |

## Notifications

Desktop notifications via terminal-notifier:
- Install: `brew install terminal-notifier`
- Notifications sent when:
  - Query completes
  - Async request (deep research) completes
  - Errors occur

## Error Handling

- **Model timeout**: Marked as failed, other responses still synthesised
- **API error**: Retries with exponential backoff (3 attempts)
- **Partial failure**: Synthesis proceeds with available responses
- **Browser not available**: Warns user to restart with `--chrome`

## Tips

1. **Start with `quick` preset** for rapid iteration
2. **Use `frontier` for important questions** where quality matters
3. **Save synthesis prompts** for consistent formatting
4. **Check individual responses** when synthesis seems off
5. **Update model IDs** in config.json as providers release new models

## Update check

This is a shared skill. Before executing, check `~/.claude/skills/.update-config.json`.
If `auto_check_enabled` is true and `last_checked_timestamp` is older than `check_frequency_days`,
mention: "It's been a while since skill updates were checked. Run `/update-skills` to see available updates."
Do NOT perform network operations - just check the local timestamp.
