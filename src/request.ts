/**
 * HTTP Request Line Parser
 * Parses the first line of HTTP requests: METHOD SP REQUEST-TARGET SP HTTP-VERSION CRLF
 */

import { isValidMethod, isValidTarget, isValidVersion } from "./errors";
import type { RequestLine } from "./types";

/**
 * Result of parsing a request line
 */
export interface RequestLineResult {
	/** The parsed request line or null if incomplete */
	requestLine: RequestLine | null;
	/** Number of bytes consumed */
	bytesConsumed: number;
	/** Whether more data is needed */
	needsMoreData: boolean;
	/** Error message if parsing failed, null otherwise */
	error: string | null;
}

/**
 * Parses an HTTP request line from a byte array
 * @param data - The input data containing the request line
 * @param start - Starting position in the data
 * @param end - Ending position in the data (exclusive)
 * @returns RequestLineResult with parsing result
 */
export function parseRequestLine(
	data: Uint8Array,
	start: number = 0,
	end: number = data.length
): RequestLineResult {
	// Find the end of the request line (CRLF)
	let crlfPos = -1;
	for (let i = start; i < end - 1; i++) {
		// Check for CRLF
		if (data[i] === 0x0d && data[i + 1] === 0x0a) {
			crlfPos = i;
			break;
		}
	}

	// Determine the effective end of the line
	const hasCrlf = crlfPos !== -1;
	const lineEnd = hasCrlf ? crlfPos : end;

	// Find first space (method/target separator)
	let firstSpace = -1;
	for (let i = start; i < lineEnd; i++) {
		if (data[i] === 0x20) {
			firstSpace = i;
			break;
		}
	}

	if (firstSpace === -1) {
		// Need more data if we didn't find a space
		return {
			bytesConsumed: 0,
			error: null,
			needsMoreData: true,
			requestLine: null,
		};
	}

	// Find second space (target/version separator)
	let secondSpace = -1;
	for (let i = firstSpace + 1; i < lineEnd; i++) {
		if (data[i] === 0x20) {
			secondSpace = i;
			break;
		}
	}

	// If no second space found and we don't have CRLF, we need more data
	if (secondSpace === -1 && !hasCrlf) {
		// Check if we have complete data (version present without CRLF)
		const potentialVersionStart = firstSpace + 1;
		if (potentialVersionStart < lineEnd) {
			const versionText = decodeUtf8(data, potentialVersionStart, lineEnd);
			// If version is incomplete, need more data
			if (!versionText.startsWith("HTTP/")) {
				return {
					bytesConsumed: 0,
					error: null,
					needsMoreData: true,
					requestLine: null,
				};
			}
		}
		return {
			bytesConsumed: 0,
			error: null,
			needsMoreData: true,
			requestLine: null,
		};
	}

	// If no second space found but we have CRLF, version extends to CRLF
	if (secondSpace === -1) {
		secondSpace = lineEnd;
	}

	// Extract method
	const method = decodeUtf8(data, start, firstSpace);

	if (!isValidMethod(method)) {
		return {
			bytesConsumed: 0,
			error: "Invalid HTTP method",
			needsMoreData: false,
			requestLine: null,
		};
	}

	// Extract target
	const target = decodeUtf8(data, firstSpace + 1, secondSpace);

	if (!isValidTarget(target)) {
		return {
			bytesConsumed: 0,
			error: "Invalid request target",
			needsMoreData: false,
			requestLine: null,
		};
	}

	// Extract version
	const version = decodeUtf8(data, secondSpace + 1, lineEnd);

	if (!isValidVersion(version)) {
		return {
			bytesConsumed: 0,
			error: "Invalid HTTP version",
			needsMoreData: false,
			requestLine: null,
		};
	}

	// Calculate bytes consumed: include CRLF if present
	const bytesConsumed = hasCrlf ? crlfPos + 2 : end - start;

	return {
		bytesConsumed,
		error: null,
		needsMoreData: false,
		requestLine: {
			method,
			target,
			version,
		},
	};
}

/**
 * Decodes a portion of a Uint8Array as UTF-8
 * @param data - The input data
 * @param start - Starting position
 * @param end - Ending position (exclusive)
 * @returns The decoded string
 */
function decodeUtf8(data: Uint8Array, start: number, end: number): string {
	const decoder = new TextDecoder("utf-8", { fatal: false });
	return decoder.decode(data.slice(start, end));
}

/**
 * Validates a complete request line object
 * @param requestLine - The request line to validate
 * @returns true if valid
 */
export function validateRequestLine(requestLine: RequestLine): boolean {
	return (
		isValidMethod(requestLine.method) &&
		isValidTarget(requestLine.target) &&
		isValidVersion(requestLine.version)
	);
}

/**
 * Formats a request line as bytes for transmission
 * @param requestLine - The request line to format
 * @returns Uint8Array containing the formatted request line
 */
export function formatRequestLine(requestLine: RequestLine): Uint8Array {
	const encoder = new TextEncoder();
	return encoder.encode(`${requestLine.method} ${requestLine.target} ${requestLine.version}\r\n`);
}
