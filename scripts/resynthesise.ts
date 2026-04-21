#!/usr/bin/env tsx
/**
 * Re-run synthesis on an existing ask-many-models output directory.
 *
 * Usage: npx tsx scripts/resynthesise.ts <output-dir>
 *
 * Reads <dir>/responses.json, synthesises via Claude Opus 4.7 (adaptive thinking),
 * and replaces the synthesis section in results.md and results.html. Useful when
 * a synthesis fails or you want to regenerate it without re-querying the models.
 */

import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ override: true });

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { generateText } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';

import { generateSynthesisPrompt } from './synthesis.js';
import { updateSynthesisInLiveFile, syncHtmlFile } from './query.js';

async function main() {
  const dir = process.argv[2];
  if (!dir) {
    console.error('Usage: npx tsx scripts/resynthesise.ts <output-dir>');
    process.exit(1);
  }

  const responsesPath = join(dir, 'responses.json');
  const mdPath = join(dir, 'results.md');

  if (!existsSync(responsesPath)) {
    console.error(`Not found: ${responsesPath}`);
    process.exit(1);
  }

  const data = JSON.parse(readFileSync(responsesPath, 'utf-8'));
  const prompt: string = data.prompt;
  const results: any[] = data.results;

  const synthesisPrompt = generateSynthesisPrompt(prompt, results, 'executive');

  console.log(`\n✨ Re-synthesising ${dir}\n   ${results.length} model results, prompt ${prompt.length} chars\n`);

  const anthropic = createAnthropic({ baseURL: 'https://api.anthropic.com/v1' });
  const res = await generateText({
    model: anthropic('claude-opus-4-7'),
    prompt: synthesisPrompt,
    maxOutputTokens: 16000,
    providerOptions: {
      anthropic: {
        thinking: { type: 'adaptive' },
      },
    },
  });

  const synthesis = res.text;
  console.log(`\n✓ Synthesis complete (${synthesis.length} chars)\n`);

  updateSynthesisInLiveFile(mdPath, synthesis, false);
  syncHtmlFile(mdPath, 'both');
  console.log(`Updated ${mdPath} and sibling .html`);
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
