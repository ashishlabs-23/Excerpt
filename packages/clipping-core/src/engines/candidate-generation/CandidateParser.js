"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CandidateParser = void 0;
class CandidateParser {
    /**
     * Parses the raw JSON response from the LLM.
     * Throws an error if the structure is invalid.
     */
    parseCandidates(rawContent) {
        let parsed;
        try {
            parsed = JSON.parse(rawContent);
        }
        catch (e) {
            // In a real implementation we might use a repair function.
            throw new Error("Failed to parse Stage A candidates from LLM: " + e);
        }
        let rawArray = [];
        if (Array.isArray(parsed)) {
            rawArray = parsed;
        }
        else if (parsed && Array.isArray(parsed.candidates)) {
            rawArray = parsed.candidates;
        }
        else {
            throw new Error("Failed to parse Stage A candidates from LLM (missing array).");
        }
        // Filter out wildly out-of-bounds candidates
        const validCandidates = rawArray.filter((c) => typeof c.start_time === 'number' &&
            typeof c.end_time === 'number' &&
            c.end_time - c.start_time >= 10 &&
            c.end_time - c.start_time <= 90);
        return validCandidates;
    }
}
exports.CandidateParser = CandidateParser;
