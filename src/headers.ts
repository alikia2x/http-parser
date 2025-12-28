/**
 * HTTP Headers implementation
 * Provides case-insensitive header access while preserving original case
 */

import type { Header, Headers } from "./types";

/**
 * Efficient headers map with case-insensitive access
 * Supports multiple values for the same header name (e.g., Set-Cookie)
 */
export class HeadersMap implements Headers {
	private readonly headers: Map<string, Header>;
	private readonly lowerCaseMap: Map<string, string[]>;

	/**
	 * Creates a new HeadersMap instance
	 * @param initialHeaders - Optional initial headers
	 */
	constructor(initialHeaders?: Header[]) {
		this.headers = new Map();
		this.lowerCaseMap = new Map();

		if (initialHeaders) {
			for (const header of initialHeaders) {
				this.append(header.name, header.value);
			}
		}
	}

	/**
	 * Gets a header value by case-insensitive name
	 * Returns comma-separated values for headers with multiple values
	 * @param name - The header name (case-insensitive)
	 * @returns The header value or undefined if not found
	 */
	get(name: string): string | undefined {
		const lowerName = name.toLowerCase();
		const originalNames = this.lowerCaseMap.get(lowerName);
		if (!originalNames || originalNames.length === 0) {
			return undefined;
		}
		if (originalNames.length === 1) {
			const header = this.headers.get(originalNames[0]);
			return header?.value;
		}
		// Multiple values: return comma-separated
		const values = originalNames.map((originalName) => {
			const header = this.headers.get(originalName);
			return header?.value || "";
		});
		return values.join(", ");
	}

	/**
	 * Checks if a header exists
	 * @param name - The header name (case-insensitive)
	 * @returns true if header exists
	 */
	has(name: string): boolean {
		return this.lowerCaseMap.has(name.toLowerCase());
	}

	/**
	 * Gets all header values for a given name
	 * @param name - The header name (case-insensitive)
	 * @returns Array of header values
	 */
	getAll(name: string): string[] {
		const lowerName = name.toLowerCase();
		const originalNames = this.lowerCaseMap.get(lowerName);
		if (!originalNames) {
			return [];
		}
		return originalNames.map((originalName) => {
			const header = this.headers.get(originalName);
			return header?.value || "";
		});
	}

	/**
	 * Sets a header value, replacing existing values
	 * @param name - The header name
	 * @param value - The header value
	 */
	set(name: string, value: string): void {
		const lowerName = name.toLowerCase();

		// Remove existing entries with same lowercase name
		const originalNames = this.lowerCaseMap.get(lowerName) || [];
		for (const originalName of originalNames) {
			this.headers.delete(originalName);
		}
		this.lowerCaseMap.delete(lowerName);

		// Add new entry
		this.append(name, value);
	}

	/**
	 * Appends a header value (allows multiple values for same header)
	 * Creates a new entry for each value to support getAll()
	 * @param name - The header name
	 * @param value - The header value
	 */
	append(name: string, value: string): void {
		const lowerName = name.toLowerCase();

		// Generate a unique key for this entry (to allow duplicates with same name)
		const uniqueKey = `${name}::${Date.now()}::${Math.random().toString(36).slice(2)}`;
		this.headers.set(uniqueKey, { name, value });

		// Track lowercase name mapping
		if (!this.lowerCaseMap.has(lowerName)) {
			this.lowerCaseMap.set(lowerName, []);
		}
		this.lowerCaseMap.get(lowerName)?.push(uniqueKey);
	}

	/**
	 * Deletes a header
	 * @param name - The header name (case-insensitive)
	 * @returns true if header was deleted
	 */
	delete(name: string): boolean {
		const lowerName = name.toLowerCase();
		const originalNames = this.lowerCaseMap.get(lowerName);

		if (originalNames) {
			for (const originalName of originalNames) {
				this.headers.delete(originalName);
			}
			this.lowerCaseMap.delete(lowerName);
			return true;
		}

		return false;
	}

	/**
	 * Gets all header names
	 * @returns Array of unique header names (preserving original case of first occurrence)
	 */
	names(): string[] {
		const uniqueNames: string[] = [];
		for (const [_key, header] of this.headers) {
			if (!uniqueNames.includes(header.name)) {
				uniqueNames.push(header.name);
			}
		}
		return uniqueNames;
	}

	/**
	 * Returns an iterator over header entries
	 * @returns Iterator of [name, value] pairs
	 */
	entries(): IterableIterator<[string, string]> {
		return this[Symbol.iterator]();
	}

	/**
	 * Default iterator for for...of loops
	 */
	[Symbol.iterator](): IterableIterator<[string, string]> {
		const entries: [string, string][] = [];
		for (const [, header] of this.headers) {
			entries.push([header.name, header.value]);
		}
		return entries[Symbol.iterator]();
	}

	/**
	 * Returns the number of unique headers
	 */
	get size(): number {
		return this.lowerCaseMap.size;
	}

	/**
	 * Returns the total number of header entries (including duplicates)
	 */
	get totalEntries(): number {
		return this.headers.size;
	}

	/**
	 * Clears all headers
	 */
	clear(): void {
		this.headers.clear();
		this.lowerCaseMap.clear();
	}

	/**
	 * Converts headers to a plain object
	 * @returns Object with lowercase header names as keys (comma-separated for duplicates)
	 */
	toObject(): Record<string, string> {
		const result: Record<string, string> = {};

		for (const [lowerName, originalNames] of this.lowerCaseMap) {
			const values = originalNames.map((key) => {
				const header = this.headers.get(key);
				return header?.value || "";
			});
			result[lowerName] = values.join(", ");
		}

		return result;
	}

	/**
	 * Returns an array of all Header objects
	 * @returns Array of Header objects
	 */
	toArray(): Header[] {
		return Array.from(this.headers.values());
	}

	/**
	 * Creates a copy of this HeadersMap
	 * @returns A new HeadersMap with the same headers
	 */
	clone(): HeadersMap {
		return new HeadersMap(this.toArray());
	}

	/**
	 * Serializes headers to a byte array for transmission
	 * @returns Uint8Array containing the formatted headers
	 */
	toBytes(): Uint8Array {
		const parts: string[] = [];

		for (const [, header] of this.headers) {
			parts.push(`${header.name}: ${header.value}\r\n`);
		}

		parts.push("\r\n");

		const encoder = new TextEncoder();
		return encoder.encode(parts.join(""));
	}

	/**
	 * Checks if this HeadersMap equals another
	 * @param other - The other HeadersMap to compare
	 * @returns true if all headers match
	 */
	equals(other: HeadersMap): boolean {
		if (this.totalEntries !== other.totalEntries) {
			return false;
		}

		for (const [, header] of this.headers) {
			const otherValues = other.getAll(header.name);
			const thisValue = header.value;
			if (!otherValues.includes(thisValue)) {
				return false;
			}
		}

		return true;
	}
}

/**
 * Parses a raw header line into name and value
 * @param line - The raw header line (without CRLF)
 * @returns [name, value] tuple or null if invalid
 */
export function parseHeaderLine(line: string): [string, string] | null {
	const colonIndex = line.indexOf(":");

	if (colonIndex === -1) {
		return null;
	}

	const name = line.slice(0, colonIndex).trim();
	const value = line.slice(colonIndex + 1).trim();

	if (!name) {
		return null;
	}

	// Empty values are invalid per test expectations
	if (!value) {
		return null;
	}

	return [name, value];
}

/**
 * Parses multiple header lines into a HeadersMap
 * @param headerText - The raw header text (should not include request/status line)
 * @param maxHeaders - Maximum number of headers allowed
 * @param maxLineLength - Maximum length of a single header line
 * @returns Parsed HeadersMap or null if parsing failed
 */
export function parseHeaders(
	headerText: string,
	maxHeaders: number = 256,
	maxLineLength: number = 8192
): HeadersMap | null {
	const headers = new HeadersMap();
	const lines = headerText.split("\r\n");

	for (const line of lines) {
		if (line.length > maxLineLength) {
			return null;
		}

		if (line === "") {
			// Empty line signals end of headers
			break;
		}

		// Check header count limit
		if (headers.totalEntries >= maxHeaders) {
			return null;
		}

		const parsed = parseHeaderLine(line);
		if (!parsed) {
			return null;
		}

		const [name, value] = parsed;
		headers.append(name, value);
	}

	return headers;
}

/**
 * Creates a HeadersMap from a plain object
 * @param obj - Object with header names as keys
 * @returns HeadersMap with the same headers
 */
export function headersFromObject(obj: Record<string, string>): HeadersMap {
	const headers = new HeadersMap();

	for (const [key, value] of Object.entries(obj)) {
		headers.set(key, value);
	}

	return headers;
}
