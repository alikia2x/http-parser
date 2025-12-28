/**
 * HTTP/1.x Parser
 * A robust, production-ready parser for HTTP requests and responses
 * Supports streaming parsing for memory efficiency
 */

import {
	createError,
	isValidHeaderName,
	isValidHeaderValue,
	parseChunkSize,
	parseContentLength,
} from "./errors";
import { HeadersMap, parseHeaders } from "./headers";
import { formatRequestLine, parseRequestLine } from "./request";
import { formatStatusLine, getStatusText, parseStatusLine } from "./response";
import type {
	HttpMessage,
	HttpRequest,
	HttpResponse,
	MessageType,
	ParserError,
	ParserOptions,
	RequestLine,
	StatusLine,
} from "./types";
import {
	HttpVersion,
	MessageType as MT,
	ParserErrorCode,
	ParserState,
	TransferEncoding as TE,
} from "./types";

/**
 * Default parser options
 */
const DEFAULT_OPTIONS: Required<ParserOptions> = {
	allowUnderscoreInHeaders: true,
	enablePipelining: false,
	inactivityTimeout: 30000,
	maxBodySize: 10 * 1024 * 1024, // 10MB
	maxChunks: 10000,
	maxHeaderLineLength: 8192,
	maxHeaders: 256,
	validateHeaderNames: true,
	validateHeaderValues: true,
};

/**
 * HTTP/1.x Parser implementation
 * Handles both requests and responses with streaming support
 */
export class HttpParser {
	private readonly options: Required<ParserOptions>;
	private state: ParserState;
	private buffer: Uint8Array;
	private bufferOffset: number;
	private messageType: MessageType | null;
	private requestLine: RequestLine | null;
	private statusLine: StatusLine | null;
	private headers: HeadersMap | null;
	private body: Uint8Array | null;
	private bodyLength: number;
	private chunkSize: number;
	private chunkBytesRead: number;
	private totalChunks: number;
	private keepAlive: boolean;

	/**
	 * Creates a new HttpParser instance
	 * @param options - Optional parser configuration
	 */
	constructor(options: ParserOptions = {}) {
		this.options = { ...DEFAULT_OPTIONS, ...options };
		this.state = ParserState.IDLE;
		this.buffer = new Uint8Array(0);
		this.bufferOffset = 0;
		this.messageType = null;
		this.requestLine = null;
		this.statusLine = null;
		this.headers = null;
		this.body = null;
		this.bodyLength = 0;
		this.chunkSize = 0;
		this.chunkBytesRead = 0;
		this.totalChunks = 0;
		this.keepAlive = true;
	}

	/**
	 * Resets the parser to initial state
	 * @param clearBuffer - Whether to clear the buffer (default: true)
	 */
	reset(clearBuffer: boolean = true): void {
		this.state = ParserState.IDLE;
		if (clearBuffer) {
			this.buffer = new Uint8Array(0);
			this.bufferOffset = 0;
		}
		this.messageType = null;
		this.requestLine = null;
		this.statusLine = null;
		this.headers = null;
		this.body = null;
		this.bodyLength = 0;
		this.chunkSize = 0;
		this.chunkBytesRead = 0;
		this.totalChunks = 0;
		this.keepAlive = true;
	}

	/**
	 * Parses HTTP data and returns complete messages
	 * @param data - The incoming HTTP data
	 * @returns Array of parsed messages
	 */
	parse(data: Uint8Array): HttpMessage[] {
		this.appendBuffer(data);
		const messages: HttpMessage[] = [];

		// Parse until we need more data, encounter an error, or complete
		// Note: We start in IDLE state, so we need to parse at least once
		while (this.state !== ParserState.ERROR) {
			const result = this.parseNext();

			if (result.error) {
				this.state = ParserState.ERROR;
				break;
			}

			if (result.complete) {
				messages.push(result.message!);
				// Compact buffer to remove parsed data, then reset state for next message
				this.compactBuffer();
				this.reset(false);
			}

			if (result.needsMoreData) {
				break;
			}
		}

		return messages;
	}

	/**
	 * Parses the next message from the buffer
	 * @returns Parse result with message or error
	 */
	private parseNext(): {
		message?: HttpMessage;
		error?: ParserError;
		complete: boolean;
		needsMoreData: boolean;
	} {
		switch (this.state) {
			case ParserState.IDLE:
				return this.parseMessageStart();

			case ParserState.REQUEST_LINE:
				return this.parseRequestLine();

			case ParserState.STATUS_LINE:
				return this.parseStatusLine();

			case ParserState.HEADERS:
				return this.parseHeaders();

			case ParserState.BODY_CONTENT_LENGTH:
				return this.parseBodyContentLength();

			case ParserState.BODY_CHUNKED_SIZE:
				return this.parseChunkedSize();

			case ParserState.BODY_CHUNKED_DATA:
				return this.parseChunkedData();

			case ParserState.BODY_CHUNKED_TRAILER:
				return this.parseChunkedTrailer();

			case ParserState.COMPLETE:
				return { complete: true, needsMoreData: false };

			case ParserState.ERROR:
				return {
					complete: false,
					error: createError(ParserErrorCode.UNKNOWN, this.state),
					needsMoreData: false,
				};

			default:
				return {
					complete: false,
					error: createError(ParserErrorCode.UNKNOWN, this.state),
					needsMoreData: false,
				};
		}
	}

	/**
	 * Attempts to detect if buffer contains request or response
	 */
	private parseMessageStart(): {
		complete: boolean;
		needsMoreData: boolean;
		error?: ParserError;
	} {
		// Need at least 4 bytes to check for "HTTP/" (response) or method
		if (this.buffer.length - this.bufferOffset < 4) {
			return { complete: false, needsMoreData: true };
		}

		// Check if this looks like an HTTP response (starts with "HTTP/")
		if (
			this.buffer[this.bufferOffset] === 0x48 && // 'H'
			this.buffer[this.bufferOffset + 1] === 0x54 && // 'T'
			this.buffer[this.bufferOffset + 2] === 0x54 && // 'T'
			this.buffer[this.bufferOffset + 3] === 0x50 // 'P'
		) {
			this.messageType = MT.RESPONSE;
			this.state = ParserState.STATUS_LINE;
			return { complete: false, needsMoreData: false };
		}

		// Otherwise treat as request
		this.messageType = MT.REQUEST;
		this.state = ParserState.REQUEST_LINE;
		return { complete: false, needsMoreData: false };
	}

	/**
	 * Parses the request line
	 */
	private parseRequestLine(): { complete: boolean; needsMoreData: boolean; error?: ParserError } {
		const result = parseRequestLine(this.buffer, this.bufferOffset, this.buffer.length);

		if (result.needsMoreData) {
			return { complete: false, needsMoreData: true };
		}

		if (result.error) {
			return {
				complete: false,
				error: createError(
					ParserErrorCode.INVALID_METHOD,
					ParserState.REQUEST_LINE,
					this.bufferOffset,
					result.error
				),
				needsMoreData: false,
			};
		}

		this.requestLine = result.requestLine!;
		this.bufferOffset += result.bytesConsumed;
		this.state = ParserState.HEADERS;
		return { complete: false, needsMoreData: false };
	}

	/**
	 * Parses the status line
	 */
	private parseStatusLine(): { complete: boolean; needsMoreData: boolean; error?: ParserError } {
		const result = parseStatusLine(this.buffer, this.bufferOffset, this.buffer.length);

		if (result.needsMoreData) {
			return { complete: false, needsMoreData: true };
		}

		if (result.error) {
			return {
				complete: false,
				error: createError(
					ParserErrorCode.INVALID_VERSION,
					ParserState.STATUS_LINE,
					this.bufferOffset,
					result.error
				),
				needsMoreData: false,
			};
		}

		this.statusLine = result.statusLine!;
		this.bufferOffset += result.bytesConsumed;
		this.state = ParserState.HEADERS;
		return { complete: false, needsMoreData: false };
	}

	/**
	 * Parses HTTP headers
	 */
	private parseHeaders(): { complete: boolean; needsMoreData: boolean; error?: ParserError } {
		// Find the end of headers (double CRLF)
		let headerEnd = -1;
		const bufferLength = this.buffer.length;
		for (let i = this.bufferOffset; i <= bufferLength - 4; i++) {
			if (
				this.buffer[i] === 0x0d &&
				this.buffer[i + 1] === 0x0a &&
				this.buffer[i + 2] === 0x0d &&
				this.buffer[i + 3] === 0x0a
			) {
				headerEnd = i;
				break;
			}
		}

		if (headerEnd === -1) {
			// Check if we have at least one complete line or end of data
			for (let i = this.bufferOffset; i <= bufferLength - 2; i++) {
				if (this.buffer[i] === 0x0d && this.buffer[i + 1] === 0x0a) {
					// Found at least one line, but may need more for complete headers
					if (bufferLength - this.bufferOffset > this.options.maxHeaderLineLength) {
						return {
							complete: false,
							error: createError(
								ParserErrorCode.HEADER_VALUE_TOO_LONG,
								ParserState.HEADERS,
								this.bufferOffset
							),
							needsMoreData: false,
						};
					}
					break;
				}
			}

			// Check if we're at the end with just CRLF (empty headers)
			const remaining = bufferLength - this.bufferOffset;
			if (
				remaining === 2 &&
				this.buffer[this.bufferOffset] === 0x0d &&
				this.buffer[this.bufferOffset + 1] === 0x0a
			) {
				// Empty headers - just CRLF
				this.bufferOffset = bufferLength;
				return this.handleHeadersComplete(new HeadersMap());
			}

			return { complete: false, needsMoreData: true };
		}

		const headerBytes = this.buffer.slice(this.bufferOffset, headerEnd);
		const headerText = new TextDecoder("utf-8", { fatal: false }).decode(headerBytes);

		const parsedHeaders = parseHeaders(
			headerText,
			this.options.maxHeaders,
			this.options.maxHeaderLineLength
		);

		if (!parsedHeaders) {
			return {
				complete: false,
				error: createError(
					ParserErrorCode.INVALID_HEADER,
					ParserState.HEADERS,
					this.bufferOffset
				),
				needsMoreData: false,
			};
		}

		// Validate headers if configured
		if (this.options.validateHeaderNames || this.options.validateHeaderValues) {
			for (const [name, value] of parsedHeaders) {
				if (
					this.options.validateHeaderNames &&
					!isValidHeaderName(name, this.options.allowUnderscoreInHeaders)
				) {
					return {
						complete: false,
						error: createError(
							ParserErrorCode.INVALID_HEADER,
							ParserState.HEADERS,
							this.bufferOffset,
							`Invalid header name: ${name}`
						),
						needsMoreData: false,
					};
				}
				if (this.options.validateHeaderValues && !isValidHeaderValue(value)) {
					return {
						complete: false,
						error: createError(
							ParserErrorCode.INVALID_HEADER,
							ParserState.HEADERS,
							this.bufferOffset,
							`Invalid header value: ${name}`
						),
						needsMoreData: false,
					};
				}
			}
		}

		this.headers = parsedHeaders;
		this.bufferOffset = headerEnd + 4; // Skip CRLF CRLF

		// Use the common handler for both code paths
		return this.handleHeadersComplete(parsedHeaders);
	}

	/**
	 * Handles completion of headers parsing
	 * @param headers - The parsed headers
	 * @returns Parse result
	 */
	private handleHeadersComplete(headers: HeadersMap): {
		complete: boolean;
		needsMoreData: boolean;
		error?: ParserError;
	} {
		this.headers = headers;

		// Check Connection header
		const connection = this.headers.get("connection");
		if (connection) {
			this.keepAlive = connection.toLowerCase() !== "close";
		}

		// For HTTP/1.0, default to no keep-alive
		if (this.messageType === MT.RESPONSE && this.statusLine) {
			if (this.statusLine.version === HttpVersion.HTTP_1_0) {
				this.keepAlive = false;
			}
		}

		// Determine body handling
		const transferEncoding = this.headers.get("transfer-encoding");
		const contentLength = this.headers.get("content-length");

		if (transferEncoding) {
			const te = transferEncoding.toLowerCase();
			if (te.includes("chunked")) {
				this.state = ParserState.BODY_CHUNKED_SIZE;
				return { complete: false, needsMoreData: false };
			}
		}

		if (contentLength) {
			const length = parseContentLength(contentLength);
			if (length !== null) {
				this.bodyLength = length;
				if (this.bodyLength === 0) {
					// No body
					return this.createCompleteMessage();
				}
				this.state = ParserState.BODY_CONTENT_LENGTH;
				return { complete: false, needsMoreData: false };
			}
		}

		// No body expected
		return this.createCompleteMessage();
	}

	/**
	 * Parses body with Content-Length
	 */
	private parseBodyContentLength(): {
		complete: boolean;
		needsMoreData: boolean;
		error?: ParserError;
	} {
		const remaining = this.buffer.length - this.bufferOffset;

		if (remaining < this.bodyLength) {
			// Need more data
			this.appendToBody(this.buffer.slice(this.bufferOffset));
			this.bufferOffset = this.buffer.length;
			return { complete: false, needsMoreData: true };
		}

		// Have enough data
		const bodyData = this.buffer.slice(this.bufferOffset, this.bufferOffset + this.bodyLength);
		this.appendToBody(bodyData);
		this.bufferOffset += this.bodyLength;

		return this.createCompleteMessage();
	}

	/**
	 * Parses chunk size line in chunked encoding
	 */
	private parseChunkedSize(): { complete: boolean; needsMoreData: boolean; error?: ParserError } {
		// Find end of line (CRLF)
		let lineEnd = -1;
		for (let i = this.bufferOffset; i < this.buffer.length - 1; i++) {
			if (this.buffer[i] === 0x0d && this.buffer[i + 1] === 0x0a) {
				lineEnd = i;
				break;
			}
		}

		if (lineEnd === -1) {
			return { complete: false, needsMoreData: true };
		}

		const chunkSizeLine = new TextDecoder("utf-8", { fatal: false }).decode(
			this.buffer.slice(this.bufferOffset, lineEnd)
		);

		// Parse chunk size (may have extensions after semicolon)
		const sizeStr = chunkSizeLine.split(";")[0].trim();
		const size = parseChunkSize(sizeStr, this.options.maxBodySize);

		if (size === null) {
			return {
				complete: false,
				error: createError(
					ParserErrorCode.INVALID_CHUNK_SIZE,
					ParserState.BODY_CHUNKED_SIZE,
					this.bufferOffset
				),
				needsMoreData: false,
			};
		}

		this.chunkSize = size;
		this.chunkBytesRead = 0;
		this.bufferOffset = lineEnd + 2;

		if (size === 0) {
			// Last chunk
			this.state = ParserState.BODY_CHUNKED_TRAILER;
			return { complete: false, needsMoreData: false };
		}

		this.totalChunks++;
		if (this.totalChunks > this.options.maxChunks) {
			return {
				complete: false,
				error: createError(
					ParserErrorCode.BODY_TOO_LARGE,
					ParserState.BODY_CHUNKED_DATA,
					this.bufferOffset
				),
				needsMoreData: false,
			};
		}

		this.state = ParserState.BODY_CHUNKED_DATA;
		return { complete: false, needsMoreData: false };
	}

	/**
	 * Parses chunk data in chunked encoding
	 */
	private parseChunkedData(): { complete: boolean; needsMoreData: boolean; error?: ParserError } {
		const remaining = this.buffer.length - this.bufferOffset;
		const toRead = this.chunkSize - this.chunkBytesRead;

		if (remaining < toRead + 2) {
			// +2 for trailing CRLF
			if (remaining >= toRead) {
				// Partial chunk, need more data
				this.appendToBody(this.buffer.slice(this.bufferOffset, this.bufferOffset + toRead));
				this.chunkBytesRead += toRead;
				this.bufferOffset += toRead;
				return { complete: false, needsMoreData: true };
			}
			// Need more data for this chunk
			this.appendToBody(this.buffer.slice(this.bufferOffset));
			this.bufferOffset = this.buffer.length;
			return { complete: false, needsMoreData: true };
		}

		// Read chunk data
		const chunkData = this.buffer.slice(this.bufferOffset, this.bufferOffset + toRead);
		this.appendToBody(chunkData);
		this.bufferOffset += toRead;

		// Skip trailing CRLF
		if (
			this.buffer[this.bufferOffset] === 0x0d &&
			this.buffer[this.bufferOffset + 1] === 0x0a
		) {
			this.bufferOffset += 2;
		}

		this.state = ParserState.BODY_CHUNKED_SIZE;
		return { complete: false, needsMoreData: false };
	}

	/**
	 * Parses chunk trailer section
	 */
	private parseChunkedTrailer(): {
		complete: boolean;
		needsMoreData: boolean;
		error?: ParserError;
	} {
		// Find end of trailer (double CRLF or single CRLF at end)
		const bufferLength = this.buffer.length;
		for (let i = this.bufferOffset; i <= bufferLength - 4; i++) {
			if (
				this.buffer[i] === 0x0d &&
				this.buffer[i + 1] === 0x0a &&
				this.buffer[i + 2] === 0x0d &&
				this.buffer[i + 3] === 0x0a
			) {
				this.bufferOffset = i + 4;
				return this.createCompleteMessage();
			}
		}

		// Check for final CRLF without trailer headers
		if (
			bufferLength >= 2 &&
			this.buffer[bufferLength - 2] === 0x0d &&
			this.buffer[bufferLength - 1] === 0x0a
		) {
			this.bufferOffset = bufferLength;
			return this.createCompleteMessage();
		}

		return { complete: false, needsMoreData: true };
	}

	/**
	 * Appends data to the body
	 */
	private appendToBody(data: Uint8Array): void {
		if (!this.body) {
			this.body = data;
		} else {
			const newBody = new Uint8Array(this.body.length + data.length);
			newBody.set(this.body);
			newBody.set(data, this.body.length);
			this.body = newBody;
		}

		// Check body size limit
		if (this.body.length > this.options.maxBodySize) {
			this.state = ParserState.ERROR;
		}
	}

	/**
	 * Creates a complete message from parsed components
	 */
	private createCompleteMessage(): {
		complete: boolean;
		needsMoreData: boolean;
		message: HttpMessage;
	} {
		if (this.messageType === MT.REQUEST) {
			const request: HttpRequest = {
				body: this.body || new Uint8Array(0),
				complete: true,
				contentLength: this.body?.length,
				headers: this.headers!,
				keepAlive: this.keepAlive,
				requestLine: this.requestLine!,
				transferEncoding: TE.CONTENT_LENGTH,
				type: MT.REQUEST,
			};
			return { complete: true, message: request, needsMoreData: false };
		} else {
			const response: HttpResponse = {
				body: this.body || new Uint8Array(0),
				complete: true,
				contentLength: this.body?.length,
				headers: this.headers!,
				keepAlive: this.keepAlive,
				statusLine: this.statusLine!,
				transferEncoding: TE.CONTENT_LENGTH,
				type: MT.RESPONSE,
			};
			return { complete: true, message: response, needsMoreData: false };
		}
	}

	/**
	 * Appends data to the internal buffer
	 */
	private appendBuffer(data: Uint8Array): void {
		// Compact buffer first to remove parsed data
		if (this.bufferOffset > 0) {
			this.buffer = this.buffer.slice(this.bufferOffset);
			this.bufferOffset = 0;
		}

		// Append new data
		if (this.buffer.length === 0) {
			this.buffer = data;
		} else {
			const newBuffer = new Uint8Array(this.buffer.length + data.length);
			newBuffer.set(this.buffer);
			newBuffer.set(data, this.buffer.length);
			this.buffer = newBuffer;
		}
	}

	/**
	 * Compacts the buffer to remove parsed data
	 */
	private compactBuffer(): void {
		if (this.bufferOffset > 0) {
			this.buffer = this.buffer.slice(this.bufferOffset);
			this.bufferOffset = 0;
		}
	}

	/**
	 * Gets the current parser state
	 */
	getState(): ParserState {
		return this.state;
	}

	/**
	 * Gets the number of bytes currently buffered
	 */
	getBufferedBytes(): number {
		return this.buffer.length - this.bufferOffset;
	}
}

/**
 * Creates a complete HTTP request message
 * @param method - HTTP method
 * @param target - Request target
 * @param headers - Request headers
 * @param body - Optional request body
 * @returns Uint8Array containing the complete HTTP request
 */
export function createRequest(
	method: string,
	target: string,
	headers: Record<string, string>,
	body?: Uint8Array
): Uint8Array {
	const parts: Uint8Array[] = [];

	// Request line
	const requestLine: RequestLine = {
		method,
		target,
		version: HttpVersion.HTTP_1_1,
	};
	parts.push(formatRequestLine(requestLine));

	// Headers
	const encoder = new TextEncoder();
	for (const [name, value] of Object.entries(headers)) {
		parts.push(encoder.encode(`${name}: ${value}\r\n`));
	}

	// Content-Length header if body present
	if (body && body.length > 0) {
		parts.push(encoder.encode(`Content-Length: ${body.length}\r\n`));
	}

	// End of headers
	parts.push(new Uint8Array([0x0d, 0x0a]));

	// Body
	if (body && body.length > 0) {
		parts.push(body);
	}

	// Combine all parts
	const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
	const result = new Uint8Array(totalLength);
	let offset = 0;

	for (const part of parts) {
		result.set(part, offset);
		offset += part.length;
	}

	return result;
}

/**
 * Creates a complete HTTP response message
 * @param statusCode - HTTP status code
 * @param statusText - Status text
 * @param headers - Response headers
 * @param body - Optional response body
 * @param httpVersion - HTTP version (default: HTTP/1.1)
 * @returns Uint8Array containing the complete HTTP response
 */
export function createResponse(
	statusCode: number,
	headers: Record<string, string>,
	body?: Uint8Array,
	statusText?: string,
	httpVersion: string = HttpVersion.HTTP_1_1
): Uint8Array {
	const parts: Uint8Array[] = [];

	// Status line
	const statusLine: StatusLine = {
		statusCode,
		statusText: statusText || getStatusText(statusCode),
		version: httpVersion,
	};
	parts.push(formatStatusLine(statusLine));

	// Headers
	const encoder = new TextEncoder();
	for (const [name, value] of Object.entries(headers)) {
		parts.push(encoder.encode(`${name}: ${value}\r\n`));
	}

	// Content-Length header if body present
	if (body && body.length > 0) {
		parts.push(encoder.encode(`Content-Length: ${body.length}\r\n`));
	}

	// End of headers
	parts.push(new Uint8Array([0x0d, 0x0a]));

	// Body
	if (body && body.length > 0) {
		parts.push(body);
	}

	// Combine all parts
	const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
	const result = new Uint8Array(totalLength);
	let offset = 0;

	for (const part of parts) {
		result.set(part, offset);
		offset += part.length;
	}

	return result;
}
