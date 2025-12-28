/**
 * HTTP/1.x Parser
 *
 * A robust, production-ready HTTP/1.x request and response parser
 * written in TypeScript. Supports all modern JavaScript runtimes.
 *
 * @packageDocumentation
 */

// Errors and validation
export * from "./errors";
// Headers
export * from "./headers";
// Main parser
export { createRequest, createResponse, HttpParser } from "./parser";

// Request line parser
export * from "./request";

// Response line parser
export * from "./response";
// Types
export * from "./types";

// Version
export const VERSION = "1.0.0";
