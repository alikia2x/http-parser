# @alikia/http-parser

A robust, production-ready HTTP/1.x request and response parser written in native TypeScript. Designed for universal JavaScript runtime compatibility (Node.js, Deno, Bun, Cloudflare Workers, browsers) and publishable to npm and JSR.

## Features

- **Full HTTP/1.x Support**: Parses both requests and responses
- **Streaming Parser**: Memory-efficient incremental parsing for large messages
- **HTTP Pipelining**: Handles multiple pipelined requests/responses
- **Chunked Transfer Encoding**: Native support for chunked body encoding
- **Case-Insensitive Headers**: Convenient header access with original case preservation
- **Multi-Runtime**: Works seamlessly across all JavaScript environments
- **Type-Safe**: Full TypeScript definitions with comprehensive types
- **Error Handling**: Detailed error codes and messages for debugging

## Installation

```bash
# Using Bun
bun add @alikia/http-parser

# Using npm
npm install @alikia/http-parser

# Using pnpm
pnpm add @alikia/http-parser
```

## Quick Start

```typescript
import { HttpParser, MessageType } from '@alikia/http-parser';

// Create parser instance
const parser = new HttpParser();

// Parse HTTP data (Uint8Array)
const data = new TextEncoder().encode(
  'GET /api/users HTTP/1.1\r\n' +
  'Host: example.com\r\n' +
  'Accept: application/json\r\n' +
  '\r\n'
);

const messages = parser.parse(data);

for (const message of messages) {
  if (message.type === MessageType.REQUEST) {
    console.log(`Request: ${message.method} ${message.target}`);
    console.log(`Headers:`, message.headers.toObject());
  }
}
```

## API Reference

### HttpParser

The main parser class for parsing HTTP messages.

```typescript
import { HttpParser } from '@alikia/http-parser';

const parser = new HttpParser(options?: ParserOptions);
```

#### Methods

##### `parse(data: Uint8Array): HttpMessage[]`

Parses HTTP data and returns an array of complete messages. Can return multiple messages for pipelined requests.

```typescript
const messages = parser.parse(new TextEncoder().encode(requestData));
```

##### `reset(): void`

Resets the parser to initial state, clearing internal buffer and state.

```typescript
parser.reset();
```

##### `getState(): ParserState`

Returns the current parser state.

```typescript
const state = parser.getState();
// Returns: 'idle' | 'request_line' | 'status_line' | 'headers' | 
//          'body_content_length' | 'body_chunked_size' | 'body_chunked_data' | 
//          'body_chunked_trailer' | 'complete' | 'error'
```

##### `getBufferedBytes(): number`

Returns the number of bytes currently buffered.

```typescript
const buffered = parser.getBufferedBytes();
```

### HeadersMap

A case-insensitive map for HTTP headers.

```typescript
import { HeadersMap } from '@alikia/http-parser';

const headers = new HeadersMap();
headers.set('Content-Type', 'application/json');
headers.append('Set-Cookie', 'cookie1=value1');
headers.append('Set-Cookie', 'cookie2=value2');

headers.get('content-type'); // 'application/json'
headers.getAll('set-cookie'); // ['cookie1=value1', 'cookie2=value2']
```

#### Methods

- `set(name: string, value: string)`: Set a header value
- `append(name: string, value: string)`: Append a header value
- `get(name: string)`: Get header value (case-insensitive, comma-separated for duplicates)
- `getAll(name: string)`: Get all values for a header
- `has(name: string)`: Check if header exists
- `delete(name: string)`: Delete a header
- `names()`: Get all header names
- `size`: Get the number of headers
- `clear()`: Clear all headers
- `toObject()`: Convert to plain object
- `clone()`: Create a copy
- `toBytes()`: Serialize to Uint8Array

### parseRequestLine

Parses an HTTP request line.

```typescript
import { parseRequestLine } from '@alikia/http-parser';

const result = parseRequestLine(new TextEncoder().encode('GET / HTTP/1.1'));
// { requestLine: { method: 'GET', target: '/', version: 'HTTP/1.1' }, bytesConsumed: 14, needsMoreData: false }
```

### parseStatusLine

Parses an HTTP status line.

```typescript
import { parseStatusLine } from '@alikia/http-parser';

const result = parseStatusLine(new TextEncoder().encode('HTTP/1.1 200 OK'));
// { statusLine: { version: 'HTTP/1.1', statusCode: 200, statusText: 'OK' }, bytesConsumed: 15, needsMoreData: false }
```

### parseHeaders

Parses HTTP header fields.

```typescript
import { parseHeaders } from '@alikia/http-parser';

const headers = parseHeaders('Content-Type: application/json\r\nHost: example.com\r\n');
```

### createRequest

Creates an HTTP request message.

```typescript
import { createRequest } from '@alikia/http-parser';

const request = createRequest('POST', '/submit', {
  'Content-Type': 'application/json',
  'Host': 'example.com'
}, new TextEncoder().encode('{"data": "test"}'));
// Returns Uint8Array of the HTTP request
```

### createResponse

Creates an HTTP response message.

```typescript
import { createResponse } from '@alikia/http-parser';

const response = createResponse(200, {
  'Content-Type': 'text/plain'
}, new TextEncoder().encode('Hello World'), 'OK');
// Returns Uint8Array of the HTTP response
```

## Message Structure

### HttpRequest

```typescript
interface HttpRequest {
  type: MessageType.REQUEST;
  method: string;
  target: string;
  version: HttpVersion;
  headers: HeadersMap;
  body: Uint8Array;
  complete: boolean;
  keepAlive: boolean;
}
```

### HttpResponse

```typescript
interface HttpResponse {
  type: MessageType.RESPONSE;
  version: HttpVersion;
  statusCode: number;
  statusText: string;
  headers: HeadersMap;
  body: Uint8Array;
  complete: boolean;
  keepAlive: boolean;
}
```

## Error Handling

```typescript
import { HttpParser, ParserState } from '@alikia/http-parser';

const parser = new HttpParser();

try {
  const messages = parser.parse(data);
  
  if (parser.getState() === ParserState.ERROR) {
    console.error('Parsing error occurred');
  }
} catch (error) {
  console.error('Unexpected error:', error);
}
```

### Parser States

| State | Description |
|-------|-------------|
| `idle` | Ready for new message |
| `request_line` | Parsing request line |
| `status_line` | Parsing status line |
| `headers` | Parsing headers |
| `body_content_length` | Parsing body with Content-Length |
| `body_chunked_size` | Parsing chunk size |
| `body_chunked_data` | Parsing chunk data |
| `body_chunked_trailer` | Parsing chunk trailer |
| `complete` | Message complete |
| `error` | Error occurred |

## Streaming Example

```typescript
import { HttpParser } from '@alikia/http-parser';

const parser = new HttpParser();
const messages: HttpMessage[] = [];

// Simulate streaming data
const chunks = [
  new TextEncoder().encode('GET /api/da'),
  new TextEncoder().encode('ta HTTP/1.1\r\nHost: '),
  new TextEncoder().encode('example.com\r\n\r\n'),
];

for (const chunk of chunks) {
  const newMessages = parser.parse(chunk);
  messages.push(...newMessages);
}

console.log(`Parsed ${messages.length} complete messages`);
```

## HTTP Pipelining

```typescript
const parser = new HttpParser();

const pipelinedData = new TextEncoder().encode(
  'GET /1 HTTP/1.1\r\nHost: example.com\r\n\r\n' +
  'GET /2 HTTP/1.1\r\nHost: example.com\r\n\r\n' +
  'GET /3 HTTP/1.1\r\nHost: example.com\r\n\r\n'
);

const messages = parser.parse(pipelinedData);
console.log(`Parsed ${messages.length} pipelined requests`); // 3
```

## Browser Usage

```html
<!DOCTYPE html>
<html>
<head>
  <script type="module">
    import { HttpParser, MessageType } from './dist/http-parser.esm.js';
    
    const parser = new HttpParser();
    
    // Parse response from fetch
    const response = await fetch('https://example.com/api');
    const arrayBuffer = await response.arrayBuffer();
    const messages = parser.parse(new Uint8Array(arrayBuffer));
    
    console.log(messages);
  </script>
</head>
</html>
```

## TypeScript Support

This package includes full TypeScript definitions. No extra installation required.

```typescript
import { HttpParser, HttpRequest, HttpResponse } from '@alikia/http-parser';

function handleMessage(message: HttpRequest | HttpResponse) {
  if (message.type === MessageType.REQUEST) {
    // TypeScript knows this is HttpRequest
    console.log(message.method);
  } else {
    // TypeScript knows this is HttpResponse
    console.log(message.statusCode);
  }
}
```

## Building

```bash
# Development
bun run dev

# Build
bun run build

# Run tests
bun test

# Type check
bun run typecheck
```

## Compatibility

Tested and works on:

- Node.js 18+
- Deno 1.28+
- Bun 1.0+
- Cloudflare Workers
- Modern browsers (ES2022)

## License

MIT

## Contributing

Contributions are welcome! Please read the contributing guidelines before submitting PRs.
