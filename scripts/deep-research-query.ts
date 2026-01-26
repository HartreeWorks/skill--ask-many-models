/**
 * Deep Research Query Module
 *
 * Handles queries to OpenAI and Gemini deep research APIs with progress callbacks.
 * These APIs use background mode for long-running tasks.
 */

import OpenAI from 'openai';
import { GoogleGenAI } from '@google/genai';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { ModelConfig } from './models.js';

const SKILL_ENV_PATH = join(homedir(), '.claude', 'skills', 'ask-many-models', '.env');
const DEEP_RESEARCH_ENV_PATH = join(homedir(), '.claude', 'skills', 'deep-research', '.env');

/**
 * Load an environment variable, checking multiple .env locations
 */
function getEnvVar(name: string): string | undefined {
  // First check process.env
  if (process.env[name]) {
    return process.env[name];
  }

  // Check ask-many-models .env
  if (existsSync(SKILL_ENV_PATH)) {
    const envContent = readFileSync(SKILL_ENV_PATH, 'utf-8');
    const match = envContent.match(new RegExp(`^${name}=(.+)$`, 'm'));
    if (match) {
      return match[1].trim();
    }
  }

  // Fall back to deep-research .env (for backward compatibility)
  if (existsSync(DEEP_RESEARCH_ENV_PATH)) {
    const envContent = readFileSync(DEEP_RESEARCH_ENV_PATH, 'utf-8');
    const match = envContent.match(new RegExp(`^${name}=(.+)$`, 'm'));
    if (match) {
      return match[1].trim();
    }
  }

  return undefined;
}

export interface DeepResearchProgress {
  modelName: string;
  status: 'queued' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
  elapsedMs: number;
  requestId?: string;
}

export interface DeepResearchResult {
  model: string;
  status: 'success' | 'error' | 'timeout';
  response?: string;
  error?: string;
  latencyMs: number;
  requestId?: string;
  citations?: Array<{ title: string; url: string }>;
}

export interface DeepResearchConfig {
  prompt: string;
  context?: string;
  modelConfig: ModelConfig;
  modelName: string;
  onProgress?: (progress: DeepResearchProgress) => void;
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Query OpenAI Deep Research (o3-deep-research)
 */
export async function queryOpenAIDeepResearch(config: DeepResearchConfig): Promise<DeepResearchResult> {
  const startTime = Date.now();
  const apiKey = getEnvVar('OPENAI_API_KEY');

  if (!apiKey) {
    return {
      model: config.modelName,
      status: 'error',
      error: 'OPENAI_API_KEY not found. Set it in ~/.claude/skills/ask-many-models/.env',
      latencyMs: Date.now() - startTime,
    };
  }

  const client = new OpenAI({ apiKey });

  // Build system prompt with context
  const systemPrompt = config.context
    ? `${config.context}\n\n---\n\nYou are conducting research to help with the above context.`
    : 'You are a research assistant conducting comprehensive literature review and synthesis.';

  try {
    // Start the research with background mode enabled
    let response = await client.responses.create({
      model: config.modelConfig.model_id,
      input: [
        {
          role: 'developer',
          content: [{ type: 'input_text', text: systemPrompt }],
        },
        {
          role: 'user',
          content: [{ type: 'input_text', text: config.prompt }],
        },
      ],
      reasoning: { summary: 'detailed' },
      tools: [{ type: 'web_search_preview' }],
      background: true,
    });

    const requestId = response.id;
    const pollInterval = config.modelConfig.poll_interval_ms || 10000;
    const maxWait = (config.modelConfig.timeout_seconds || 3600) * 1000;

    // Report initial status
    config.onProgress?.({
      modelName: config.modelName,
      status: response.status as DeepResearchProgress['status'],
      elapsedMs: Date.now() - startTime,
      requestId,
    });

    // Poll for completion
    while (response.status === 'queued' || response.status === 'in_progress') {
      if (Date.now() - startTime > maxWait) {
        return {
          model: config.modelName,
          status: 'timeout',
          error: `Timed out after ${maxWait / 1000} seconds`,
          latencyMs: Date.now() - startTime,
          requestId,
        };
      }

      await sleep(pollInterval);
      response = await client.responses.retrieve(requestId);

      config.onProgress?.({
        modelName: config.modelName,
        status: response.status as DeepResearchProgress['status'],
        elapsedMs: Date.now() - startTime,
        requestId,
      });
    }

    if (response.status === 'failed') {
      return {
        model: config.modelName,
        status: 'error',
        error: `Research failed: ${JSON.stringify(response)}`,
        latencyMs: Date.now() - startTime,
        requestId,
      };
    }

    if (response.status === 'cancelled') {
      return {
        model: config.modelName,
        status: 'error',
        error: 'Research was cancelled',
        latencyMs: Date.now() - startTime,
        requestId,
      };
    }

    // Extract the final report
    const output = response.output;
    const lastOutput = output[output.length - 1];

    let reportText = '';
    let citations: Array<{ title: string; url: string }> = [];

    // Try to get output_text directly if available
    if ((response as any).output_text) {
      reportText = (response as any).output_text;
    } else if (lastOutput && 'content' in lastOutput && Array.isArray(lastOutput.content)) {
      const textContent = lastOutput.content.find((c: unknown) =>
        c && typeof c === 'object' && 'type' in c && (c as { type: string }).type === 'output_text'
      ) as { text?: string; annotations?: Array<{ title: string; url: string; start_index: number; end_index: number }> } | undefined;

      if (textContent) {
        reportText = textContent.text || '';

        if (textContent.annotations) {
          citations = [...new Map(
            textContent.annotations.map(a => [a.url, { title: a.title, url: a.url }])
          ).values()];
        }
      }
    }

    if (!reportText) {
      reportText = 'No output text found in response.';
    }

    return {
      model: config.modelName,
      status: 'success',
      response: reportText,
      latencyMs: Date.now() - startTime,
      requestId,
      citations,
    };
  } catch (error) {
    return {
      model: config.modelName,
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
      latencyMs: Date.now() - startTime,
    };
  }
}

/**
 * Query Gemini Deep Research
 */
export async function queryGeminiDeepResearch(config: DeepResearchConfig): Promise<DeepResearchResult> {
  const startTime = Date.now();
  const apiKey = getEnvVar('GEMINI_API_KEY') || getEnvVar('GOOGLE_API_KEY');

  if (!apiKey) {
    return {
      model: config.modelName,
      status: 'error',
      error: 'GEMINI_API_KEY not found. Set it in ~/.claude/skills/ask-many-models/.env',
      latencyMs: Date.now() - startTime,
    };
  }

  const client = new GoogleGenAI({ apiKey });

  // Combine context with prompt
  const fullPrompt = config.context
    ? `## Background Context\n\n${config.context}\n\n---\n\n## Research Question\n\n${config.prompt}`
    : config.prompt;

  try {
    // Start the deep research interaction
    const interaction = await client.interactions.create({
      input: fullPrompt,
      agent: config.modelConfig.model_id,
      background: true,
    });

    const requestId = interaction.id;
    const pollInterval = config.modelConfig.poll_interval_ms || 10000;
    const maxWait = (config.modelConfig.timeout_seconds || 3600) * 1000;

    // Report initial status
    config.onProgress?.({
      modelName: config.modelName,
      status: 'in_progress',
      elapsedMs: Date.now() - startTime,
      requestId,
    });

    // Poll for completion
    while (true) {
      const result = await client.interactions.get(requestId);

      if (result.status === 'completed') {
        const outputs = result.outputs || [];
        const lastOutput = outputs[outputs.length - 1] as { text?: string } | undefined;
        const reportText = lastOutput?.text || 'No output text available';

        config.onProgress?.({
          modelName: config.modelName,
          status: 'completed',
          elapsedMs: Date.now() - startTime,
          requestId,
        });

        return {
          model: config.modelName,
          status: 'success',
          response: reportText,
          latencyMs: Date.now() - startTime,
          requestId,
        };
      }

      if (result.status === 'failed') {
        return {
          model: config.modelName,
          status: 'error',
          error: `Research failed: ${(result as any).error || 'Unknown error'}`,
          latencyMs: Date.now() - startTime,
          requestId,
        };
      }

      if (Date.now() - startTime > maxWait) {
        return {
          model: config.modelName,
          status: 'timeout',
          error: `Timed out after ${maxWait / 1000} seconds`,
          latencyMs: Date.now() - startTime,
          requestId,
        };
      }

      config.onProgress?.({
        modelName: config.modelName,
        status: result.status as DeepResearchProgress['status'],
        elapsedMs: Date.now() - startTime,
        requestId,
      });

      await sleep(pollInterval);
    }
  } catch (error) {
    return {
      model: config.modelName,
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
      latencyMs: Date.now() - startTime,
    };
  }
}

/**
 * Route to the appropriate deep research function based on provider
 */
export async function queryDeepResearch(config: DeepResearchConfig): Promise<DeepResearchResult> {
  switch (config.modelConfig.provider) {
    case 'openai-deep':
      return queryOpenAIDeepResearch(config);
    case 'gemini-deep':
      return queryGeminiDeepResearch(config);
    default:
      return {
        model: config.modelName,
        status: 'error',
        error: `Unknown deep research provider: ${config.modelConfig.provider}`,
        latencyMs: 0,
      };
  }
}

/**
 * Format deep research response for the live file
 */
export function formatDeepResearchResponse(result: DeepResearchResult): string {
  let content = result.response || '';

  // Add citations section if present
  if (result.citations && result.citations.length > 0) {
    content += '\n\n---\n\n### Sources\n\n';
    result.citations.forEach((c, i) => {
      content += `${i + 1}. [${c.title}](${c.url})\n`;
    });
  }

  return content;
}
