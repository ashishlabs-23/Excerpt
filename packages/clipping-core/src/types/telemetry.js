"use strict";
/**
 * Standard structured telemetry schema and collector for clipping pipeline stages.
 * Owned strictly by @excerpt/clipping-core.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DefaultTelemetryCollector = void 0;
const errorTaxonomy_1 = require("./errorTaxonomy");
class DefaultTelemetryCollector {
    constructor() {
        this.stages = new Map();
        this.history = [];
    }
    startStage(stageName, metadata) {
        const memory = process.memoryUsage();
        const telemetry = {
            stage: stageName,
            start: new Date().toISOString(),
            status: 'running',
            memoryMb: {
                rss: Math.round((memory.rss / 1024 / 1024) * 100) / 100,
                heapUsed: Math.round((memory.heapUsed / 1024 / 1024) * 100) / 100,
                heapTotal: Math.round((memory.heapTotal / 1024 / 1024) * 100) / 100,
            },
            metadata,
        };
        this.stages.set(stageName, telemetry);
        return telemetry;
    }
    endStageSuccess(stageName, artifacts, metadata) {
        const current = this.stages.get(stageName) || this.startStage(stageName);
        const endTime = new Date();
        const startTime = new Date(current.start);
        const memory = process.memoryUsage();
        current.end = endTime.toISOString();
        current.durationMs = endTime.getTime() - startTime.getTime();
        current.status = 'success';
        current.artifacts = artifacts;
        current.memoryMb = {
            rss: Math.round((memory.rss / 1024 / 1024) * 100) / 100,
            heapUsed: Math.round((memory.heapUsed / 1024 / 1024) * 100) / 100,
            heapTotal: Math.round((memory.heapTotal / 1024 / 1024) * 100) / 100,
        };
        if (metadata) {
            current.metadata = { ...current.metadata, ...metadata };
        }
        this.history.push({ ...current });
        this.stages.delete(stageName);
        return current;
    }
    endStageError(stageName, error, metadata) {
        const current = this.stages.get(stageName) || this.startStage(stageName);
        const endTime = new Date();
        const startTime = new Date(current.start);
        const memory = process.memoryUsage();
        const errObj = error instanceof Error ? error : new Error(String(error));
        current.end = endTime.toISOString();
        current.durationMs = endTime.getTime() - startTime.getTime();
        current.status = 'failed';
        current.error = {
            category: errObj.category || errorTaxonomy_1.ErrorCategory.UNKNOWN,
            summary: errObj.message,
            message: errObj.message,
            stack: errObj.stack,
        };
        current.memoryMb = {
            rss: Math.round((memory.rss / 1024 / 1024) * 100) / 100,
            heapUsed: Math.round((memory.heapUsed / 1024 / 1024) * 100) / 100,
            heapTotal: Math.round((memory.heapTotal / 1024 / 1024) * 100) / 100,
        };
        if (metadata) {
            current.metadata = { ...current.metadata, ...metadata };
        }
        this.history.push({ ...current });
        this.stages.delete(stageName);
        return current;
    }
    getHistory() {
        return [...this.history];
    }
}
exports.DefaultTelemetryCollector = DefaultTelemetryCollector;
