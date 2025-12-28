/**
 * HTTP Parser Tests
 * Comprehensive test suite for the HTTP/1.x parser
 */

import { beforeEach, describe, expect, it } from "bun:test";
import {
	createRequest,
	createResponse,
	HeadersMap,
	HttpParser,
	type HttpRequest,
	MessageType,
	ParserState,
	parseHeaderLine,
	parseHeaders,
	parseRequestLine,
	parseStatusLine,
} from "../src/index";

describe("HttpParser", () => {
	let parser: HttpParser;

	beforeEach(() => {
		parser = new HttpParser();
	});

	describe("Request Parsing", () => {
		it("should parse a simple GET request", () => {
			const requestData = new TextEncoder().encode(
				"GET / HTTP/1.1\r\nHost: example.com\r\n\r\n"
			);
			const messages = parser.parse(requestData);

			expect(messages.length).toBe(1);
			expect(messages[0].type).toBe(MessageType.REQUEST);
			expect(messages[0].complete).toBe(true);
		});

		it("should parse a GET request with headers", () => {
			const requestData = new TextEncoder().encode(
				"GET /api/users HTTP/1.1\r\nHost: example.com\r\nAccept: application/json\r\nAuthorization: Bearer token123\r\n\r\n"
			);
			const messages = parser.parse(requestData);

			expect(messages.length).toBe(1);
			expect(messages[0].type).toBe(MessageType.REQUEST);
			const request = messages[0] as HttpRequest;
			expect(request.headers.get("host")).toBe("example.com");
			expect(request.headers.get("accept")).toBe("application/json");
		});

		it("should parse a POST request with body", () => {
			const body = JSON.stringify({ name: "test" });
			const requestData = new TextEncoder().encode(
				`POST /api/data HTTP/1.1\r\nHost: example.com\r\nContent-Type: application/json\r\nContent-Length: ${body.length}\r\n\r\n${body}`
			);
			const messages = parser.parse(requestData);

			expect(messages.length).toBe(1);
			expect(messages[0].type).toBe(MessageType.REQUEST);
			expect(messages[0].body.length).toBe(body.length);
		});

		it("should handle partial data", () => {
			const partialData = new TextEncoder().encode("GET / HTTP/1.1\r\nHost: example");
			const messages = parser.parse(partialData);

			expect(messages.length).toBe(0);
			expect(parser.getState()).not.toBe(ParserState.IDLE);
			expect(parser.getBufferedBytes()).toBeGreaterThan(0);
		});

		it("should handle pipelined requests", () => {
			const pipelinedData = new TextEncoder().encode(
				"GET /1 HTTP/1.1\r\nHost: example.com\r\n\r\n" +
					"GET /2 HTTP/1.1\r\nHost: example.com\r\n\r\n" +
					"GET /3 HTTP/1.1\r\nHost: example.com\r\n\r\n"
			);
			const messages = parser.parse(pipelinedData);

			expect(messages.length).toBe(3);
			expect(messages[0].type).toBe(MessageType.REQUEST);
			expect(messages[1].type).toBe(MessageType.REQUEST);
			expect(messages[2].type).toBe(MessageType.REQUEST);
		});
	});

	describe("Response Parsing", () => {
		it("should parse a simple HTTP response", () => {
			const responseData = new TextEncoder().encode(
				"HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nContent-Length: 5\r\n\r\nHello"
			);
			const messages = parser.parse(responseData);

			expect(messages.length).toBe(1);
			expect(messages[0].type).toBe(MessageType.RESPONSE);
			expect(messages[0].complete).toBe(true);
		});

		it("should parse 404 response", () => {
			const responseData = new TextEncoder().encode(
				"HTTP/1.1 404 Not Found\r\nContent-Type: text/html\r\nContent-Length: 9\r\n\r\nNot Found"
			);
			const messages = parser.parse(responseData);

			expect(messages.length).toBe(1);
			expect(messages[0].type).toBe(MessageType.RESPONSE);
		});

		it("should parse 500 response", () => {
			const responseData = new TextEncoder().encode(
				"HTTP/1.1 500 Internal Server Error\r\n\r\n"
			);
			const messages = parser.parse(responseData);

			expect(messages.length).toBe(1);
			expect(messages[0].type).toBe(MessageType.RESPONSE);
		});

		it("should parse HTTP/1.0 response", () => {
			const responseData = new TextEncoder().encode(
				"HTTP/1.0 200 OK\r\nContent-Type: text/plain\r\nContent-Length: 5\r\n\r\nHello"
			);
			const messages = parser.parse(responseData);

			expect(messages.length).toBe(1);
			expect(messages[0].type).toBe(MessageType.RESPONSE);
		});
	});

	describe("Chunked Transfer Encoding", () => {
		it("should parse chunked response", () => {
			const chunkedResponse =
				"HTTP/1.1 200 OK\r\n" +
				"Transfer-Encoding: chunked\r\n" +
				"\r\n" +
				"5\r\n" +
				"Hello\r\n" +
				"6\r\n" +
				" World\r\n" +
				"0\r\n" +
				"\r\n";
			const responseData = new TextEncoder().encode(chunkedResponse);
			const messages = parser.parse(responseData);

			expect(messages.length).toBe(1);
			expect(messages[0].type).toBe(MessageType.RESPONSE);
			const body = new TextDecoder().decode(messages[0].body);
			expect(body).toBe("Hello World");
		});

		it("should parse chunked response with extensions", () => {
			const chunkedResponse =
				"HTTP/1.1 200 OK\r\n" +
				"Transfer-Encoding: chunked\r\n" +
				"\r\n" +
				"5;token=value\r\n" +
				"Hello\r\n" +
				"0\r\n" +
				"\r\n";
			const responseData = new TextEncoder().encode(chunkedResponse);
			const messages = parser.parse(responseData);

			expect(messages.length).toBe(1);
			const body = new TextDecoder().decode(messages[0].body);
			expect(body).toBe("Hello");
		});
	});

	describe("Keep-Alive", () => {
		it("should set keep-alive for HTTP/1.1 by default", () => {
			const requestData = new TextEncoder().encode(
				"GET / HTTP/1.1\r\nHost: example.com\r\n\r\n"
			);
			const messages = parser.parse(requestData);

			expect(messages[0].keepAlive).toBe(true);
		});

		it("should set keep-alive to false when Connection: close", () => {
			const requestData = new TextEncoder().encode(
				"GET / HTTP/1.1\r\nHost: example.com\r\nConnection: close\r\n\r\n"
			);
			const messages = parser.parse(requestData);

			expect(messages[0].keepAlive).toBe(false);
		});

		it("should set keep-alive to false for HTTP/1.0 by default", () => {
			const responseData = new TextEncoder().encode(
				"HTTP/1.0 200 OK\r\nContent-Type: text/plain\r\nContent-Length: 5\r\n\r\nHello"
			);
			const messages = parser.parse(responseData);

			expect(messages[0].keepAlive).toBe(false);
		});
	});

	describe("Error Handling", () => {
		it("should handle invalid HTTP method", () => {
			// Use a method with invalid characters (space) - per RFC 7231, methods must be tokens
			const requestData = new TextEncoder().encode(
				"INVALID METHOD / HTTP/1.1\r\nHost: example.com\r\n\r\n"
			);
			const messages = parser.parse(requestData);

			expect(parser.getState()).toBe(ParserState.ERROR);
			expect(messages.length).toBe(0);
		});

		it("should handle invalid HTTP version", () => {
			const requestData = new TextEncoder().encode(
				"GET / HTTP/2.0\r\nHost: example.com\r\n\r\n"
			);
			const _messages = parser.parse(requestData);

			expect(parser.getState()).toBe(ParserState.ERROR);
		});

		it("should handle missing request line", () => {
			const requestData = new TextEncoder().encode("");
			const messages = parser.parse(requestData);

			expect(messages.length).toBe(0);
			expect(parser.getState()).not.toBe(ParserState.ERROR);
		});
	});

	describe("Reset", () => {
		it("should reset parser state", () => {
			const partialData = new TextEncoder().encode("GET / HTTP/1.1\r\n");
			parser.parse(partialData);

			expect(parser.getState()).not.toBe(ParserState.IDLE);

			parser.reset();

			expect(parser.getState()).toBe(ParserState.IDLE);
			expect(parser.getBufferedBytes()).toBe(0);
		});
	});
});

describe("HeadersMap", () => {
	describe("Basic Operations", () => {
		it("should get header value case-insensitively", () => {
			const headers = new HeadersMap();
			headers.set("Content-Type", "application/json");

			expect(headers.get("content-type")).toBe("application/json");
			expect(headers.get("Content-Type")).toBe("application/json");
			expect(headers.get("CONTENT-TYPE")).toBe("application/json");
		});

		it("should append header values", () => {
			const headers = new HeadersMap();
			headers.append("Set-Cookie", "cookie1=value1");
			headers.append("Set-Cookie", "cookie2=value2");

			expect(headers.get("set-cookie")).toBe("cookie1=value1, cookie2=value2");
			expect(headers.getAll("set-cookie")).toEqual(["cookie1=value1", "cookie2=value2"]);
		});

		it("should check if header exists", () => {
			const headers = new HeadersMap();
			headers.set("X-Custom", "value");

			expect(headers.has("x-custom")).toBe(true);
			expect(headers.has("not-existent")).toBe(false);
		});

		it("should delete header", () => {
			const headers = new HeadersMap();
			headers.set("X-Custom", "value");

			expect(headers.has("x-custom")).toBe(true);

			headers.delete("X-Custom");

			expect(headers.has("x-custom")).toBe(false);
		});

		it("should return header names", () => {
			const headers = new HeadersMap();
			headers.set("Content-Type", "application/json");
			headers.set("X-Custom", "value");

			const names = headers.names();
			expect(names.length).toBe(2);
			expect(names.sort()).toEqual(["Content-Type", "X-Custom"]);
		});

		it("should return size", () => {
			const headers = new HeadersMap();
			expect(headers.size).toBe(0);

			headers.set("Content-Type", "application/json");
			expect(headers.size).toBe(1);

			headers.set("X-Custom", "value");
			expect(headers.size).toBe(2);
		});

		it("should clear all headers", () => {
			const headers = new HeadersMap();
			headers.set("Content-Type", "application/json");
			headers.set("X-Custom", "value");

			headers.clear();

			expect(headers.size).toBe(0);
		});
	});

	describe("Conversion", () => {
		it("should convert to object", () => {
			const headers = new HeadersMap();
			headers.set("Content-Type", "application/json");
			headers.set("X-Custom", "value");

			const obj = headers.toObject();

			expect(obj["content-type"]).toBe("application/json");
			expect(obj["x-custom"]).toBe("value");
		});

		it("should clone headers", () => {
			const headers = new HeadersMap();
			headers.set("Content-Type", "application/json");

			const cloned = headers.clone();

			expect(cloned.get("content-type")).toBe("application/json");

			cloned.set("X-Custom", "value");
			expect(headers.has("x-custom")).toBe(false);
		});

		it("should serialize to bytes", () => {
			const headers = new HeadersMap();
			headers.set("Content-Type", "application/json");

			const bytes = headers.toBytes();
			const str = new TextDecoder().decode(bytes);

			expect(str).toBe("Content-Type: application/json\r\n\r\n");
		});
	});

	describe("Iterator", () => {
		it("should iterate over headers", () => {
			const headers = new HeadersMap();
			headers.set("Content-Type", "application/json");
			headers.set("X-Custom", "value");

			const entries = Array.from(headers.entries());

			expect(entries.length).toBe(2);
		});
	});
});

describe("parseHeaderLine", () => {
	it("should parse valid header line", () => {
		const result = parseHeaderLine("Content-Type: application/json");

		expect(result).not.toBeNull();
		expect(result?.[0]).toBe("Content-Type");
		expect(result?.[1]).toBe("application/json");
	});

	it("should handle header with leading/trailing whitespace", () => {
		const result = parseHeaderLine("  Content-Type  :  application/json  ");

		expect(result).not.toBeNull();
		expect(result?.[0]).toBe("Content-Type");
		expect(result?.[1]).toBe("application/json");
	});

	it("should return null for missing colon", () => {
		const result = parseHeaderLine("Content-Type application/json");

		expect(result).toBeNull();
	});

	it("should return null for empty name", () => {
		const result = parseHeaderLine(": application/json");

		expect(result).toBeNull();
	});

	it("should return null for empty value", () => {
		const result = parseHeaderLine("Content-Type:");

		expect(result).toBeNull();
	});
});

describe("parseHeaders", () => {
	it("should parse multiple headers", () => {
		const headerText =
			"Content-Type: application/json\r\n" +
			"X-Custom: value\r\n" +
			"Authorization: Bearer token";

		const headers = parseHeaders(headerText);

		expect(headers).not.toBeNull();
		expect(headers?.size).toBe(3);
		expect(headers?.get("content-type")).toBe("application/json");
	});

	it("should handle empty header text", () => {
		const headers = parseHeaders("");

		expect(headers).not.toBeNull();
		expect(headers?.size).toBe(0);
	});

	it("should return null for too many headers", () => {
		let headerText = "";
		for (let i = 0; i < 300; i++) {
			headerText += `Header-${i}: value\r\n`;
		}

		const headers = parseHeaders(headerText, 256);

		expect(headers).toBeNull();
	});
});

describe("parseRequestLine", () => {
	it("should parse valid request line", () => {
		const data = new TextEncoder().encode("GET / HTTP/1.1");
		const result = parseRequestLine(data);

		expect(result.requestLine).not.toBeNull();
		expect(result.requestLine?.method).toBe("GET");
		expect(result.requestLine?.target).toBe("/");
		expect(result.requestLine?.version).toBe("HTTP/1.1");
		expect(result.bytesConsumed).toBe(14);
		expect(result.needsMoreData).toBe(false);
	});

	it("should handle partial request line", () => {
		const data = new TextEncoder().encode("GET /");
		const result = parseRequestLine(data);

		expect(result.requestLine).toBeNull();
		expect(result.needsMoreData).toBe(true);
	});

	it("should parse request with query string", () => {
		const data = new TextEncoder().encode("GET /api/users?id=123 HTTP/1.1");
		const result = parseRequestLine(data);

		expect(result.requestLine).not.toBeNull();
		expect(result.requestLine?.target).toBe("/api/users?id=123");
	});

	it("should parse absolute URL", () => {
		const data = new TextEncoder().encode("GET http://example.com/path HTTP/1.1");
		const result = parseRequestLine(data);

		expect(result.requestLine).not.toBeNull();
		expect(result.requestLine?.target).toBe("http://example.com/path");
	});
});

describe("parseStatusLine", () => {
	it("should parse valid status line", () => {
		const data = new TextEncoder().encode("HTTP/1.1 200 OK");
		const result = parseStatusLine(data);

		expect(result.statusLine).not.toBeNull();
		expect(result.statusLine?.version).toBe("HTTP/1.1");
		expect(result.statusLine?.statusCode).toBe(200);
		expect(result.statusLine?.statusText).toBe("OK");
	});

	it("should parse status line with custom reason", () => {
		const data = new TextEncoder().encode("HTTP/1.1 404 Not Found Here");
		const result = parseStatusLine(data);

		expect(result.statusLine).not.toBeNull();
		expect(result.statusLine?.statusCode).toBe(404);
		expect(result.statusLine?.statusText).toBe("Not Found Here");
	});

	it("should parse HTTP/1.0 status line", () => {
		const data = new TextEncoder().encode("HTTP/1.0 200 OK");
		const result = parseStatusLine(data);

		expect(result.statusLine).not.toBeNull();
		expect(result.statusLine?.version).toBe("HTTP/1.0");
	});

	it("should handle partial status line", () => {
		const data = new TextEncoder().encode("HTTP/1.1 200");
		const result = parseStatusLine(data);

		expect(result.statusLine).toBeNull();
		expect(result.needsMoreData).toBe(true);
	});
});

describe("createRequest", () => {
	it("should create a simple GET request", () => {
		const request = createRequest("GET", "/", {
			Host: "example.com",
		});

		const str = new TextDecoder().decode(request);
		expect(str).toBe("GET / HTTP/1.1\r\nHost: example.com\r\n\r\n");
	});

	it("should create a POST request with body", () => {
		const body = new TextEncoder().encode("Hello World");
		const request = createRequest(
			"POST",
			"/submit",
			{
				"Content-Type": "text/plain",
				Host: "example.com",
			},
			body
		);

		const str = new TextDecoder().decode(request);
		expect(str).toContain("Content-Length: 11");
		expect(str).toContain("Hello World");
	});
});

describe("createResponse", () => {
	it("should create a simple response", () => {
		const response = createResponse(
			200,
			{
				"Content-Type": "text/plain",
			},
			undefined,
			"OK"
		);

		const str = new TextDecoder().decode(response);
		expect(str).toBe("HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\n\r\n");
	});

	it("should create a 404 response", () => {
		const response = createResponse(404, {
			"Content-Type": "text/html",
		});

		const str = new TextDecoder().decode(response);
		expect(str).toContain("HTTP/1.1 404 Not Found");
		expect(str).toContain("Content-Type: text/html");
	});

	it("should create response with body", () => {
		const body = new TextEncoder().encode("Error message");
		const response = createResponse(
			500,
			{
				"Content-Type": "text/plain",
			},
			body
		);

		const str = new TextDecoder().decode(response);
		expect(str).toContain("Content-Length: 13");
		expect(str).toContain("Error message");
	});
});
