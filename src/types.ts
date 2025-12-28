/**
 * Core type definitions for HTTP/1.x parser
 * Provides type-safe interfaces for HTTP requests and responses
 */

/**
 * HTTP method enumeration
 * Contains all standard HTTP methods defined in RFC 7231
 */
export enum HttpMethod {
	GET = "GET",
	HEAD = "HEAD",
	POST = "POST",
	PUT = "PUT",
	DELETE = "DELETE",
	CONNECT = "CONNECT",
	OPTIONS = "OPTIONS",
	TRACE = "TRACE",
	PATCH = "PATCH",
}

/**
 * HTTP version enumeration
 * Supports HTTP/1.0 and HTTP/1.1
 */
export enum HttpVersion {
	HTTP_1_0 = "HTTP/1.0",
	HTTP_1_1 = "HTTP/1.1",
}

/**
 * HTTP status code categories
 * Used for quick classification of response status
 */
export enum HttpStatusCategory {
	INFORMATIONAL = 1, // 1xx
	SUCCESS = 2, // 2xx
	REDIRECTION = 3, // 3xx
	CLIENT_ERROR = 4, // 4xx
	SERVER_ERROR = 5, // 5xx
}

/**
 * Parsed HTTP request line components
 */
export interface RequestLine {
	/** The HTTP method (GET, POST, etc.) */
	method: HttpMethod | string;
	/** The request target (path, absolute URL, or authority) */
	target: string;
	/** The HTTP version string */
	version: HttpVersion | string;
}

/**
 * Parsed HTTP response status line components
 */
export interface StatusLine {
	/** The HTTP version string */
	version: HttpVersion | string;
	/** The numeric status code (200, 404, 500, etc.) */
	statusCode: number;
	/** The status text/reason phrase */
	statusText: string;
}

/**
 * HTTP header name and value pair
 */
export interface Header {
	/** The header field name (case-insensitive in HTTP) */
	name: string;
	/** The header field value */
	value: string;
}

/**
 * Parsed HTTP headers as a map
 * Maintains original case for header names while providing case-insensitive access
 */
export interface Headers {
	/** Get header value by case-insensitive name */
	get(name: string): string | undefined;
	/** Check if header exists (case-insensitive) */
	has(name: string): boolean;
	/** Get all header values for a given name */
	getAll(name: string): string[];
	/** Get header names (preserving original case) */
	names(): string[];
	/** Get entries as iterator */
	entries(): IterableIterator<[string, string]>;
	/** Convert to plain object */
	toObject(): Record<string, string>;
	/** Size of headers collection */
	readonly size: number;
}

/**
 * HTTP message type discriminator
 */
export enum MessageType {
	REQUEST = "request",
	RESPONSE = "response",
}

/**
 * Represents a complete HTTP message (request or response)
 */
export interface HttpMessage {
	/** Type of message: request or response */
	type: MessageType;
	/** Parsed message body (raw bytes) */
	body: Uint8Array;
	/** Whether this is the final chunk of data */
	complete: boolean;
	/** HTTP/1.1 keep-alive indicator */
	keepAlive: boolean;
	/** Transfer encoding used for body */
	transferEncoding: TransferEncoding;
	/** Content length (if known) */
	contentLength?: number;
	/** Chunk size for chunked transfer encoding */
	chunkSize?: number;
}

/**
 * HTTP request message extending base HttpMessage
 */
export interface HttpRequest extends HttpMessage {
	type: MessageType.REQUEST;
	/** The request line components */
	requestLine: RequestLine;
	/** The request headers */
	headers: Headers;
}

/**
 * HTTP response message extending base HttpMessage
 */
export interface HttpResponse extends HttpMessage {
	type: MessageType.RESPONSE;
	/** The status line components */
	statusLine: StatusLine;
	/** The response headers */
	headers: Headers;
}

/**
 * Transfer encoding types for HTTP body
 */
export enum TransferEncoding {
	/** Content-Length specified body */
	CONTENT_LENGTH = "content-length",
	/** Chunked transfer encoding */
	CHUNKED = "chunked",
	/** Identity encoding (no transformation) */
	IDENTITY = "identity",
	/** Gzip compression */
	GZIP = "gzip",
	/** Deflate compression */
	DEFLATE = "deflate",
	/** Brotli compression */
	BR = "br",
	/** Connection closed (no body) */
	CLOSE = "close",
	/** Unknown encoding */
	UNKNOWN = "unknown",
}

/**
 * Parser configuration options
 */
export interface ParserOptions {
	/** Maximum allowed headers (default: 256) */
	maxHeaders?: number;
	/** Maximum header line length in bytes (default: 8192) */
	maxHeaderLineLength?: number;
	/** Maximum body size in bytes (default: 10MB) */
	maxBodySize?: number;
	/** Maximum number of chunks for chunked encoding (default: 10000) */
	maxChunks?: number;
	/** Whether to validate header field names (default: true) */
	validateHeaderNames?: boolean;
	/** Whether to validate header field values (default: true) */
	validateHeaderValues?: boolean;
	/** Whether to allow underscores in header names (default: true) */
	allowUnderscoreInHeaders?: boolean;
	/** Whether to support HTTP pipelining (default: false) */
	enablePipelining?: boolean;
	/** Inactivity timeout in milliseconds (default: 30000) */
	inactivityTimeout?: number;
}

/**
 * Parser state enumeration
 */
export enum ParserState {
	/** Initial state, waiting for message start */
	IDLE = "idle",
	/** Parsing request/status line */
	REQUEST_LINE = "request_line",
	/** Parsing status line (response) */
	STATUS_LINE = "status_line",
	/** Parsing headers */
	HEADERS = "headers",
	/** Parsing body with content-length */
	BODY_CONTENT_LENGTH = "body_content_length",
	/** Parsing chunked body */
	BODY_CHUNKED = "body_chunked",
	/** Parsing chunk size line */
	BODY_CHUNKED_SIZE = "body_chunked_size",
	/** Parsing chunk data */
	BODY_CHUNKED_DATA = "body_chunked_data",
	/** Parsing chunk trailer */
	BODY_CHUNKED_TRAILER = "body_chunked_trailer",
	/** Complete message received */
	COMPLETE = "complete",
	/** Parser error state */
	ERROR = "error",
}

/**
 * Parser error codes
 */
export enum ParserErrorCode {
	/** Invalid HTTP method */
	INVALID_METHOD = "INVALID_METHOD",
	/** Invalid HTTP version */
	INVALID_VERSION = "INVALID_VERSION",
	/** Invalid request target */
	INVALID_TARGET = "INVALID_TARGET",
	/** Invalid status code */
	INVALID_STATUS_CODE = "INVALID_STATUS_CODE",
	/** Invalid header line */
	INVALID_HEADER = "INVALID_HEADER",
	/** Header name too long */
	HEADER_NAME_TOO_LONG = "HEADER_NAME_TOO_LONG",
	/** Header value too long */
	HEADER_VALUE_TOO_LONG = "HEADER_VALUE_TOO_LONG",
	/** Too many headers */
	TOO_MANY_HEADERS = "TOO_MANY_HEADERS",
	/** Invalid content length */
	INVALID_CONTENT_LENGTH = "INVALID_CONTENT_LENGTH",
	/** Body too large */
	BODY_TOO_LARGE = "BODY_TOO_LARGE",
	/** Invalid chunk size */
	INVALID_CHUNK_SIZE = "INVALID_CHUNK_SIZE",
	/** Incomplete chunk data */
	INCOMPLETE_CHUNK = "INCOMPLETE_CHUNK",
	/** Invalid chunk trailer */
	INVALID_CHUNK_TRAILER = "INVALID_CHUNK_TRAILER",
	/** Parser timeout */
	TIMEOUT = "TIMEOUT",
	/** Connection closed unexpectedly */
	CONNECTION_CLOSED = "CONNECTION_CLOSED",
	/** Unknown parser error */
	UNKNOWN = "UNKNOWN",
}

/**
 * Parser error with detailed information
 */
export interface ParserError {
	/** Error code */
	code: ParserErrorCode;
	/** Human-readable error message */
	message: string;
	/** Position in input where error occurred */
	position?: number;
	/** State when error occurred */
	state: ParserState;
	/** Additional error details */
	details?: unknown;
}

/**
 * Result of a parsing operation
 */
export interface ParseResult<T extends HttpMessage> {
	/** The parsed message (undefined if incomplete) */
	message?: T;
	/** Number of bytes consumed from input */
	bytesConsumed: number;
	/** Whether more data is needed */
	needsMoreData: boolean;
	/** Error if parsing failed */
	error?: ParserError;
}

/**
 * Chunk metadata for chunked transfer encoding
 */
export interface ChunkInfo {
	/** Size of the current chunk in bytes */
	size: number;
	/** Whether this is the last chunk */
	isLast: boolean;
	/** Extensions for this chunk (if any) */
	extensions?: string;
}

/**
 * Event types that can be emitted by the parser
 */
export enum ParserEvent {
	/** Request line parsed */
	REQUEST_LINE = "request_line",
	/** Status line parsed */
	STATUS_LINE = "status_line",
	/** Header parsed */
	HEADER = "header",
	/** All headers parsed */
	HEADERS_COMPLETE = "headers_complete",
	/** Chunk parsed (chunked encoding) */
	CHUNK = "chunk",
	/** Body chunk parsed */
	BODY_CHUNK = "body_chunk",
	/** Message complete */
	MESSAGE_COMPLETE = "message_complete",
	/** Error occurred */
	ERROR = "error",
	/** Timeout warning */
	TIMEOUT_WARNING = "timeout_warning",
}
