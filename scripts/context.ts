/**
 * Context file handling utilities
 *
 * Reads context files and folders for including in prompts
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, extname, basename } from 'path';

const SUPPORTED_EXTENSIONS = ['.md', '.txt', '.pdf'];

/**
 * Read a single context file
 */
export function readContextFile(filePath: string): string | null {
  if (!existsSync(filePath)) {
    console.warn(`Context file not found: ${filePath}`);
    return null;
  }

  const ext = extname(filePath).toLowerCase();

  if (ext === '.pdf') {
    // For PDFs, we'll need to handle differently - for now just note it
    console.warn(`PDF support requires additional processing: ${filePath}`);
    return `[PDF file: ${basename(filePath)} - content not extracted]`;
  }

  try {
    return readFileSync(filePath, 'utf-8');
  } catch (error) {
    console.error(`Error reading context file ${filePath}:`, error);
    return null;
  }
}

/**
 * Read all context files from a folder
 */
export function readContextFolder(folderPath: string): Map<string, string> {
  const results = new Map<string, string>();

  if (!existsSync(folderPath)) {
    console.warn(`Context folder not found: ${folderPath}`);
    return results;
  }

  const stat = statSync(folderPath);
  if (!stat.isDirectory()) {
    // If it's a file, treat it as a single context file
    const content = readContextFile(folderPath);
    if (content) {
      results.set(basename(folderPath), content);
    }
    return results;
  }

  try {
    const files = readdirSync(folderPath);

    for (const file of files) {
      const filePath = join(folderPath, file);
      const ext = extname(file).toLowerCase();

      // Skip hidden files and unsupported extensions
      if (file.startsWith('.') || !SUPPORTED_EXTENSIONS.includes(ext)) {
        continue;
      }

      const fileStat = statSync(filePath);
      if (fileStat.isFile()) {
        const content = readContextFile(filePath);
        if (content) {
          results.set(file, content);
        }
      }
    }
  } catch (error) {
    console.error(`Error reading context folder ${folderPath}:`, error);
  }

  return results;
}

/**
 * Format context content for inclusion in a prompt
 */
export function formatContextForPrompt(contextFiles: Map<string, string>): string {
  if (contextFiles.size === 0) {
    return '';
  }

  let formatted = '## Background Context\n\n';

  for (const [filename, content] of contextFiles) {
    formatted += `### ${filename}\n\n`;
    formatted += content.trim();
    formatted += '\n\n';
  }

  formatted += '---\n\n';

  return formatted;
}

/**
 * Read context from either a file or folder path
 */
export function readContext(path: string): string {
  const contextFiles = readContextFolder(path);
  return formatContextForPrompt(contextFiles);
}
