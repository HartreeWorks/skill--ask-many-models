/**
 * Response synthesis logic
 *
 * Combines responses from multiple models into a unified analysis
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { Config } from './models.js';

export interface ModelResult {
  model: string;
  status: 'success' | 'error' | 'timeout';
  response?: string;
  error?: string;
  latencyMs?: number;
  tokensUsed?: number;
}

export interface ResponsesData {
  prompt: string;
  timestamp: string;
  results: ModelResult[];
}

/**
 * Generate the synthesis prompt for Claude
 */
export function generateSynthesisPrompt(
  originalPrompt: string,
  results: ModelResult[],
  depth: 'brief' | 'executive' | 'full'
): string {
  const successfulResults = results.filter(
    (r) => r.status === 'success' && r.response
  );

  if (successfulResults.length === 0) {
    return 'No successful responses to synthesise.';
  }

  // Build the responses section
  const responsesSection = successfulResults
    .map(
      (r) => `## ${r.model} Response

${r.response}
`
    )
    .join('\n---\n\n');

  // Depth-specific instructions
  const depthInstructions = {
    brief: `Create a **brief synthesis** (2-3 sentences) that:
- Captures the core consensus
- Notes any significant disagreement
- Highlights one standout unique insight if present`,

    executive: `Create an **executive synthesis** (1-2 paragraphs + bullet points) that:
- Summarises the key consensus in 2-3 sentences
- Lists 4-6 key findings as bullet points
- Notes any disagreements with brief analysis
- Highlights unique insights worth preserving`,

    full: `Create a **comprehensive synthesis** that:
- Provides a thorough executive summary
- Organises findings by topic/theme
- Preserves all unique insights from each model
- Analyses disagreements in depth with pros/cons
- Includes a confidence assessment for each major finding
- Notes which models contributed which insights`,
  };

  return `# Multi-Model Response Synthesis

You are synthesising responses from ${successfulResults.length} AI models to the following question.

## Original Prompt
${originalPrompt}

## Responses

${responsesSection}

---

## Synthesis Task

${depthInstructions[depth]}

### Key Principles

1. **Identify consensus**: What do multiple models agree on? This is likely reliable.

2. **Highlight unique insights**: What did only one model mention that's valuable?
   - Tag the source: "[From GPT-4o]" or similar
   - Don't discard these just because others didn't mention them

3. **Flag disagreements**: Where do models contradict?
   - Present both positions fairly
   - Analyse which seems more credible and why
   - Use format: "⚠️ **Disagreement**: [Model A] says X, while [Model B] says Y"

4. **Remove duplication**: Don't repeat the same point multiple times

5. **Preserve nuance**: Keep qualifications and uncertainty expressed by models

### Output Format

${
  depth === 'brief'
    ? `A single paragraph of 2-3 sentences.`
    : depth === 'executive'
      ? `### Executive Summary
[2-3 sentences capturing the core answer]

### Key Findings
- [Bullet points of main findings]

### Points of Disagreement
- [Any contradictions, or "None significant" if models agreed]

### Unique Insights
- **[Model name]**: [Notable insight only this model provided]

### Confidence Level
[One sentence on how confident we should be based on model agreement]`
      : `### Executive Summary
[Comprehensive summary paragraph]

### Findings by Topic

#### [Topic 1]
[Detailed findings with source attribution]

#### [Topic 2]
[Continue for each major topic]

### Detailed Analysis of Disagreements
[In-depth analysis of any contradictions]

### Model-by-Model Unique Contributions
- **[Model 1]**: [Unique insights]
- **[Model 2]**: [Unique insights]
[Continue for each model]

### Confidence Assessment
[Analysis of reliability based on consensus levels]

### Synthesis Methodology Notes
[Brief note on how many models responded, any failures, overall quality]`
}

---

Please generate the synthesis now.`;
}

/**
 * Load responses from an output directory
 */
export function loadResponses(outputDir: string): ResponsesData | null {
  const responsesPath = join(outputDir, 'responses.json');

  if (!existsSync(responsesPath)) {
    console.error(`No responses.json found in ${outputDir}`);
    return null;
  }

  return JSON.parse(readFileSync(responsesPath, 'utf-8'));
}

/**
 * Save synthesis to output directory
 */
export function saveSynthesis(
  outputDir: string,
  synthesis: string,
  depth: string
): void {
  const synthesisPath = join(outputDir, 'synthesis.md');

  const header = `# Synthesis (${depth})

_Generated: ${new Date().toISOString()}_

---

`;

  writeFileSync(synthesisPath, header + synthesis);
  console.log(`\nSynthesis saved to: ${synthesisPath}`);
}

/**
 * Format results for display
 */
export function formatResultsForDisplay(results: ModelResult[]): string {
  const successful = results.filter((r) => r.status === 'success');
  const failed = results.filter((r) => r.status !== 'success');

  let output = `## Response Summary\n\n`;
  output += `- **${successful.length}** models responded successfully\n`;

  if (failed.length > 0) {
    output += `- **${failed.length}** models failed:\n`;
    for (const f of failed) {
      output += `  - ${f.model}: ${f.error}\n`;
    }
  }

  output += `\n## Individual Responses\n\n`;

  for (const r of successful) {
    output += `### ${r.model}\n\n`;
    output += r.response || '[No response]';
    output += '\n\n';

    if (r.latencyMs) {
      output += `_Latency: ${(r.latencyMs / 1000).toFixed(1)}s`;
      if (r.tokensUsed) {
        output += ` | Tokens: ${r.tokensUsed}`;
      }
      output += '_\n\n';
    }

    output += '---\n\n';
  }

  return output;
}

/**
 * Check if synthesis already exists
 */
export function synthesisExists(outputDir: string): boolean {
  return existsSync(join(outputDir, 'synthesis.md'));
}
