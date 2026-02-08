/**
 * Desktop notification wrapper using terminal-notifier (macOS)
 */

import { execSync } from 'child_process';

interface NotifyOptions {
  title: string;
  message: string;
  subtitle?: string;
  sound?: string;
  open?: string; // URL or file path to open on click
  group?: string; // Group ID for notification management
}

/**
 * Check if terminal-notifier is installed
 */
export function isTerminalNotifierInstalled(): boolean {
  try {
    execSync('which terminal-notifier', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Send a desktop notification using terminal-notifier
 */
export function notify(options: NotifyOptions): boolean {
  if (!isTerminalNotifierInstalled()) {
    console.warn(
      'terminal-notifier not installed. Install with: brew install terminal-notifier'
    );
    return false;
  }

  const args: string[] = [
    '-title',
    `"${escapeQuotes(options.title)}"`,
    '-message',
    `"${escapeQuotes(options.message)}"`,
  ];

  if (options.subtitle) {
    args.push('-subtitle', `"${escapeQuotes(options.subtitle)}"`);
  }

  if (options.sound) {
    args.push('-sound', options.sound);
  }

  if (options.open) {
    args.push('-open', `"${escapeQuotes(options.open)}"`);
  }

  if (options.group) {
    args.push('-group', options.group);
  }

  try {
    execSync(`terminal-notifier ${args.join(' ')}`, { stdio: 'ignore' });
    return true;
  } catch {
    // Notifications are non-critical - fail silently
    return false;
  }
}

/**
 * Escape double quotes for shell command
 */
function escapeQuotes(str: string): string {
  return str.replace(/"/g, '\\"');
}

/**
 * Send notification when multi-model query completes
 */
export function notifyQueryComplete(
  modelCount: number,
  successCount: number,
  outputDir: string
): void {
  const status =
    successCount === modelCount
      ? 'All models responded'
      : `${successCount}/${modelCount} models responded`;

  notify({
    title: 'Ask Many Models',
    message: status,
    subtitle: 'Query complete',
    sound: 'default',
    open: outputDir,
    group: 'ask-many-models',
  });
}

/**
 * Send notification when async request (deep research) completes
 */
export function notifyAsyncComplete(
  requestId: string,
  model: string,
  outputDir: string
): void {
  notify({
    title: 'Ask Many Models',
    message: `${model} response ready`,
    subtitle: `Request ${requestId.slice(0, 8)}...`,
    sound: 'default',
    open: outputDir,
    group: `ask-many-models-${requestId}`,
  });
}

/**
 * Send error notification
 */
export function notifyError(title: string, message: string): void {
  notify({
    title: 'Ask Many Models - Error',
    message,
    subtitle: title,
    sound: 'Basso',
    group: 'ask-many-models-error',
  });
}

/**
 * Send notification when deep research starts
 */
export function notifyDeepResearchStarted(models: string[]): void {
  notify({
    title: 'Ask Many Models',
    message: `Starting ${models.length} deep research model(s)`,
    subtitle: 'This will take 10-20 minutes',
    sound: 'default',
    group: 'ask-many-models-deep-research',
  });
}

/**
 * Send notification when deep research completes
 */
export function notifyDeepResearchComplete(
  model: string,
  status: 'success' | 'error' | 'timeout',
  outputPath: string
): void {
  const statusMessage = status === 'success'
    ? 'completed successfully'
    : status === 'timeout'
    ? 'timed out'
    : 'failed';

  notify({
    title: 'Ask Many Models - Deep Research',
    message: `${model} ${statusMessage}`,
    subtitle: 'Click to view results',
    sound: status === 'success' ? 'default' : 'Basso',
    open: outputPath,
    group: `ask-many-models-deep-${model}`,
  });
}
