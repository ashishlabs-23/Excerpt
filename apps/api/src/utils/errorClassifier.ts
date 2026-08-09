/**
 * Error Classifier Shim for Excerpt API.
 * Re-exports canonical error classification taxonomy and helpers from @excerpt/clipping-core.
 */

import {
  ErrorCategory,
  ErrorClassification,
  PipelineError,
  classifyPipelineError as coreClassifyPipelineError,
} from '@excerpt/clipping-core';

export { ErrorCategory, ErrorClassification, PipelineError };

export function classifyPipelineError(
  error: unknown,
  hint?: string,
): ErrorClassification {
  return coreClassifyPipelineError(error, hint);
}

/**
 * @deprecated Use classifyPipelineError(error, 'download') instead.
 * Kept for backwards compatibility with download strategy error reporting.
 */
export function classifyError(
  stderr: string | undefined,
): { category: ErrorCategory; summary: string } {
  const result = coreClassifyPipelineError(stderr ?? '', 'download');
  return { category: result.category, summary: result.summary };
}
