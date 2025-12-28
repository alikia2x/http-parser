/**
 * HTTP Response Status Line Parser
 * Parses the first line of HTTP responses: HTTP-VERSION SP STATUS-CODE SP REASON-PHRASE CRLF
 */

import { isValidStatusCode, isValidVersion } from "./errors";
import type { StatusLine } from "./types";

/**
 * Result of parsing a status line
 */
export interface StatusLineResult {
	/** The parsed status line or null if incomplete */
	statusLine: StatusLine | null;
	/** Number of bytes consumed */
	bytesConsumed: number;
	/** Whether more data is needed */
	needsMoreData: boolean;
	/** Error message if parsing failed, null otherwise */
	error: string | null;
}

/**
 * Parses an HTTP status line from a byte array
 * @param data - The input data containing the status line
 * @param start - Starting position in the data
 * @param end - Ending position in the data (exclusive)
 * @returns StatusLineResult with parsing result
 */
export function parseStatusLine(
	data: Uint8Array,
	start: number = 0,
	end: number = data.length
): StatusLineResult {
	// Find the end of the status line (CRLF)
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

	// Find first space (version/status-code separator)
	let firstSpace = -1;
	for (let i = start; i < lineEnd; i++) {
		if (data[i] === 0x20) {
			firstSpace = i;
			break;
		}
	}

	if (firstSpace === -1) {
		return {
			bytesConsumed: 0,
			error: null,
			needsMoreData: true,
			statusLine: null,
		};
	}

	// Find second space (status-code/reason-phrase separator)
	let secondSpace = -1;
	for (let i = firstSpace + 1; i < lineEnd; i++) {
		if (data[i] === 0x20) {
			secondSpace = i;
			break;
		}
	}

	// If no second space found and we don't have CRLF, we need more data
	// (reason-phrase is required per RFC 7230)
	if (secondSpace === -1 && !hasCrlf) {
		// Check if status code is at least complete
		const potentialStatusStart = firstSpace + 1;
		if (potentialStatusStart < lineEnd) {
			const statusCodeStr = decodeUtf8(data.slice(potentialStatusStart, lineEnd));
			const statusCode = parseInt(statusCodeStr, 10);
			// If status code is incomplete, need more data
			if (Number.isNaN(statusCode) || statusCode < 100 || statusCode > 599) {
				return {
					bytesConsumed: 0,
					error: null,
					needsMoreData: true,
					statusLine: null,
				};
			}
		}
		return {
			bytesConsumed: 0,
			error: null,
			needsMoreData: true,
			statusLine: null,
		};
	}

	// If no second space found but we have CRLF, reason-phrase is empty
	if (secondSpace === -1) {
		secondSpace = lineEnd;
	}

	// Extract version
	const versionBytes = data.slice(start, firstSpace);
	const version = decodeUtf8(versionBytes);

	if (!isValidVersion(version)) {
		return {
			bytesConsumed: 0,
			error: "Invalid HTTP version",
			needsMoreData: false,
			statusLine: null,
		};
	}

	// Extract status code
	const statusCodeEnd = secondSpace;
	const statusCodeStr = decodeUtf8(data.slice(firstSpace + 1, statusCodeEnd));
	const statusCode = parseInt(statusCodeStr, 10);

	if (!isValidStatusCode(statusCode)) {
		return {
			bytesConsumed: 0,
			error: "Invalid status code",
			needsMoreData: false,
			statusLine: null,
		};
	}

	// Extract reason phrase
	const reasonStart = secondSpace + 1;
	const reasonPhrase = decodeUtf8(data.slice(reasonStart, lineEnd));

	// Calculate bytes consumed: include CRLF if present
	const bytesConsumed = hasCrlf ? crlfPos + 2 : end - start;

	return {
		bytesConsumed,
		error: null,
		needsMoreData: false,
		statusLine: {
			statusCode,
			statusText: reasonPhrase,
			version,
		},
	};
}

/**
 * Decodes a Uint8Array as UTF-8
 * @param data - The input data
 * @returns The decoded string
 */
function decodeUtf8(data: Uint8Array): string {
	const decoder = new TextDecoder("utf-8", { fatal: false });
	return decoder.decode(data);
}

/**
 * Validates a complete status line object
 * @param statusLine - The status line to validate
 * @returns true if valid
 */
export function validateStatusLine(statusLine: StatusLine): boolean {
	return isValidStatusCode(statusLine.statusCode) && isValidVersion(statusLine.version);
}

/**
 * Formats a status line as bytes for transmission
 * @param statusLine - The status line to format
 * @returns Uint8Array containing the formatted status line
 */
export function formatStatusLine(statusLine: StatusLine): Uint8Array {
	const encoder = new TextEncoder();
	return encoder.encode(
		`${statusLine.version} ${statusLine.statusCode} ${statusLine.statusText}\r\n`
	);
}

/**
 * Common HTTP status text for known status codes
 */
export const STATUS_TEXT: Record<number, string> = {
	100: "Continue",
	101: "Switching Protocols",
	102: "Processing",
	103: "Early Hints",
	200: "OK",
	201: "Created",
	202: "Accepted",
	203: "Non-Authoritative Information",
	204: "No Content",
	205: "Reset Content",
	206: "Partial Content",
	207: "Multi-Status",
	208: "Already Reported",
	226: "IM Used",
	300: "Multiple Choices",
	301: "Moved Permanently",
	302: "Found",
	303: "See Other",
	304: "Not Modified",
	305: "Use Proxy",
	307: "Temporary Redirect",
	308: "Permanent Redirect",
	400: "Bad Request",
	401: "Unauthorized",
	402: "Payment Required",
	403: "Forbidden",
	404: "Not Found",
	405: "Method Not Allowed",
	406: "Not Acceptable",
	407: "Proxy Authentication Required",
	408: "Request Timeout",
	409: "Conflict",
	410: "Gone",
	411: "Length Required",
	412: "Precondition Failed",
	413: "Content Too Large",
	414: "URI Too Long",
	415: "Unsupported Media Type",
	416: "Range Not Satisfiable",
	417: "Expectation Failed",
	418: "I'm a teapot",
	421: "Misdirected Request",
	422: "Unprocessable Content",
	423: "Locked",
	424: "Failed Dependency",
	425: "Too Early",
	426: "Upgrade Required",
	428: "Precondition Required",
	429: "Too Many Requests",
	431: "Request Header Fields Too Large",
	451: "Unavailable For Legal Reasons",
	500: "Internal Server Error",
	501: "Not Implemented",
	502: "Bad Gateway",
	503: "Service Unavailable",
	504: "Gateway Timeout",
	505: "HTTP Version Not Supported",
	506: "Variant Also Negotiates",
	507: "Insufficient Storage",
	508: "Loop Detected",
	510: "Not Extended",
	511: "Network Authentication Required",
};

/**
 * Gets the status text for a status code
 * @param statusCode - The status code
 * @returns The status text or empty string if unknown
 */
export function getStatusText(statusCode: number): string {
	return STATUS_TEXT[statusCode] || "";
}
