---
description: Query multiple AI models in parallel and synthesise responses
allowed-tools: Bash, Read, Write, AskUserQuestion
arguments:
  - name: prompt
    description: The question or prompt to send to all models
    required: true
---

# Ask many models

Read `$HOME/.claude/skills/ask-many-models/SKILL.md` completely and follow its workflow.

Treat the supplied command argument as the seed prompt. Do not skip the clarification decision, prompt approval, model-selection menu, or in-session synthesis steps defined by the skill. Do not pass `--synthesise` to the query command unless the skill's documented fallback conditions apply.
