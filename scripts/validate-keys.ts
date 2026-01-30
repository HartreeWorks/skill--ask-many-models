#!/usr/bin/env npx tsx
/**
 * Validate API keys by making simple test requests
 * Returns JSON with validation results for each provider
 */

import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ override: true });

interface ValidationResult {
  provider: string;
  valid: boolean;
  error?: string;
}

async function validateOpenAI(): Promise<ValidationResult> {
  const key = process.env.OPENAI_API_KEY;
  if (!key || key === 'sk-...' || key.length < 20) {
    return { provider: 'openai', valid: false, error: 'No valid key configured' };
  }

  try {
    const response = await fetch('https://api.openai.com/v1/models', {
      headers: { 'Authorization': `Bearer ${key}` }
    });

    if (response.ok) {
      return { provider: 'openai', valid: true };
    } else if (response.status === 401) {
      return { provider: 'openai', valid: false, error: 'Invalid API key' };
    } else {
      return { provider: 'openai', valid: false, error: `HTTP ${response.status}` };
    }
  } catch (e) {
    return { provider: 'openai', valid: false, error: String(e) };
  }
}

async function validateGoogle(): Promise<ValidationResult> {
  const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY;
  if (!key || key === '...' || key.length < 20) {
    return { provider: 'google', valid: false, error: 'No valid key configured' };
  }

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);

    if (response.ok) {
      return { provider: 'google', valid: true };
    } else if (response.status === 400 || response.status === 401 || response.status === 403) {
      return { provider: 'google', valid: false, error: 'Invalid API key' };
    } else {
      return { provider: 'google', valid: false, error: `HTTP ${response.status}` };
    }
  } catch (e) {
    return { provider: 'google', valid: false, error: String(e) };
  }
}

async function validateXAI(): Promise<ValidationResult> {
  const key = process.env.XAI_API_KEY;
  if (!key || key === '...' || key.length < 20) {
    return { provider: 'xai', valid: false, error: 'No valid key configured' };
  }

  try {
    const response = await fetch('https://api.x.ai/v1/models', {
      headers: { 'Authorization': `Bearer ${key}` }
    });

    if (response.ok) {
      return { provider: 'xai', valid: true };
    } else if (response.status === 401) {
      return { provider: 'xai', valid: false, error: 'Invalid API key' };
    } else {
      return { provider: 'xai', valid: false, error: `HTTP ${response.status}` };
    }
  } catch (e) {
    return { provider: 'xai', valid: false, error: String(e) };
  }
}

async function validateAnthropic(): Promise<ValidationResult> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || key === '...' || key.length < 20) {
    return { provider: 'anthropic', valid: false, error: 'No valid key configured' };
  }

  try {
    // Anthropic doesn't have a /models endpoint, so we make a minimal completion request
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'Hi' }]
      })
    });

    if (response.ok) {
      return { provider: 'anthropic', valid: true };
    } else if (response.status === 401) {
      return { provider: 'anthropic', valid: false, error: 'Invalid API key' };
    } else {
      // Could be rate limit or other issue, but key format is valid
      const body = await response.json().catch(() => ({}));
      if (body.error?.type === 'authentication_error') {
        return { provider: 'anthropic', valid: false, error: 'Invalid API key' };
      }
      // Assume valid if we got a non-auth error
      return { provider: 'anthropic', valid: true };
    }
  } catch (e) {
    return { provider: 'anthropic', valid: false, error: String(e) };
  }
}

async function main() {
  const provider = process.argv[2];

  let results: ValidationResult[];

  if (provider) {
    // Validate single provider
    switch (provider) {
      case 'openai':
        results = [await validateOpenAI()];
        break;
      case 'google':
        results = [await validateGoogle()];
        break;
      case 'xai':
        results = [await validateXAI()];
        break;
      case 'anthropic':
        results = [await validateAnthropic()];
        break;
      default:
        console.error(`Unknown provider: ${provider}`);
        process.exit(1);
    }
  } else {
    // Validate all providers in parallel
    results = await Promise.all([
      validateOpenAI(),
      validateGoogle(),
      validateXAI(),
      validateAnthropic()
    ]);
  }

  console.log(JSON.stringify(results, null, 2));

  // Exit with error if any validation failed
  const anyFailed = results.some(r => !r.valid);
  process.exit(anyFailed ? 1 : 0);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
