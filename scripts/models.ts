/**
 * Model definitions and Vercel AI SDK provider setup
 */

import { openai } from '@ai-sdk/openai';
import { google } from '@ai-sdk/google';
import { xai } from '@ai-sdk/xai';
import { anthropic } from '@ai-sdk/anthropic';
import type { LanguageModel } from 'ai';

export interface ModelConfig {
  provider: 'openai' | 'google' | 'xai' | 'anthropic' | 'openai-deep' | 'gemini-deep';
  display_name?: string;
  reasoning?: boolean;
  model_id: string;
  type: 'api' | 'browser';
  max_tokens?: number;
  requires_browser?: boolean;
  async?: boolean;
  url?: string;
  mode?: string;
  typical_duration_minutes?: number;
  slow?: boolean;
  timeout_seconds?: number;
  deep_research?: boolean;
  poll_interval_ms?: number;
}

export interface PresetConfig {
  description: string;
  models: string[];
  timeout_seconds?: number;
  async?: boolean;
  requires_browser?: boolean;
}

export interface Config {
  presets: Record<string, PresetConfig>;
  models: Record<string, ModelConfig>;
  defaults: {
    preset: string;
    synthesis_depth: string;
    max_tokens: number;
  };
  synthesis_depths: Record<string, string>;
}

/**
 * Create a Vercel AI SDK model instance from config
 */
export function createModel(modelName: string, config: Config): LanguageModel | null {
  const modelConfig = config.models[modelName];

  if (!modelConfig) {
    console.error(`Unknown model: ${modelName}`);
    return null;
  }

  if (modelConfig.type === 'browser') {
    // Browser-based models are handled separately by Claude
    return null;
  }

  switch (modelConfig.provider) {
    case 'openai':
      return openai(modelConfig.model_id);
    case 'google':
      return google(modelConfig.model_id);
    case 'xai':
      return xai(modelConfig.model_id);
    case 'anthropic':
      return anthropic(modelConfig.model_id);
    case 'openai-deep':
    case 'gemini-deep':
      // Deep research models are handled separately, not via Vercel AI SDK
      return null;
    default:
      console.error(`Unknown provider: ${modelConfig.provider}`);
      return null;
  }
}

/**
 * Get models for a preset, separating API and browser models
 */
export function getPresetModels(presetName: string, config: Config): {
  apiModels: string[];
  browserModels: string[];
} {
  const preset = config.presets[presetName];

  if (!preset) {
    throw new Error(`Unknown preset: ${presetName}`);
  }

  const apiModels: string[] = [];
  const browserModels: string[] = [];

  for (const modelName of preset.models) {
    const modelConfig = config.models[modelName];
    if (!modelConfig) {
      console.warn(`Unknown model in preset: ${modelName}`);
      continue;
    }

    if (modelConfig.type === 'browser' || modelConfig.requires_browser) {
      browserModels.push(modelName);
    } else {
      apiModels.push(modelName);
    }
  }

  return { apiModels, browserModels };
}

/**
 * Check if a preset requires browser capabilities
 */
export function presetRequiresBrowser(presetName: string, config: Config): boolean {
  const { browserModels } = getPresetModels(presetName, config);
  return browserModels.length > 0;
}

/**
 * List available presets
 */
export function listPresets(config: Config): void {
  console.log('\nAvailable presets:\n');
  for (const [name, preset] of Object.entries(config.presets)) {
    const { apiModels, browserModels } = getPresetModels(name, config);
    const browserNote = browserModels.length > 0 ? ' (requires --chrome)' : '';
    console.log(`  ${name}${browserNote}`);
    console.log(`    ${preset.description}`);
    console.log(`    Models: ${preset.models.join(', ')}`);
    console.log('');
  }
}

/**
 * Check if a model is a deep research model
 */
export function isDeepResearchModel(modelName: string, config: Config): boolean {
  const modelConfig = config.models[modelName];
  return modelConfig?.deep_research === true;
}

/**
 * Get deep research models from a list
 */
export function getDeepResearchModels(modelNames: string[], config: Config): string[] {
  return modelNames.filter(name => isDeepResearchModel(name, config));
}

/**
 * Get non-deep research models from a list
 */
export function getQuickModels(modelNames: string[], config: Config): string[] {
  return modelNames.filter(name => !isDeepResearchModel(name, config));
}

/**
 * List available models
 */
export function listModels(config: Config): void {
  console.log('\nAvailable models:\n');

  console.log('API models:');
  for (const [name, model] of Object.entries(config.models)) {
    if (model.type === 'api') {
      console.log(`  ${name} (${model.provider})`);
    }
  }

  console.log('\nBrowser models (require --chrome):');
  for (const [name, model] of Object.entries(config.models)) {
    if (model.type === 'browser') {
      const asyncNote = model.async ? ' [async]' : '';
      console.log(`  ${name} (${model.provider})${asyncNote}`);
    }
  }
}
