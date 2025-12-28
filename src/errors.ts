/**
 * Error handling utilities for the HTTP parser
 * Provides consistent error creation and validation
 */

import { type ParserError, ParserErrorCode, type ParserState } from "./types";

/**
 * Error messages for each error code
 */
const ERROR_MESSAGES: Record<ParserErrorCode, string> = {
	[ParserErrorCode.INVALID_METHOD]: "Invalid HTTP method",
	[ParserErrorCode.INVALID_VERSION]: "Invalid HTTP version",
	[ParserErrorCode.INVALID_TARGET]: "Invalid request target",
	[ParserErrorCode.INVALID_STATUS_CODE]: "Invalid HTTP status code",
	[ParserErrorCode.INVALID_HEADER]: "Invalid header format",
	[ParserErrorCode.HEADER_NAME_TOO_LONG]: "HTTP header name too long",
	[ParserErrorCode.HEADER_VALUE_TOO_LONG]: "HTTP header value too long",
	[ParserErrorCode.TOO_MANY_HEADERS]: "Too many HTTP headers",
	[ParserErrorCode.INVALID_CONTENT_LENGTH]: "Invalid Content-Length header",
	[ParserErrorCode.BODY_TOO_LARGE]: "HTTP body exceeds maximum allowed size",
	[ParserErrorCode.INVALID_CHUNK_SIZE]: "Invalid chunk size in chunked transfer encoding",
	[ParserErrorCode.INCOMPLETE_CHUNK]: "Incomplete chunk data received",
	[ParserErrorCode.INVALID_CHUNK_TRAILER]: "Invalid chunk trailer section",
	[ParserErrorCode.TIMEOUT]: "Parser inactivity timeout",
	[ParserErrorCode.CONNECTION_CLOSED]: "Connection closed unexpectedly",
	[ParserErrorCode.UNKNOWN]: "Unknown parser error",
};

/**
 * Creates a parser error with the given code and details
 * @param code - The error code
 * @param state - The parser state when the error occurred
 * @param position - Optional position in input where error occurred
 * @param details - Optional additional error details
 * @returns A ParserError object
 */
export function createError(
	code: ParserErrorCode,
	state: ParserState,
	position?: number,
	details?: unknown
): ParserError {
	return {
		code,
		details,
		message: ERROR_MESSAGES[code],
		position,
		state,
	};
}

/**
 * Checks if a string is a valid HTTP method
 * @param method - The string to validate
 * @returns true if valid HTTP method
 */
export function isValidMethod(method: string): boolean {
	// Standard HTTP methods
	const standardMethods = [
		"GET",
		"HEAD",
		"POST",
		"PUT",
		"DELETE",
		"CONNECT",
		"OPTIONS",
		"TRACE",
		"PATCH",
	];

	// Check standard methods
	if (standardMethods.includes(method)) {
		return true;
	}

	// RFC 7231 allows extension methods
	// Must be a token (visible characters except controls and separators)
	if (!method || method.length === 0 || method.length > 100) {
		return false;
	}

	// Token characters: any CHAR except CTLs or separators
	// separators = "(" | ")" | "<" | ">" | "@" | "," | ";" | ":" | "\" | <"> | "/" | "[" | "]" | "?" | "=" | "{" | "}" | SP | HT
	const separatorChars = new Set([
		"(",
		")",
		"<",
		">",
		"@",
		",",
		";",
		":",
		"\\",
		'"',
		"/",
		"[",
		"]",
		"?",
		"=",
		"{",
		"}",
		" ",
		"\t",
	]);

	for (const char of method) {
		const code = char.charCodeAt(0);
		// Control characters (0-31 and 127)
		if (code <= 31 || code === 127) {
			return false;
		}
		// Separators
		if (separatorChars.has(char)) {
			return false;
		}
	}

	return true;
}

/**
 * Validates HTTP version string
 * @param version - The version string to validate
 * @returns true if valid HTTP/1.0 or HTTP/1.1
 */
export function isValidVersion(version: string): boolean {
	return version === "HTTP/1.0" || version === "HTTP/1.1";
}

/**
 * Validates HTTP status code
 * @param statusCode - The status code to validate
 * @returns true if valid 3-digit status code
 */
export function isValidStatusCode(statusCode: number): boolean {
	return statusCode >= 100 && statusCode <= 999;
}

/**
 * Validates header field name according to RFC 7230
 * @param name - The header name to validate
 * @param allowUnderscore - Whether to allow underscores
 * @returns true if valid header name
 */
export function isValidHeaderName(name: string, allowUnderscore: boolean = true): boolean {
	if (!name || name.length === 0 || name.length > 256) {
		return false;
	}

	// Token characters: any CHAR except CTLs or separators
	const separatorChars = new Set([
		"(",
		")",
		"<",
		">",
		"@",
		",",
		";",
		":",
		"\\",
		'"',
		"/",
		"[",
		"]",
		"?",
		"=",
		"{",
		"}",
		" ",
		"\t",
	]);

	for (const char of name) {
		const code = char.charCodeAt(0);
		// Control characters (0-31 and 127)
		if (code <= 31 || code === 127) {
			return false;
		}
		// Separators (unless underscore is allowed and char is underscore)
		if (!allowUnderscore && char === "_") {
			return false;
		}
		if (separatorChars.has(char)) {
			return false;
		}
	}

	return true;
}

/**
 * Validates header field value
 * Allows most printable characters and some special characters
 * @param value - The header value to validate
 * @returns true if valid header value
 */
export function isValidHeaderValue(value: string): boolean {
	if (value.length > 8192) {
		return false;
	}

	// Check for invalid characters (control chars except HTAB, FF, CR, LF)
	for (const char of value) {
		const code = char.charCodeAt(0);
		// Allow: 9 (HTAB), 10 (LF), 12 (FF), 13 (CR), and 32-126 (printable)
		const isValid =
			code === 9 || code === 10 || code === 12 || code === 13 || (code >= 32 && code <= 126);

		if (!isValid) {
			return false;
		}
	}

	return true;
}

/**
 * Validates request target according to RFC 7230
 * @param target - The request target to validate
 * @returns true if valid request target
 */
export function isValidTarget(target: string): boolean {
	if (!target || target.length === 0 || target.length > 8192) {
		return false;
	}

	// Must start with "/" (origin-form) or be absolute URI, asterisk-form, or authority-form
	// For simplicity, we accept anything that's not clearly invalid
	const firstChar = target[0];

	// Origin-form: starts with "/"
	if (firstChar === "/") {
		return true;
	}

	// Absolute-form: absolute URI
	if (target.includes("://")) {
		return true;
	}

	// Asterisk-form: "*"
	if (target === "*") {
		return true;
	}

	// Authority-form: starts with host:port (no scheme)
	// Contains no "/" and is a valid host:port
	if (!target.includes("/") && target.includes(":")) {
		return true;
	}

	return false;
}

/**
 * Parses Content-Length header value
 * @param value - The Content-Length header value
 * @returns The parsed number or null if invalid
 */
export function parseContentLength(value: string): number | null {
	value = value.trim();

	if (!value) {
		return null;
	}

	// Must be a valid non-negative integer
	const length = Number(value);
	if (!Number.isInteger(length) || length < 0) {
		return null;
	}

	return length;
}

/**
 * Parses chunk size from a hex string
 * @param hex - The hex string representing chunk size
 * @param maxSize - Maximum allowed chunk size
 * @returns The parsed chunk size or null if invalid
 */
export function parseChunkSize(hex: string, maxSize: number = 10 * 1024 * 1024): number | null {
	hex = hex.trim();

	if (!hex) {
		return null;
	}

	// Chunk size is hex-encoded
	const size = parseInt(hex, 16);

	if (Number.isNaN(size) || size < 0) {
		return null;
	}

	// Check for overflow or exceeding max
	if (size > maxSize) {
		return null;
	}

	return size;
}

/**
 * Sanitizes error message for display
 * Removes potentially sensitive information
 * @param error - The error to sanitize
 * @returns Sanitized error message
 */
export function sanitizeErrorMessage(error: ParserError): string {
	// Don't expose internal details in production
	return error.message;
}
