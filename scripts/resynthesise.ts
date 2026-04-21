#!/usr/bin/env tsx
/**
 * Insert a synthesis into an existing ask-many-models output directory.
 *
 * Usage:
 *   npx tsx scripts/resynthesise.ts <output-dir>
 *     → Re-query Claude Opus 4.7 via the Anthropic API (for Hermes/cron use).
 *
 *   npx tsx scripts/resynthesise.ts <output-dir> --file <synthesis.md>
 *     → Read synthesis text from a file (for in-session Claude Code use,
 *       where an Opus subagent has produced the synthesis using Peter's
 *       Max quota rather than billable API tokens).
 *
 * In both modes the synthesis is placed after the `# Multi-Model Query`
 * metadata block and before the first model section, and results.html is
 * regenerated to match.
 */

import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ override: true });

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

import { updateSynthesisInLiveFile, syncHtmlFile } from './query.js';

type Args = { dir: string; file?: string };

function parseArgs(argv: string[]): Args {
  const args = argv.slice(2);
  let dir: string | undefined;
  let file: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--file') {
      file = args[++i];
    } else if (!dir) {
      dir = a;
    }
  }

  if (!dir) {
    console.error('Usage: npx tsx scripts/resynthesise.ts <output-dir> [--file <synthesis.md>]');
    process.exit(1);
  }
  return { dir, file };
}

async function fetchSynthesisFromApi(dir: string): Promise<string> {
  // Lazy-import so --file mode doesn't need the SDK / API key.
  const { generateText } = await import('ai');
  const { createAnthropic } = await import('@ai-sdk/anthropic');
  const { generateSynthesisPrompt } = await import('./synthesis.js');

  const responsesPath = join(dir, 'responses.json');
  if (!existsSync(responsesPath)) {
    throw new Error(`Not found: ${responsesPath}`);
  }
  const data = JSON.parse(readFileSync(responsesPath, 'utf-8'));
  const synthesisPrompt = generateSynthesisPrompt(data.prompt, data.results, 'executive');

  console.log(`\n✨ Synthesising via Anthropic API (Claude Opus 4.7)\n   ${data.results.length} model results, prompt ${String(data.prompt).length} chars\n`);

  const anthropic = createAnthropic({ baseURL: 'https://api.anthropic.com/v1' });
  const res = await generateText({
    model: anthropic('claude-opus-4-7'),
    prompt: synthesisPrompt,
    maxOutputTokens: 16000,
    providerOptions: {
      anthropic: { thinking: { type: 'adaptive' } },
    },
  });
  return res.text;
}

async function main() {
  const { dir, file } = parseArgs(process.argv);
  const mdPath = join(dir, 'results.md');

  if (!existsSync(mdPath)) {
    console.error(`Not found: ${mdPath}`);
    process.exit(1);
  }

  let synthesis: string;
  if (file) {
    if (!existsSync(file)) {
      console.error(`Synthesis file not found: ${file}`);
      process.exit(1);
    }
    synthesis = readFileSync(file, 'utf-8').trim();
    console.log(`\n✨ Inserting synthesis from ${file} (${synthesis.length} chars)\n`);
  } else {
    synthesis = await fetchSynthesisFromApi(dir);
    console.log(`\n✓ API synthesis complete (${synthesis.length} chars)\n`);
  }

  updateSynthesisInLiveFile(mdPath, synthesis, false);
  syncHtmlFile(mdPath, 'both');
  console.log(`Updated ${mdPath} and sibling .html`);
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
