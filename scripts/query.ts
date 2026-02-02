#!/usr/bin/env npx tsx
/**
 * Main CLI for querying multiple AI models
 *
 * Usage:
 *   yarn query "What are the pros and cons of Rust vs Go?"
 *   yarn query --preset quick "Explain quantum computing"
 *   yarn query --models gpt-4o,gemini-2.0-flash "Your question"
 */

import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ override: true });
import { program } from 'commander';
import { generateText, type Tool } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import { google } from '@ai-sdk/google';
import { xai } from '@ai-sdk/xai';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname, basename, extname } from 'path';
import { fileURLToPath } from 'url';
import { EventEmitter } from 'events';
import { marked } from 'marked';
import {
  createModel,
  getPresetModels,
  presetRequiresBrowser,
  listPresets,
  listModels,
  isDeepResearchModel,
  getDeepResearchModels,
  getQuickModels,
  type Config,
} from './models.js';
import { readContext } from './context.js';
import {
  queryDeepResearch,
  formatDeepResearchResponse,
  type DeepResearchProgress,
  type DeepResearchResult,
} from './deep-research-query.js';
import { notifyDeepResearchComplete } from './notify.js';
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

// Progress tracking for models
type ModelStatus = 'pending' | 'querying' | 'success' | 'error' | 'timeout';

interface ModelProgress {
  name: string;
  displayName: string;
  status: ModelStatus;
  isSlow: boolean;
  startTime?: number;
  endTime?: number;
  error?: string;
}

class ProgressTracker extends EventEmitter {
  private models: Map<string, ModelProgress> = new Map();
  private startTime: number;
  private renderInterval?: ReturnType<typeof setInterval>;

  constructor(modelNames: string[], config: Config) {
    super();
    this.startTime = Date.now();

    for (const name of modelNames) {
      const modelConfig = config.models[name];
      this.models.set(name, {
        name,
        displayName: modelConfig?.display_name || name,
        status: 'pending',
        isSlow: modelConfig?.slow || false,
      });
    }
  }

  start(): void {
    this.renderInterval = setInterval(() => this.render(), 500);
    this.render();
  }

  stop(): void {
    if (this.renderInterval) {
      clearInterval(this.renderInterval);
      this.renderInterval = undefined;
    }
    // Clear the progress display and print final state
    process.stdout.write('\x1b[2K\r'); // Clear current line
  }

  setStatus(modelName: string, status: ModelStatus, error?: string): void {
    const model = this.models.get(modelName);
    if (model) {
      if (status === 'querying' && !model.startTime) {
        model.startTime = Date.now();
      }
      if (status === 'success' || status === 'error' || status === 'timeout') {
        model.endTime = Date.now();
      }
      model.status = status;
      model.error = error;
      this.emit('statusChange', modelName, status);
    }
  }

  getElapsedTime(): string {
    const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  }

  private getStatusIcon(status: ModelStatus): string {
    switch (status) {
      case 'pending': return '○';
      case 'querying': return '◐';
      case 'success': return '✓';
      case 'error': return '✗';
      case 'timeout': return '⏱';
    }
  }

  private getStatusColor(status: ModelStatus): string {
    switch (status) {
      case 'pending': return '\x1b[90m';   // gray
      case 'querying': return '\x1b[33m';  // yellow
      case 'success': return '\x1b[32m';   // green
      case 'error': return '\x1b[31m';     // red
      case 'timeout': return '\x1b[31m';   // red
    }
  }

  render(): void {
    const reset = '\x1b[0m';
    const dim = '\x1b[2m';

    // Build status line
    const parts: string[] = [];
    const fastModels = [...this.models.values()].filter(m => !m.isSlow);
    const slowModels = [...this.models.values()].filter(m => m.isSlow);

    for (const model of fastModels) {
      const icon = this.getStatusIcon(model.status);
      const color = this.getStatusColor(model.status);
      parts.push(`${color}${icon}${reset} ${model.displayName}`);
    }

    if (slowModels.length > 0) {
      parts.push(`${dim}|${reset}`);
      for (const model of slowModels) {
        const icon = this.getStatusIcon(model.status);
        const color = this.getStatusColor(model.status);
        const slowLabel = model.status === 'querying' ? ' (slow)' : '';
        parts.push(`${color}${icon}${reset} ${model.displayName}${dim}${slowLabel}${reset}`);
      }
    }

    const elapsed = `${dim}[${this.getElapsedTime()}]${reset}`;
    const line = `${parts.join('  ')}  ${elapsed}`;

    // Move to start of line and clear, then print
    process.stdout.write(`\x1b[2K\r${line}`);
  }

  getCompletedCount(): { fast: number; slow: number; total: number } {
    let fast = 0, slow = 0;
    for (const model of this.models.values()) {
      if (model.status === 'success' || model.status === 'error' || model.status === 'timeout') {
        if (model.isSlow) slow++;
        else fast++;
      }
    }
    return { fast, slow, total: fast + slow };
  }

  getFastModelCount(): number {
    return [...this.models.values()].filter(m => !m.isSlow).length;
  }

  getSlowModelCount(): number {
    return [...this.models.values()].filter(m => m.isSlow).length;
  }

  allFastComplete(): boolean {
    return [...this.models.values()]
      .filter(m => !m.isSlow)
      .every(m => m.status === 'success' || m.status === 'error' || m.status === 'timeout');
  }

  allComplete(): boolean {
    return [...this.models.values()]
      .every(m => m.status === 'success' || m.status === 'error' || m.status === 'timeout');
  }
}

// Models known to support vision
const VISION_MODELS = [
  'gpt-5.2-thinking',
  'gpt-5.2',
  'gpt-5.2-pro',
  'claude-4.5-opus-thinking',
  'claude-4.5-opus',
  'claude-4.5-sonnet',
  'gemini-3-pro',
  'gemini-3-flash',
];

// Get web search tools for a provider (returns undefined if not supported or disabled)
function getWebSearchTools(
  modelConfig: import('./models.js').ModelConfig
): Record<string, Tool> | undefined {
  if (modelConfig.web_search === false) return undefined;

  switch (modelConfig.provider) {
    case 'openai':
      return { web_search: openai.tools.webSearchPreview({}) as Tool };
    case 'google':
      return {
        google_search: google.tools.googleSearch({}) as Tool,
        url_context: google.tools.urlContext({}) as Tool,
      };
    case 'xai':
      return {
        web_search: xai.tools.webSearch({}) as Tool,
        x_search: xai.tools.xSearch({}) as Tool,
      };
    case 'anthropic': {
      const anthropicProvider = createAnthropic({ baseURL: 'https://api.anthropic.com/v1' });
      return { web_search: anthropicProvider.tools.webSearch_20250305({}) as Tool };
    }
    default:
      return undefined;
  }
}

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

  // Get web search tools for this provider
  const tools = modelConfig ? getWebSearchTools(modelConfig) : undefined;

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
        tools,
        maxOutputTokens: maxTokens,
        abortSignal: controller.signal,
      });
    } else if (hasImage && !supportsVision) {
      // Model doesn't support vision - add note to prompt
      const modifiedPrompt = `[Note: An image was provided but ${modelName} doesn't support vision.]\n\n${prompt}`;
      result = await generateText({
        model,
        prompt: modifiedPrompt,
        tools,
        maxOutputTokens: maxTokens,
        abortSignal: controller.signal,
      });
    } else {
      // Text-only query
      result = await generateText({
        model,
        prompt,
        tools,
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

type OutputFormat = 'markdown' | 'html' | 'both';

function getHtmlPath(mdPath: string): string {
  return mdPath.replace(/\.md$/, '.html');
}

function generateHtmlFromMarkdown(mdContent: string): string {
  const body = marked.parse(mdContent, { async: false }) as string;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Multi-Model Query</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --serif: 'Palatino Linotype', Palatino, 'Book Antiqua', 'Georgia', serif;
    --mono: 'SF Mono', 'Fira Code', 'Fira Mono', Menlo, Consolas, monospace;
    --bg: #fcfbf9;
    --bg-sidebar: #f5f3ef;
    --text: #2a2520;
    --text-muted: #6b6560;
    --border: #ddd8d0;
    --accent: #8b4513;
    --link: #6b3a1f;
    --sidebar-w: 220px;
    --content-max: 700px;
  }

  body {
    font-family: var(--serif);
    font-size: 17px;
    line-height: 1.75;
    color: var(--text);
    background: var(--bg);
    -webkit-font-smoothing: antialiased;
  }

  .layout {
    display: flex;
    max-width: calc(var(--sidebar-w) + var(--content-max) + 5rem);
    margin: 0 auto;
    min-height: 100vh;
  }

  nav.toc {
    position: sticky;
    top: 0;
    align-self: flex-start;
    width: var(--sidebar-w);
    flex-shrink: 0;
    height: 100vh;
    overflow-y: auto;
    padding: 2.5rem 1.25rem 2rem 0;
  }

  nav.toc .toc-title {
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--text-muted);
    margin-bottom: 1rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--border);
  }

  nav.toc ul { list-style: none; padding: 0; margin: 0; }
  nav.toc li { margin-bottom: 0.15rem; }

  nav.toc a {
    display: block;
    padding: 0.3rem 0.6rem;
    font-size: 0.8rem;
    line-height: 1.4;
    color: var(--text-muted);
    text-decoration: none;
    border-radius: 4px;
    transition: color 0.15s, background 0.15s;
  }

  nav.toc a:hover { color: var(--text); background: rgba(0,0,0,0.04); }
  nav.toc a.active { color: var(--accent); background: rgba(139,69,19,0.06); font-weight: 600; }

  .content {
    flex: 1;
    max-width: var(--content-max);
    padding: 2.5rem 0 4rem 2.5rem;
    border-left: 1px solid var(--border);
  }

  h1 {
    font-family: var(--serif);
    font-size: 1.1rem;
    font-weight: 700;
    font-variant: small-caps;
    letter-spacing: 0.08em;
    text-transform: lowercase;
    margin: 3.5rem 0 0.5rem;
    padding-bottom: 0;
    border-bottom: none;
    color: var(--accent);
  }

  h1:first-child { margin-top: 0; }

  h1 + hr { display: none; }

  h2 {
    font-family: var(--serif);
    font-size: 1.15rem;
    font-weight: 400;
    font-style: italic;
    margin: 1.75rem 0 0.5rem;
    color: var(--text);
  }

  h3 {
    font-family: var(--serif);
    font-size: 1rem;
    font-weight: 700;
    margin: 1.5rem 0 0.4rem;
    color: var(--text);
  }

  h4 {
    font-family: var(--serif);
    font-size: 0.95rem;
    font-weight: 700;
    margin: 1.25rem 0 0.35rem;
    color: var(--text-muted);
  }

  p { margin: 0 0 1rem; }
  strong { font-weight: 700; }
  em { color: var(--text-muted); }

  a { color: var(--link); text-decoration: underline; text-decoration-color: rgba(107,58,31,0.3); text-underline-offset: 2px; }
  a:hover { text-decoration-color: var(--link); }

  hr { border: none; border-top: 1px solid var(--border); margin: 2rem 0; }

  ul, ol { margin: 0 0 1rem; padding-left: 1.4rem; }
  li { margin-bottom: 0.3rem; }
  li > ul, li > ol { margin-top: 0.3rem; margin-bottom: 0; }

  blockquote { border-left: 2px solid var(--accent); padding: 0.4rem 0 0.4rem 1.25rem; margin: 0 0 1rem; color: var(--text-muted); font-style: italic; }

  pre { background: #f0ede8; border: 1px solid var(--border); border-radius: 4px; padding: 1rem 1.25rem; overflow-x: auto; margin: 0 0 1rem; font-size: 0.82rem; line-height: 1.55; }
  code { font-family: var(--mono); font-size: 0.85em; }
  :not(pre) > code { background: #eeebe5; padding: 0.12em 0.35em; border-radius: 3px; }

  table { width: 100%; border-collapse: collapse; margin: 0 0 1rem; font-size: 0.92rem; }
  th, td { padding: 0.5rem 0.75rem; text-align: left; border-bottom: 1px solid var(--border); }
  th { font-weight: 700; font-size: 0.78rem; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-muted); }

  @media (max-width: 860px) {
    nav.toc { display: none; }
    .toc-toggle { display: block; position: fixed; top: 0.6rem; right: 0.75rem; z-index: 20; background: var(--bg-sidebar); border: 1px solid var(--border); border-radius: 4px; padding: 0.3rem 0.6rem; font-family: var(--serif); font-size: 0.75rem; color: var(--text-muted); cursor: pointer; }
    .content { padding: 2rem 1.25rem 3rem; border-left: none; }
  }
  @media (min-width: 861px) { .toc-toggle { display: none; } }

  h1[id] { scroll-margin-top: 1rem; }
  @media (max-width: 860px) { h1[id] { scroll-margin-top: 3.5rem; } }
</style>
</head>
<body>
<button class="toc-toggle" onclick="document.querySelector('.toc').classList.toggle('open')">Contents</button>
<div class="layout">
  <nav class="toc">
    <div class="toc-title">Contents</div>
    <ul id="toc-list"></ul>
  </nav>
  <div class="content">
    ${body}
  </div>
</div>
<script>
(function() {
  var content = document.querySelector('.content');
  var tocList = document.getElementById('toc-list');
  var headings = content.querySelectorAll('h1');
  headings.forEach(function(h, i) {
    var id = 'section-' + i;
    h.id = id;
    var li = document.createElement('li');
    var a = document.createElement('a');
    a.href = '#' + id;
    a.textContent = h.textContent;
    a.dataset.target = id;
    li.appendChild(a);
    tocList.appendChild(li);
  });
  var tocLinks = tocList.querySelectorAll('a');
  if (!tocLinks.length) return;
  var observer = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
      if (entry.isIntersecting) {
        tocLinks.forEach(function(a) { a.classList.remove('active'); });
        var match = tocList.querySelector('a[data-target="' + entry.target.id + '"]');
        if (match) match.classList.add('active');
      }
    });
  }, { rootMargin: '-10% 0px -80% 0px' });
  headings.forEach(function(h) { observer.observe(h); });
  tocLinks.forEach(function(a) {
    a.addEventListener('click', function() {
      document.querySelector('.toc').classList.remove('open');
    });
  });
})();
</script>
</body>
</html>`;
}

function syncHtmlFile(mdPath: string, outputFormat: OutputFormat): void {
  if (outputFormat === 'markdown') return;
  try {
    const mdContent = readFileSync(mdPath, 'utf-8');
    const html = generateHtmlFromMarkdown(mdContent);
    writeFileSync(getHtmlPath(mdPath), html);
  } catch {
    // Silently skip if markdown file doesn't exist yet
  }
}

// Create initial live markdown file with model headings
// Count words in a string
function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(w => w.length > 0).length;
}

// Truncate text to approximately N words
function truncateToWords(text: string, maxWords: number): string {
  const words = text.trim().split(/\s+/).filter(w => w.length > 0);
  if (words.length <= maxWords) return text;
  return words.slice(0, maxWords).join(' ') + '...';
}

function createLiveFile(
  filePath: string,
  prompt: string,
  modelNames: string[],
  imagePath?: string,
  contextPaths?: string[]
): void {
  const now = new Date().toLocaleString('en-GB', { timeZone: 'Europe/Paris' });
  const outputDir = dirname(filePath);
  let content = `# Multi-Model Query\n\n`;

  // Handle prompt - truncate and link if >500 words
  const wordCount = countWords(prompt);
  if (wordCount > 500) {
    // Save full prompt to prompt.md
    const promptFilePath = join(outputDir, 'prompt.md');
    writeFileSync(promptFilePath, prompt);

    const truncated = truncateToWords(prompt, 50);
    content += `**Prompt:** ${truncated}\n[Full prompt](./prompt.md)\n\n`;
  } else {
    content += `**Prompt:** ${prompt}\n\n`;
  }

  // Handle context - always link to absolute paths
  if (contextPaths && contextPaths.length > 0) {
    content += `**Context:**\n`;
    for (const ctxPath of contextPaths) {
      const fileName = basename(ctxPath);
      content += `- [${fileName}](${ctxPath})\n`;
    }
    content += `\n`;
  }

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

// Query multiple models in parallel with live file updates and progress tracking
interface QueryModelsOptions {
  modelNames: string[];
  prompt: string;
  config: Config;
  defaultTimeoutSeconds: number;
  liveFilePath?: string;
  imagePath?: string;
  contextPaths?: string[];
  outputFormat?: OutputFormat;
  onFastModelsComplete?: (results: ModelResult[]) => Promise<void>;
  onAllModelsComplete?: (results: ModelResult[]) => Promise<void>;
}

async function queryModelsWithProgress(options: QueryModelsOptions): Promise<ModelResult[]> {
  const {
    modelNames,
    prompt,
    config,
    defaultTimeoutSeconds,
    liveFilePath,
    imagePath,
    contextPaths,
    outputFormat = 'markdown',
    onFastModelsComplete,
    onAllModelsComplete,
  } = options;

  const results: Map<string, ModelResult> = new Map();
  const tracker = new ProgressTracker(modelNames, config);

  // Print header info
  console.log(`\n\x1b[36m📡 Querying ${modelNames.length} models...\x1b[0m`);
  if (imagePath) {
    console.log(`Image: ${imagePath}`);
    console.log(`Vision models: ${modelNames.filter(m => VISION_MODELS.includes(m)).join(', ') || 'none'}`);
  }
  if (liveFilePath) {
    console.log(`Live file: ${liveFilePath}`);
  }
  console.log('');

  // Create live file if specified
  if (liveFilePath) {
    createLiveFile(liveFilePath, prompt, modelNames, imagePath, contextPaths);
  }

  // Start progress display
  tracker.start();

  let fastModelsCallbackFired = false;

  // Create individual promises for each model
  const modelPromises = modelNames.map(async (modelName) => {
    const modelConfig = config.models[modelName];
    const isSlow = modelConfig?.slow || false;
    const timeoutSeconds = modelConfig?.timeout_seconds || defaultTimeoutSeconds;
    const timeoutMs = timeoutSeconds * 1000;

    tracker.setStatus(modelName, 'querying');

    const result = await queryModel(modelName, prompt, config, timeoutMs, imagePath);
    results.set(modelName, result);

    // Update status
    tracker.setStatus(modelName, result.status, result.error);

    // Update live file immediately
    if (liveFilePath) {
      updateLiveFile(liveFilePath, modelName, result);
      syncHtmlFile(liveFilePath, outputFormat);
    }

    // Check if all fast models are complete
    if (!fastModelsCallbackFired && tracker.allFastComplete() && onFastModelsComplete) {
      fastModelsCallbackFired = true;
      tracker.stop();
      console.log('\n');

      const fastResults = modelNames
        .filter(name => !config.models[name]?.slow)
        .map(name => results.get(name)!)
        .filter(Boolean);

      await onFastModelsComplete(fastResults);

      // Resume progress if there are still slow models running
      if (!tracker.allComplete()) {
        console.log('\nWaiting for slow models...\n');
        tracker.start();
      }
    }

    return result;
  });

  // Wait for all models to complete
  await Promise.all(modelPromises);

  tracker.stop();
  console.log('\n');

  // Sort results to match original model order
  const sortedResults = modelNames.map(name => results.get(name)!);

  // Call completion callback if there were slow models
  if (tracker.getSlowModelCount() > 0 && onAllModelsComplete) {
    await onAllModelsComplete(sortedResults);
  }

  return sortedResults;
}

// Legacy function for backward compatibility
async function queryModels(
  modelNames: string[],
  prompt: string,
  config: Config,
  timeoutSeconds: number,
  liveFilePath?: string,
  imagePath?: string
): Promise<ModelResult[]> {
  return queryModelsWithProgress({
    modelNames,
    prompt,
    config,
    defaultTimeoutSeconds: timeoutSeconds,
    liveFilePath,
    imagePath,
  });
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

// Perform synthesis using either Gemini Flash (fast) or Claude Opus (thorough)
async function performSynthesis(
  prompt: string,
  results: ModelResult[],
  depth: 'brief' | 'executive' | 'full' = 'executive',
  useFastModel: boolean = false
): Promise<string> {
  const synthesisPrompt = generateSynthesisPrompt(prompt, results, depth);

  if (useFastModel) {
    console.log('\n\x1b[35m✨ Running Synthesis with Gemini 3 Flash\x1b[0m\n');

    try {
      const result = await generateText({
        model: google('gemini-3-flash-preview'),
        prompt: synthesisPrompt,
        maxOutputTokens: 8000,
      });

      return result.text;
    } catch (error) {
      console.error('Synthesis failed:', error instanceof Error ? error.message : String(error));
      throw error;
    }
  } else {
    console.log('\n\x1b[35m✨ Running Synthesis with Claude Opus 4.5\x1b[0m\n');

    try {
      const result = await generateText({
        model: createAnthropic({ baseURL: 'https://api.anthropic.com/v1' })('claude-opus-4-5-20251101'),
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
}

// Update deep research progress in the live file
function updateDeepResearchProgress(filePath: string, progress: DeepResearchProgress): void {
  if (!existsSync(filePath)) return;

  let content = readFileSync(filePath, 'utf-8');
  const modelName = progress.modelName;

  // Format elapsed time
  const elapsedSec = Math.floor(progress.elapsedMs / 1000);
  const mins = Math.floor(elapsedSec / 60);
  const secs = elapsedSec % 60;
  const elapsedStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

  const statusIcon = progress.status === 'completed' ? '✓' :
                     progress.status === 'failed' ? '✗' : '◐';

  // Match the model section and update its status
  const pattern = new RegExp(`# ${modelName}\\n\\n---\\n\\n[\\s\\S]*?(?=\\n# [^#]|$)`, 'g');

  const replacement = `# ${modelName}\n\n---\n\n_${statusIcon} Status: ${progress.status} (elapsed: ${elapsedStr})_\n\n`;

  content = content.replace(pattern, replacement);
  writeFileSync(filePath, content);
}

// Update live file with completed deep research result
function updateLiveFileWithDeepResearch(filePath: string, modelName: string, result: DeepResearchResult): void {
  if (!existsSync(filePath)) return;

  let content = readFileSync(filePath, 'utf-8');

  const pattern = new RegExp(`# ${modelName}\\n\\n---\\n\\n[\\s\\S]*?(?=\\n# [^#]|$)`, 'g');

  let replacement = `# ${modelName}\n\n---\n\n`;
  if (result.status === 'success') {
    const formattedResponse = formatDeepResearchResponse(result);
    // Normalise any H1 headings in the response to H2
    const normalisedResponse = normaliseHeadings(formattedResponse);
    replacement += normalisedResponse;
    replacement += `\n\n_Latency: ${((result.latencyMs || 0) / 1000 / 60).toFixed(1)} min`;
    if (result.requestId) {
      replacement += ` | Request ID: ${result.requestId.slice(0, 8)}...`;
    }
    replacement += `_\n\n`;
  } else {
    replacement += `**Error:** ${result.error}\n\n`;
  }

  content = content.replace(pattern, replacement);
  writeFileSync(filePath, content);
}

// Update or insert synthesis in the live markdown file
function updateSynthesisInLiveFile(filePath: string, synthesis: string, isPreliminary: boolean = false, customLabel?: string): void {
  let content = readFileSync(filePath, 'utf-8');

  const header = isPreliminary
    ? `# Synthesis (${customLabel || 'preliminary—waiting for slow models...'})`
    : '# Synthesis';

  const synthesisSection = `${header}\n\n${synthesis}\n\n---\n\n`;

  // Check if synthesis section already exists
  const existingSynthesisMatch = content.match(/# Synthesis[^\n]*\n\n[\s\S]*?\n\n---\n\n/);

  if (existingSynthesisMatch && existingSynthesisMatch.index !== undefined) {
    // Replace existing synthesis
    content = content.slice(0, existingSynthesisMatch.index) +
      synthesisSection +
      content.slice(existingSynthesisMatch.index + existingSynthesisMatch[0].length);
  } else {
    // Insert after metadata section
    const timeMatch = content.match(/\*\*Time:\*\* [^\n]+\n\n---\n\n/);
    if (timeMatch && timeMatch.index !== undefined) {
      const insertPos = timeMatch.index + timeMatch[0].length;
      content = content.slice(0, insertPos) + synthesisSection + content.slice(insertPos);
    } else {
      // Fallback: append at end
      content += `\n\n---\n\n${synthesisSection}`;
    }
  }

  writeFileSync(filePath, content);
  console.log(`Synthesis ${existingSynthesisMatch ? 'updated' : 'added'}: ${filePath}`);
}

// Legacy function for backward compatibility
function appendSynthesisToLiveFile(filePath: string, synthesis: string): void {
  updateSynthesisInLiveFile(filePath, synthesis, false);
}

// Print summary of results
function printSummary(results: ModelResult[]): void {
  console.log('\n\x1b[1m📊 Results Summary\x1b[0m\n');

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
  console.log('');
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
    context?: string;
    outputFormat?: string;
  }
): Promise<void> {
  const config = loadConfig();
  const outputFormat = (options.outputFormat || 'markdown') as OutputFormat;

  // Validate image if provided
  if (options.image && !existsSync(options.image)) {
    console.error(`Image file not found: ${options.image}`);
    process.exit(1);
  }

  // Load context if provided
  let contextContent = '';
  if (options.context) {
    contextContent = readContext(options.context);
    if (contextContent) {
      console.log(`Loaded context from: ${options.context}`);
    }
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

  // Split models into tiers: quick/standard/slow vs deep research
  const quickModels = getQuickModels(modelNames, config);
  const deepResearchModels = getDeepResearchModels(modelNames, config);
  const hasSlowModels = quickModels.some(name => config.models[name]?.slow);
  const hasDeepResearch = deepResearchModels.length > 0;
  const depth = (options.synthesisDepth || 'executive') as 'brief' | 'executive' | 'full';

  // Track all results for final save
  let allResults: ModelResult[] = [];
  let deepResearchResults: Map<string, DeepResearchResult> = new Map();

  // Prepend context to prompt if provided
  const fullPrompt = contextContent
    ? `${contextContent}\n## Question\n\n${prompt}`
    : prompt;

  // Create live file early if we have deep research models (to show progress)
  const contextPaths = options.context ? [options.context] : undefined;
  if (options.liveFile && hasDeepResearch) {
    const allModelsToShow = [...quickModels, ...deepResearchModels];
    createLiveFile(options.liveFile, prompt, allModelsToShow, options.image, contextPaths);
  }

  // Start deep research queries in background (they run for 20-40 min)
  const deepResearchPromises: Promise<void>[] = [];

  // Track deep research progress for console output
  const deepResearchStatus = new Map<string, { status: string; startTime: Date; lastUpdate: Date }>();

  if (hasDeepResearch) {
    console.log(`\n\x1b[1m\x1b[33m🔬 Starting ${deepResearchModels.length} deep research model(s) in background...\x1b[0m`);

    for (const modelName of deepResearchModels) {
      const modelConfig = config.models[modelName];
      deepResearchStatus.set(modelName, { status: 'starting', startTime: new Date(), lastUpdate: new Date() });

      const promise = (async () => {
        const result = await queryDeepResearch({
          prompt: fullPrompt,
          context: contextContent,
          modelConfig,
          modelName,
          onProgress: (progress) => {
            // Update live file with progress
            if (options.liveFile) {
              updateDeepResearchProgress(options.liveFile, progress);
            }
            // Track progress for console output (keep startTime, only update status and lastUpdate)
            const existing = deepResearchStatus.get(modelName);
            if (existing) {
              deepResearchStatus.set(modelName, {
                status: progress.status,
                startTime: existing.startTime,
                lastUpdate: new Date(),
              });
            }
          },
        });

        deepResearchResults.set(modelName, result);

        // Update live file with final result
        if (options.liveFile) {
          updateLiveFileWithDeepResearch(options.liveFile, modelName, result);
        }

        // Notify on completion
        if (options.liveFile) {
          notifyDeepResearchComplete(modelName, result.status, options.liveFile);
        }
      })();

      deepResearchPromises.push(promise);
    }
  }

  // Run quick/standard/slow model queries (if any)
  let quickResults: ModelResult[] = [];

  if (quickModels.length > 0) {
    quickResults = await queryModelsWithProgress({
      modelNames: quickModels,
      prompt: fullPrompt,
      config,
      defaultTimeoutSeconds: timeoutSeconds,
      liveFilePath: hasDeepResearch ? undefined : options.liveFile, // Only create if no deep research
      imagePath: options.image,
      outputFormat,
      contextPaths,

      // Callback when fast models complete
      onFastModelsComplete: hasSlowModels ? async (fastResults) => {
        if (!options.synthesise || !options.liveFile) return;

        const successfulResults = fastResults.filter(r => r.status === 'success');
        if (successfulResults.length === 0) {
          console.log('No successful fast model responses to synthesise.');
          return;
        }

        console.log(`\n=== Synthesising ${successfulResults.length} fast model responses ===\n`);
        try {
          const label = hasDeepResearch
            ? 'preliminary—waiting for deep research...'
            : 'preliminary—waiting for slow models...';
          const synthesis = await performSynthesis(prompt, fastResults, depth);
          updateSynthesisInLiveFile(options.liveFile, synthesis, true, label);
          syncHtmlFile(options.liveFile, outputFormat);
        } catch (error) {
          console.error('Preliminary synthesis failed:', error instanceof Error ? error.message : String(error));
        }
      } : undefined,

      // Callback when all quick models complete
      onAllModelsComplete: hasSlowModels ? async (allQuickResults) => {
        if (!options.synthesise || !options.liveFile) return;

        // If there's deep research, mark synthesis as preliminary
        if (hasDeepResearch) {
          const successfulResults = allQuickResults.filter(r => r.status === 'success');
          if (successfulResults.length > 0) {
            console.log(`\n=== Synthesising ${successfulResults.length} quick model responses (deep research in progress) ===\n`);
            try {
              const synthesis = await performSynthesis(prompt, allQuickResults, depth);
              updateSynthesisInLiveFile(options.liveFile, synthesis, true, 'preliminary—waiting for deep research...');
            } catch (error) {
              console.error('Synthesis failed:', error instanceof Error ? error.message : String(error));
            }
          }
        } else {
          // No deep research, this is the final synthesis
          const successfulResults = allQuickResults.filter(r => r.status === 'success');
          if (successfulResults.length > 0) {
            console.log(`\n=== Final synthesis with all ${successfulResults.length} responses ===\n`);
            try {
              const synthesis = await performSynthesis(prompt, allQuickResults, depth);
              updateSynthesisInLiveFile(options.liveFile, synthesis, false);
            } catch (error) {
              console.error('Final synthesis failed:', error instanceof Error ? error.message : String(error));
            }
          }
        }
      } : undefined,
    });

    // Update live file with quick results if we created it earlier for deep research
    if (hasDeepResearch && options.liveFile) {
      for (const result of quickResults) {
        updateLiveFile(options.liveFile, result.model, result);
      }
    }
  }

  // Run synthesis for quick models if no slow models and no callbacks fired
  if (options.synthesise && options.liveFile && quickModels.length > 0 && !hasSlowModels) {
    const successfulResults = quickResults.filter(r => r.status === 'success');
    if (successfulResults.length > 0) {
      try {
        const isPreliminary = hasDeepResearch;
        const label = hasDeepResearch ? 'preliminary—waiting for deep research...' : undefined;
        const synthesis = await performSynthesis(prompt, quickResults, depth, !hasDeepResearch);
        updateSynthesisInLiveFile(options.liveFile, synthesis, isPreliminary, label);
      } catch (error) {
        console.error('Synthesis failed, skipping...');
      }
    }
  }

  // Add quick results to allResults
  allResults.push(...quickResults);

  // Wait for deep research to complete (this can take 20-40 min)
  if (deepResearchPromises.length > 0) {
    console.log('\n\x1b[1m\x1b[33m⏳ Waiting for deep research to complete (this may take 20-40 minutes)...\x1b[0m');
    console.log('\x1b[2m   Quick model results are already available in the live file.\x1b[0m\n');

    // Progress display (updates every 1s for smooth timer, API polling happens every 10s internally)
    const isTTY = process.stdout.isTTY;
    let lastPrintedLines = 0;

    const printProgress = () => {
      const now = new Date();

      // Build status line for each model
      const statusLines: string[] = [];
      for (const [model, info] of deepResearchStatus) {
        // Calculate elapsed time from startTime (real-time)
        const elapsedSec = Math.floor((now.getTime() - info.startTime.getTime()) / 1000);
        const mins = Math.floor(elapsedSec / 60);
        const secs = elapsedSec % 60;
        const elapsedStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

        const statusIcon = info.status === 'completed' ? '✓' :
                          info.status === 'failed' ? '✗' : '◐';

        // Only show "checked Xs ago" for in-progress items
        let checkStr = '';
        if (info.status !== 'completed' && info.status !== 'failed') {
          const lastCheckAgo = Math.floor((now.getTime() - info.lastUpdate.getTime()) / 1000);
          if (lastCheckAgo >= 5) {
            checkStr = ` (status checked ${lastCheckAgo}s ago)`;
          }
        }

        statusLines.push(`  ${statusIcon} ${model}: ${info.status} (${elapsedStr})${checkStr}`);
      }

      if (isTTY && lastPrintedLines > 0) {
        // Clear previous lines and print new status
        process.stdout.write('\x1b[' + lastPrintedLines + 'A'); // Move cursor up
        process.stdout.write('\x1b[J'); // Clear from cursor to end
      }
      console.log(statusLines.join('\n'));
      lastPrintedLines = statusLines.length;
    };

    // Print initial status
    printProgress();

    // Update display every 1s for smooth elapsed time counter
    // (API polling happens every 10s internally, but display updates every second)
    const progressInterval = setInterval(printProgress, 1000);

    await Promise.all(deepResearchPromises);
    clearInterval(progressInterval);

    // Print final status
    printProgress();
    console.log('\n\x1b[1m\x1b[32m✅ Deep research complete!\x1b[0m\n');

    // Convert deep research results to ModelResult format and add to allResults
    for (const [modelName, result] of deepResearchResults) {
      const modelResult: ModelResult = {
        model: modelName,
        status: result.status,
        response: result.response ? formatDeepResearchResponse(result) : undefined,
        error: result.error,
        latencyMs: result.latencyMs,
      };
      allResults.push(modelResult);
    }

    // Final synthesis with all results including deep research
    if (options.synthesise && options.liveFile) {
      const successfulResults = allResults.filter(r => r.status === 'success');
      if (successfulResults.length > 0) {
        console.log(`\n=== Final synthesis including deep research (${successfulResults.length} responses) ===\n`);
        try {
          const synthesis = await performSynthesis(prompt, allResults, depth);
          updateSynthesisInLiveFile(options.liveFile, synthesis, false);
        } catch (error) {
          console.error('Final synthesis failed:', error instanceof Error ? error.message : String(error));
        }
      }
    }
  }

  // Save results
  if (!options.noSave) {
    const outputDir = options.output || generateOutputDir(prompt);
    saveResults(outputDir, prompt, allResults);
  }

  // Final HTML sync
  if (options.liveFile) {
    syncHtmlFile(options.liveFile, outputFormat);
  }

  // Print summary
  printSummary(allResults);
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
  .option('-c, --context <path>', 'Context file or folder to include with the prompt')
  .option('--no-save', 'Do not save responses to disk')
  .option('-s, --synthesise', 'Run automatic synthesis after queries complete')
  .option('--synthesis-depth <level>', 'Synthesis depth: brief, executive, full', 'executive')
  .option('--output-format <format>', 'Output format: markdown, html, both', 'markdown')
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
