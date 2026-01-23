#!/usr/bin/env npx tsx
/**
 * Main CLI for querying multiple AI models
 *
 * Usage:
 *   yarn query "What are the pros and cons of Rust vs Go?"
 *   yarn query --preset quick "Explain quantum computing"
 *   yarn query --models gpt-4o,gemini-2.0-flash "Your question"
 */

import 'dotenv/config';
import { program } from 'commander';
import { generateText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync, appendFileSync } from 'fs';
import { join, dirname, basename, extname } from 'path';
import { fileURLToPath } from 'url';
import {
  createModel,
  getPresetModels,
  presetRequiresBrowser,
  listPresets,
  listModels,
  type Config,
} from './models.js';
import {
  generateSynthesisPrompt,
  loadResponses,
  saveSynthesis,
  formatResultsForDisplay,
} from './synthesis.js';
import { notifyQueryComplete, isTerminalNotifierInstalled } from './notify.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = join(__dirname, '..');

// Load config
function loadConfig(): Config {
  const configPath = join(SKILL_DIR, 'config.json');
  return JSON.parse(readFileSync(configPath, 'utf-8'));
}

// Generate a slug from the prompt
function generateSlug(prompt: string): string {
  return prompt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);
}

// Generate timestamp-based directory name
function generateOutputDir(prompt: string): string {
  const now = new Date();
  const timestamp = now.toISOString().slice(0, 16).replace(/[T:]/g, '-');
  const slug = generateSlug(prompt);
  return join(SKILL_DIR, 'multi-model-responses', `${timestamp}-${slug}`);
}

interface ModelResult {
  model: string;
  status: 'success' | 'error' | 'timeout';
  response?: string;
  error?: string;
  latencyMs?: number;
  tokensUsed?: number;
}

// Models known to support vision
const VISION_MODELS = [
  'gpt-5.2-thinking',
  'gpt-5.2',
  'gpt-5.2-pro',
  'claude-4.5-opus-thinking',
  'claude-4.5-opus',
  'claude-4-sonnet',
  'gemini-3-pro',
  'gemini-3-flash',
];

// Query a single model
async function queryModel(
  modelName: string,
  prompt: string,
  config: Config,
  timeoutMs: number,
  imagePath?: string
): Promise<ModelResult> {
  const startTime = Date.now();

  const model = createModel(modelName, config);
  if (!model) {
    return {
      model: modelName,
      status: 'error',
      error: `Could not create model instance for ${modelName}`,
    };
  }

  const modelConfig = config.models[modelName];
  const maxTokens = modelConfig?.max_tokens || config.defaults.max_tokens;

  // Check if we have an image and if this model supports vision
  const hasImage = imagePath && existsSync(imagePath);
  const supportsVision = VISION_MODELS.includes(modelName);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    let result;

    if (hasImage && supportsVision) {
      // Use multimodal message with image
      const imageBuffer = readFileSync(imagePath);
      const ext = extname(imagePath).toLowerCase();
      const mediaType = ext === '.png' ? 'image/png' :
                       ext === '.gif' ? 'image/gif' :
                       ext === '.webp' ? 'image/webp' : 'image/jpeg';

      result = await generateText({
        model,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', image: imageBuffer, mediaType },
            { type: 'text', text: prompt },
          ],
        }],
        maxOutputTokens: maxTokens,
        abortSignal: controller.signal,
      });
    } else if (hasImage && !supportsVision) {
      // Model doesn't support vision - add note to prompt
      const modifiedPrompt = `[Note: An image was provided but ${modelName} doesn't support vision.]\n\n${prompt}`;
      result = await generateText({
        model,
        prompt: modifiedPrompt,
        maxOutputTokens: maxTokens,
        abortSignal: controller.signal,
      });
    } else {
      // Text-only query
      result = await generateText({
        model,
        prompt,
        maxOutputTokens: maxTokens,
        abortSignal: controller.signal,
      });
    }

    clearTimeout(timeout);

    return {
      model: modelName,
      status: 'success',
      response: result.text,
      latencyMs: Date.now() - startTime,
      tokensUsed: result.usage?.totalTokens,
    };
  } catch (error) {
    const latencyMs = Date.now() - startTime;

    if (error instanceof Error && error.name === 'AbortError') {
      return {
        model: modelName,
        status: 'timeout',
        error: `Timeout after ${timeoutMs}ms`,
        latencyMs,
      };
    }

    return {
      model: modelName,
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
      latencyMs,
    };
  }
}

// Normalise H1 headings in model responses to H2 (to avoid conflicts with model name heading)
function normaliseHeadings(text: string): string {
  // Replace lines starting with single # (but not ##) with ##
  return text.replace(/^# /gm, '## ');
}

// Create initial live markdown file with model headings
function createLiveFile(filePath: string, prompt: string, modelNames: string[], imagePath?: string): void {
  const now = new Date().toLocaleString('en-GB', { timeZone: 'Europe/Paris' });
  let content = `# Multi-Model Query\n\n`;
  content += `**Prompt:** ${prompt}\n\n`;
  if (imagePath) {
    const imageFilename = basename(imagePath);
    content += `**Image:** ${imageFilename}\n\n`;
  }
  content += `**Time:** ${now}\n\n`;
  content += `---\n\n`;

  for (const model of modelNames) {
    content += `# ${model}\n\n---\n\n`;
    content += `_Waiting for response..._\n\n`;
  }

  writeFileSync(filePath, content);
}

// Update a single model section in the live file
function updateLiveFile(filePath: string, modelName: string, result: ModelResult): void {
  let content = readFileSync(filePath, 'utf-8');

  // Match H1 heading with horizontal line below
  const pattern = new RegExp(`# ${modelName}\\n\\n---\\n\\n[\\s\\S]*?(?=\\n# [^#]|$)`, 'g');

  let replacement = `# ${modelName}\n\n---\n\n`;
  if (result.status === 'success') {
    // Normalise any H1 headings in the response to H2
    const normalisedResponse = normaliseHeadings(result.response || '');
    replacement += normalisedResponse;
    replacement += `\n\n_Latency: ${((result.latencyMs || 0) / 1000).toFixed(1)}s`;
    if (result.tokensUsed) {
      replacement += ` | Tokens: ${result.tokensUsed}`;
    }
    replacement += `_\n\n`;
  } else {
    replacement += `**Error:** ${result.error}\n\n`;
  }

  content = content.replace(pattern, replacement);
  writeFileSync(filePath, content);
}

// Query multiple models in parallel with live file updates
async function queryModels(
  modelNames: string[],
  prompt: string,
  config: Config,
  timeoutSeconds: number,
  liveFilePath?: string,
  imagePath?: string
): Promise<ModelResult[]> {
  const timeoutMs = timeoutSeconds * 1000;

  console.log(`\nQuerying ${modelNames.length} models in parallel...`);
  console.log(`Models: ${modelNames.join(', ')}`);
  if (imagePath) {
    console.log(`Image: ${imagePath}`);
    console.log(`Vision models: ${modelNames.filter(m => VISION_MODELS.includes(m)).join(', ') || 'none'}`);
  }
  console.log(`Timeout: ${timeoutSeconds}s\n`);

  // Create live file if specified
  if (liveFilePath) {
    createLiveFile(liveFilePath, prompt, modelNames, imagePath);
    console.log(`Live file: ${liveFilePath}\n`);
  }

  // Query all models and update live file as each completes
  const results: ModelResult[] = [];
  const promises = modelNames.map(async (model) => {
    const result = await queryModel(model, prompt, config, timeoutMs, imagePath);
    results.push(result);

    // Update live file immediately when this model completes
    if (liveFilePath) {
      updateLiveFile(liveFilePath, model, result);
    }

    return result;
  });

  await Promise.all(promises);

  // Sort results to match original model order
  const sortedResults = modelNames.map(
    name => results.find(r => r.model === name)!
  );

  return sortedResults;
}

// Save results to output directory
function saveResults(
  outputDir: string,
  prompt: string,
  results: ModelResult[]
): void {
  // Create directories
  mkdirSync(join(outputDir, 'individual'), { recursive: true });

  // Save raw JSON
  const responsesJson = {
    prompt,
    timestamp: new Date().toISOString(),
    results,
  };
  writeFileSync(
    join(outputDir, 'responses.json'),
    JSON.stringify(responsesJson, null, 2)
  );

  // Save individual markdown files
  for (const result of results) {
    const filename = `${result.model}.md`;
    let content = `# ${result.model}\n\n`;

    if (result.status === 'success') {
      content += result.response || '';
      content += `\n\n---\n_Latency: ${result.latencyMs}ms`;
      if (result.tokensUsed) {
        content += ` | Tokens: ${result.tokensUsed}`;
      }
      content += '_';
    } else {
      content += `**Error**: ${result.error}`;
    }

    writeFileSync(join(outputDir, 'individual', filename), content);
  }

  console.log(`\nResponses saved to: ${outputDir}`);
}

// Perform synthesis using Claude Opus with extended thinking
async function performSynthesis(
  prompt: string,
  results: ModelResult[],
  depth: 'brief' | 'executive' | 'full' = 'executive'
): Promise<string> {
  console.log('\n=== Running Synthesis with Claude Opus 4.5 ===\n');

  const synthesisPrompt = generateSynthesisPrompt(prompt, results, depth);

  try {
    const result = await generateText({
      model: anthropic('claude-opus-4-5-20251101'),
      prompt: synthesisPrompt,
      maxOutputTokens: 16000,
      providerOptions: {
        anthropic: {
          thinking: {
            type: 'enabled',
            budgetTokens: 10000,
          },
        },
      },
    });

    return result.text;
  } catch (error) {
    console.error('Synthesis failed:', error instanceof Error ? error.message : String(error));
    throw error;
  }
}

// Append synthesis to the live markdown file
function appendSynthesisToLiveFile(filePath: string, synthesis: string): void {
  let content = readFileSync(filePath, 'utf-8');

  // Insert synthesis section after the metadata section (after first ---)
  // Find the position after "---\n\n" that follows Time:
  const timeMatch = content.match(/\*\*Time:\*\* [^\n]+\n\n---\n\n/);
  if (timeMatch && timeMatch.index !== undefined) {
    const insertPos = timeMatch.index + timeMatch[0].length;
    const synthesisSection = `# Synthesis\n\n${synthesis}\n\n---\n\n`;
    content = content.slice(0, insertPos) + synthesisSection + content.slice(insertPos);
  } else {
    // Fallback: append at end
    content += `\n\n---\n\n# Synthesis\n\n${synthesis}\n`;
  }

  writeFileSync(filePath, content);
  console.log(`\nSynthesis added to: ${filePath}`);
}

// Print summary of results
function printSummary(results: ModelResult[]): void {
  console.log('\n=== Results Summary ===\n');

  const successful = results.filter((r) => r.status === 'success');
  const failed = results.filter((r) => r.status !== 'success');

  console.log(`✓ ${successful.length} successful`);
  if (failed.length > 0) {
    console.log(`✗ ${failed.length} failed`);
    for (const f of failed) {
      console.log(`  - ${f.model}: ${f.error}`);
    }
  }

  console.log('\nLatencies:');
  for (const r of results) {
    const status = r.status === 'success' ? '✓' : '✗';
    const latency = r.latencyMs ? `${(r.latencyMs / 1000).toFixed(1)}s` : 'N/A';
    console.log(`  ${status} ${r.model}: ${latency}`);
  }
}

// Main query command
async function runQuery(
  prompt: string,
  options: {
    preset?: string;
    models?: string;
    timeout?: number;
    output?: string;
    noSave?: boolean;
    liveFile?: string;
    image?: string;
    synthesise?: boolean;
    synthesisDepth?: string;
  }
): Promise<void> {
  const config = loadConfig();

  // Validate image if provided
  if (options.image && !existsSync(options.image)) {
    console.error(`Image file not found: ${options.image}`);
    process.exit(1);
  }

  // Determine which models to query
  let modelNames: string[];
  let timeoutSeconds: number;

  if (options.models) {
    // Explicit model list
    modelNames = options.models.split(',').map((m) => m.trim());
    timeoutSeconds = options.timeout || 180;
  } else {
    // Use preset
    const presetName = options.preset || config.defaults.preset;
    const preset = config.presets[presetName];

    if (!preset) {
      console.error(`Unknown preset: ${presetName}`);
      console.log('Available presets:', Object.keys(config.presets).join(', '));
      process.exit(1);
    }

    // Check for browser requirements
    if (presetRequiresBrowser(presetName, config)) {
      const { browserModels } = getPresetModels(presetName, config);
      console.warn(
        `\nWarning: This preset includes browser-based models: ${browserModels.join(', ')}`
      );
      console.warn(
        'These require Claude to be started with --chrome. Skipping browser models.\n'
      );
    }

    const { apiModels } = getPresetModels(presetName, config);
    modelNames = apiModels;
    timeoutSeconds = preset.timeout_seconds || options.timeout || 180;
  }

  if (modelNames.length === 0) {
    console.error('No API models to query. Browser models require --chrome flag.');
    process.exit(1);
  }

  // Run queries
  const results = await queryModels(modelNames, prompt, config, timeoutSeconds, options.liveFile, options.image);

  // Save results
  if (!options.noSave) {
    const outputDir = options.output || generateOutputDir(prompt);
    saveResults(outputDir, prompt, results);
  }

  // Print summary
  printSummary(results);

  // Run synthesis if requested
  if (options.synthesise && options.liveFile) {
    const successfulResults = results.filter(r => r.status === 'success');
    if (successfulResults.length > 0) {
      const depth = (options.synthesisDepth || 'executive') as 'brief' | 'executive' | 'full';
      try {
        const synthesis = await performSynthesis(prompt, results, depth);
        appendSynthesisToLiveFile(options.liveFile, synthesis);
      } catch (error) {
        console.error('Synthesis failed, skipping...');
      }
    } else {
      console.log('\nNo successful responses to synthesise.');
    }
  }
}

// CLI setup
program
  .name('ask-many-models')
  .description('Query multiple AI models in parallel and synthesise responses')
  .version('0.1.0');

program
  .command('query', { isDefault: true })
  .description('Send a prompt to multiple models')
  .argument('<prompt>', 'The prompt to send to models')
  .option('-p, --preset <name>', 'Use a preset configuration')
  .option('-m, --models <list>', 'Comma-separated list of models')
  .option('-t, --timeout <seconds>', 'Timeout per model in seconds', parseInt)
  .option('-o, --output <dir>', 'Output directory for responses')
  .option('-l, --live-file <path>', 'Markdown file to update live as responses arrive')
  .option('-i, --image <path>', 'Image file to include with the prompt (vision models only)')
  .option('--no-save', 'Do not save responses to disk')
  .option('-s, --synthesise', 'Run automatic synthesis after queries complete')
  .option('--synthesis-depth <level>', 'Synthesis depth: brief, executive, full', 'executive')
  .action(runQuery);

program
  .command('presets')
  .description('List available presets')
  .action(() => {
    const config = loadConfig();
    listPresets(config);
  });

program
  .command('models')
  .description('List available models')
  .action(() => {
    const config = loadConfig();
    listModels(config);
  });

program
  .command('synthesise')
  .alias('synthesize')
  .description('Generate synthesis prompt for existing responses')
  .argument('<output-dir>', 'Directory containing responses.json')
  .option(
    '-d, --depth <level>',
    'Synthesis depth: brief, executive, full',
    'executive'
  )
  .action((outputDir: string, options: { depth: string }) => {
    const responses = loadResponses(outputDir);
    if (!responses) {
      process.exit(1);
    }

    const depth = options.depth as 'brief' | 'executive' | 'full';
    const prompt = generateSynthesisPrompt(
      responses.prompt,
      responses.results,
      depth
    );

    console.log('\n=== Synthesis Prompt ===\n');
    console.log(prompt);
    console.log('\n=== End Synthesis Prompt ===\n');
    console.log(
      'Copy the above prompt and send it to Claude to generate the synthesis.'
    );
    console.log(
      `Then save the result to: ${join(outputDir, 'synthesis.md')}`
    );
  });

program
  .command('show')
  .description('Display responses from a previous query')
  .argument('<output-dir>', 'Directory containing responses.json')
  .action((outputDir: string) => {
    const responses = loadResponses(outputDir);
    if (!responses) {
      process.exit(1);
    }

    console.log(`\n# Query: ${responses.prompt}\n`);
    console.log(`_Timestamp: ${responses.timestamp}_\n`);
    console.log(formatResultsForDisplay(responses.results));
  });

program
  .command('list')
  .description('List recent query outputs')
  .option('-n, --count <number>', 'Number of recent queries to show', '10')
  .action((options: { count: string }) => {
    const responsesDir = join(SKILL_DIR, 'multi-model-responses');
    if (!existsSync(responsesDir)) {
      console.log('No queries found yet.');
      return;
    }

    const { readdirSync, statSync } = require('fs');
    const dirs = readdirSync(responsesDir)
      .filter((d: string) => statSync(join(responsesDir, d)).isDirectory())
      .sort()
      .reverse()
      .slice(0, parseInt(options.count));

    if (dirs.length === 0) {
      console.log('No queries found yet.');
      return;
    }

    console.log('\nRecent queries:\n');
    for (const dir of dirs) {
      const responsesPath = join(responsesDir, dir, 'responses.json');
      if (existsSync(responsesPath)) {
        const data = JSON.parse(readFileSync(responsesPath, 'utf-8'));
        const promptPreview = data.prompt.slice(0, 60) + (data.prompt.length > 60 ? '...' : '');
        console.log(`  ${dir}`);
        console.log(`    "${promptPreview}"`);
        console.log('');
      }
    }
  });

program.parse();
