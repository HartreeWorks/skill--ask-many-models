# Synthesis Prompt Templates

This document contains the prompt templates used for synthesising multi-model responses.

## Synthesis Principles

The synthesis process follows these key principles:

1. **Consensus identification**: Information agreed upon by multiple models is more likely to be accurate
2. **Unique insight preservation**: Valuable points from individual models should not be lost
3. **Disagreement analysis**: Contradictions should be presented fairly with analysis
4. **Deduplication**: Avoid repeating the same information multiple times
5. **Nuance preservation**: Keep qualifications and uncertainty expressions

## Depth Levels

### Brief
- 2-3 sentences
- Core consensus only
- One standout disagreement or insight if significant

### Executive (Default)
- 1-2 paragraph summary
- Bullet-pointed key findings
- Disagreement notes with brief analysis
- Unique insights section
- Confidence assessment

### Full
- Comprehensive multi-section document
- Topic-organised findings
- In-depth disagreement analysis
- Model-by-model contributions
- Methodology notes

## Output Formatting

### Disagreement Notation
Use the warning emoji to highlight disagreements:
```
⚠️ **Disagreement**: [Model A] says X, while [Model B] says Y
```

### Source Attribution
Tag unique insights with their source:
```
[From GPT-4o]: This model uniquely noted that...
```

### Confidence Levels
Express confidence based on consensus:
- **High confidence**: All models agree
- **Moderate confidence**: Most models agree, minor variations
- **Low confidence**: Significant disagreement or sparse coverage

## Template Variables

When generating synthesis prompts, these variables are substituted:

- `{{originalPrompt}}` - The user's original question
- `{{responsesSection}}` - Formatted responses from each model
- `{{modelCount}}` - Number of models that responded
- `{{depthInstructions}}` - Depth-specific instructions
