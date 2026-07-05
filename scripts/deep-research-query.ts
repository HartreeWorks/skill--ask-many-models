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
    const createRequest = () => client.responses.create({
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

    let response: Awaited<ReturnType<typeof createRequest>>;
    try {
      response = await createRequest();
    } catch (submitError) {
      const errorMsg = submitError instanceof Error ? submitError.message : String(submitError);
      if (/rate.?limit/i.test(errorMsg)) {
        // Parse wait duration from "try again in Xms" or "try again in Xs"
        const waitMatch = errorMsg.match(/try again in (\d+)(ms|s)/i);
        let waitMs = 5000; // default 5s
        if (waitMatch) {
          waitMs = parseInt(waitMatch[1], 10);
          if (waitMatch[2] === 's') waitMs *= 1000;
        }
        waitMs += 1000; // buffer
        console.log(`  ⏳ ${config.modelName}: Rate limited, retrying in ${(waitMs / 1000).toFixed(1)}s...`);
        await sleep(waitMs);
        response = await createRequest();
      } else {
        throw submitError;
      }
    }

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
  const apiKey = getEnvVar('GOOGLE_GENERATIVE_AI_API_KEY') || getEnvVar('GEMINI_API_KEY');

  if (!apiKey) {
    return {
      model: config.modelName,
      status: 'error',
      error: 'GOOGLE_GENERATIVE_AI_API_KEY not found. Set it in ~/.claude/skills/ask-many-models/.env',
      latencyMs: Date.now() - startTime,
    };
  }

  const client = new GoogleGenAI({ apiKey });

  // Combine context with prompt
  const fullPrompt = config.context
    ? `## Background Context\n\n${config.context}\n\n---\n\n## Research Question\n\n${config.prompt}`
    : config.prompt;

  try {
    // Start the deep research interaction.
    // NOTE: @google/genai v2 requires the new Interactions schema (v1.x sent a
    // legacy schema the server now rejects with a 400). collaborative_planning is
    // disabled so the agent runs autonomously in the background instead of pausing
    // in a "requires_action" state waiting for plan confirmation.
    const interaction = await client.interactions.create({
      agent: config.modelConfig.model_id,
      input: fullPrompt,
      background: true,
      agent_config: { type: 'deep-research', collaborative_planning: false },
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
        // v2 exposes the concatenated final text via `output_text` (the v1 `outputs`
        // array no longer exists). Fall back to scanning steps for a model-output block.
        const stepText = (result.steps || [])
          .filter((s: any) => s?.type === 'model_output' || 'text' in (s || {}))
          .map((s: any) => s.text)
          .filter(Boolean)
          .join('\n');
        const reportText = result.output_text || stepText || 'No output text available';

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

      // Terminal non-success states. Without this, states like "requires_action" or
      // "budget_exceeded" would spin the poll loop until the timeout fires.
      if (['failed', 'cancelled', 'incomplete', 'budget_exceeded', 'requires_action'].includes(result.status)) {
        return {
          model: config.modelName,
          status: 'error',
          error: `Research ${result.status}: ${(result as any).error || 'no further detail'}`,
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
