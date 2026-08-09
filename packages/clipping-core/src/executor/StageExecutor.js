"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StageExecutor = void 0;
const errorTaxonomy_1 = require("../types/errorTaxonomy");
class StageExecutor {
    /**
     * Primary entry point for executing any pipeline stage under a canonical lifecycle contract.
     */
    static async run(input, options) {
        const { stage, component, provider, timeoutMs = 60000, timeoutType = 'api_timeout', maxRetries = 1, retryDelayMs = 1000, jobId, clipId, validateInput, execute, validateOutput, onTelemetry, } = options;
        const startTime = Date.now();
        const initialMemory = process.memoryUsage().heapUsed;
        let attempt = 0;
        let lastError = null;
        // Lifecycle Step 1: Validate Input
        if (validateInput) {
            try {
                const isValid = await validateInput(input);
                if (!isValid) {
                    throw new errorTaxonomy_1.PipelineError({
                        message: `Stage [${stage}] input validation failed.`,
                        category: errorTaxonomy_1.ErrorCategory.UNKNOWN,
                        stage,
                        component,
                        provider,
                        jobId,
                        clipId,
                        retryable: false,
                        rootCause: 'INVALID_INPUT',
                    });
                }
            }
            catch (err) {
                if (err instanceof errorTaxonomy_1.PipelineError)
                    throw err;
                throw new errorTaxonomy_1.PipelineError({
                    message: `Stage [${stage}] input validation error: ${err.message}`,
                    category: errorTaxonomy_1.ErrorCategory.UNKNOWN,
                    stage,
                    component,
                    provider,
                    jobId,
                    clipId,
                    retryable: false,
                    causeErr: err,
                });
            }
        }
        // Lifecycle Loop: Execute with Retry Policy
        while (attempt < maxRetries) {
            attempt++;
            const attemptStartTime = Date.now();
            try {
                // Execute with timeout wrapper
                const result = await StageExecutor.executeWithTimeout(execute(input, attempt), timeoutMs, stage, timeoutType);
                // Lifecycle Step 3: Validate Output
                if (validateOutput) {
                    const isValidOutput = await validateOutput(result);
                    if (!isValidOutput) {
                        throw new errorTaxonomy_1.PipelineError({
                            message: `Stage [${stage}] output validation failed contract.`,
                            category: errorTaxonomy_1.ErrorCategory.UNKNOWN,
                            stage,
                            component,
                            provider,
                            jobId,
                            clipId,
                            attempt,
                            retryable: attempt < maxRetries,
                            rootCause: 'INVALID_OUTPUT',
                        });
                    }
                }
                // Execution Succeeded -> Record Telemetry & Update Health
                const durationMs = Date.now() - startTime;
                const memoryDeltaMb = Number(((process.memoryUsage().heapUsed - initialMemory) / (1024 * 1024)).toFixed(2));
                const telemetry = {
                    stage,
                    component,
                    provider,
                    jobId,
                    clipId,
                    status: 'success',
                    durationMs,
                    attempt,
                    memoryDeltaMb,
                    timestamp: new Date().toISOString(),
                };
                StageExecutor.recordHealth(stage, true, durationMs);
                if (onTelemetry) {
                    try {
                        await onTelemetry(telemetry);
                    }
                    catch (telErr) {
                        console.warn(`[StageExecutor]: Non-fatal telemetry recording error in stage ${stage}:`, telErr);
                    }
                }
                return result;
            }
            catch (err) {
                lastError = err;
                const attemptDuration = Date.now() - attemptStartTime;
                // Determine if we should retry
                const classified = (0, errorTaxonomy_1.classifyPipelineError)(err);
                const isRetryable = classified.retryable && attempt < maxRetries;
                if (isRetryable) {
                    const backoff = retryDelayMs * Math.pow(2, attempt - 1);
                    console.warn(`[StageExecutor]: Stage [${stage}] attempt ${attempt}/${maxRetries} failed (${classified.category}): ${err.message}. Retrying in ${backoff}ms...`);
                    await StageExecutor.sleep(backoff);
                }
                else {
                    break; // Stop retrying if not retryable or max attempts reached
                }
            }
        }
        // Lifecycle Step 4: Catch & Classify Error on Final Failure
        const durationMs = Date.now() - startTime;
        const memoryDeltaMb = Number(((process.memoryUsage().heapUsed - initialMemory) / (1024 * 1024)).toFixed(2));
        let finalPipelineError;
        if (lastError instanceof errorTaxonomy_1.PipelineError) {
            finalPipelineError = lastError;
        }
        else {
            const classified = (0, errorTaxonomy_1.classifyPipelineError)(lastError, `Stage [${stage}] execution failed`);
            finalPipelineError = new errorTaxonomy_1.PipelineError({
                message: classified.originalMessage || `Stage [${stage}] failed`,
                category: classified.category,
                stage,
                component,
                provider,
                jobId,
                clipId,
                durationMs,
                attempt,
                retryable: false,
                causeErr: lastError,
            });
        }
        const failureTelemetry = {
            stage,
            component,
            provider,
            jobId,
            clipId,
            status: 'failed',
            durationMs,
            attempt,
            memoryDeltaMb,
            errorCategory: finalPipelineError.category,
            errorMessage: finalPipelineError.message,
            suggestedFix: finalPipelineError.suggestedFix,
            timestamp: new Date().toISOString(),
        };
        StageExecutor.recordHealth(stage, false, durationMs, finalPipelineError.message);
        if (onTelemetry) {
            try {
                await onTelemetry(failureTelemetry);
            }
            catch (telErr) {
                console.warn(`[StageExecutor]: Non-fatal failure telemetry error in stage ${stage}:`, telErr);
            }
        }
        throw finalPipelineError;
    }
    /**
     * Returns current health metrics for a specific stage or all stages.
     */
    static getHealth(stage) {
        if (stage) {
            const entry = this.healthRegistry.get(stage);
            if (!entry) {
                return {
                    stage,
                    status: 'healthy',
                    successRate: 1.0,
                    avgLatencyMs: 0,
                    lastUpdated: new Date().toISOString(),
                };
            }
            const successRate = entry.total > 0 ? entry.successes / entry.total : 1.0;
            const avgLatencyMs = entry.total > 0 ? entry.totalLatencyMs / entry.total : 0;
            let status = 'healthy';
            if (successRate < 0.5)
                status = 'offline';
            else if (successRate < 0.9)
                status = 'degraded';
            return {
                stage,
                status,
                successRate: Number(successRate.toFixed(2)),
                avgLatencyMs: Number(avgLatencyMs.toFixed(0)),
                lastError: entry.lastError,
                lastUpdated: entry.lastUpdated,
            };
        }
        const resultMap = new Map();
        for (const [key] of this.healthRegistry) {
            resultMap.set(key, this.getHealth(key));
        }
        return resultMap;
    }
    static async executeWithTimeout(promise, timeoutMs, stage, timeoutType) {
        let timeoutId;
        const timeoutPromise = new Promise((_, reject) => {
            timeoutId = setTimeout(() => {
                reject(new errorTaxonomy_1.PipelineError({
                    message: `Stage [${stage}] timed out after ${timeoutMs}ms`,
                    category: errorTaxonomy_1.ErrorCategory.TIMEOUT,
                    stage,
                    timeoutType,
                    retryable: true,
                    rootCause: 'STAGE_TIMEOUT',
                }));
            }, timeoutMs);
        });
        try {
            return await Promise.race([promise, timeoutPromise]);
        }
        finally {
            clearTimeout(timeoutId);
        }
    }
    static recordHealth(stage, success, durationMs, errorMessage) {
        const existing = this.healthRegistry.get(stage) || {
            total: 0,
            successes: 0,
            failures: 0,
            totalLatencyMs: 0,
            lastUpdated: new Date().toISOString(),
        };
        existing.total++;
        if (success)
            existing.successes++;
        else
            existing.failures++;
        existing.totalLatencyMs += durationMs;
        if (errorMessage)
            existing.lastError = errorMessage;
        existing.lastUpdated = new Date().toISOString();
        this.healthRegistry.set(stage, existing);
    }
    static sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}
exports.StageExecutor = StageExecutor;
StageExecutor.healthRegistry = new Map();
