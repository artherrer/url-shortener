/**
 * URL Shortener Cloudflare Worker
 *
 * Provides service to shorten URLs and manage redirections using Cloudflare D1.
 */

export interface ShortenPayload {
	url: string;
	expiresAt?: string | null;
}

export interface ShortenedUrlRecord {
	code: string;
	originalUrl: string;
	shortUrl: string;
	clicks: number;
	createdAt: string;
	expiresAt: string | null;
	active: boolean;
}

export interface ServiceResponse<T> {
	success: boolean;
	data?: T;
	error?: string;
}

interface D1UrlRow {
	id?: number;
	code: string;
	original_url: string;
	clicks: number;
	created_at: string;
	expires_at: string | null;
	active: number;
}

/**
 * Service to handle validation, generation, storage, and retrieval of shortened URLs
 */
export class UrlShortenerService {
	private static readonly CODE_LENGTH = 6;
	private static readonly CHARACTERS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

	// In-memory fallback cache when D1 is not available or during lightweight unit tests
	private static readonly memoryStore = new Map<string, ShortenedUrlRecord>();

	/**
	 * Generates a cryptographically random short code
	 */
	public static generateShortCode(length: number = UrlShortenerService.CODE_LENGTH): string {
		const bytes = new Uint8Array(length);
		crypto.getRandomValues(bytes);
		let result = "";
		const charLen = UrlShortenerService.CHARACTERS.length;
		for (let i = 0; i < length; i++) {
			result += UrlShortenerService.CHARACTERS[bytes[i] % charLen];
		}
		return result;
	}

	/**
	 * Validates candidate URLs
	 */
	public static validateUrl(candidateUrl: unknown): { isValid: boolean; error?: string; normalizedUrl?: string } {
		if (!candidateUrl || typeof candidateUrl !== "string") {
			return { isValid: false, error: "The 'url' property is required and must be a string." };
		}

		const trimmed = candidateUrl.trim();

		if (trimmed.length === 0) {
			return { isValid: false, error: "URL cannot be empty." };
		}

		if (trimmed.length > 2048) {
			return { isValid: false, error: "URL exceeds maximum permitted length (2048 characters)." };
		}

		try {
			const parsed = new URL(trimmed);

			if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
				return { isValid: false, error: "Protocol must be http:// or https://" };
			}

			if (!parsed.hostname || parsed.hostname.length < 3) {
				return { isValid: false, error: "Hostname or domain name is invalid." };
			}

			return { isValid: true, normalizedUrl: parsed.toString() };
		} catch {
			return { isValid: false, error: "Provided URL format is invalid." };
		}
	}

	/**
	 * Ensures the urls table exists in Cloudflare D1
	 */
	public static async initDatabase(db: D1Database): Promise<void> {
		try {
			await db
				.prepare(
					`CREATE TABLE IF NOT EXISTS urls (
						id INTEGER PRIMARY KEY AUTOINCREMENT,
						code TEXT NOT NULL UNIQUE,
						original_url TEXT NOT NULL,
						clicks INTEGER NOT NULL DEFAULT 0,
						created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
						expires_at TIMESTAMP,
						active BOOLEAN NOT NULL DEFAULT 1
					);`,
				)
				.run();
		} catch {
			// Ignore if already initialized or restricted
		}
	}

	/**
	 * Creates a shortened URL and persists it in Cloudflare D1
	 */
	public static async createShortUrl(
		rawUrl: string,
		baseUrl: string,
		env?: Env,
		expiresAt?: string | null,
	): Promise<ServiceResponse<ShortenedUrlRecord>> {
		const validation = UrlShortenerService.validateUrl(rawUrl);

		if (!validation.isValid || !validation.normalizedUrl) {
			return {
				success: false,
				error: validation.error || "Invalid URL",
			};
		}

		const code = UrlShortenerService.generateShortCode();
		const cleanBase = baseUrl.replace(/\/+$/, "");
		const shortUrl = `${cleanBase}/${code}`;
		const now = new Date().toISOString();
		const validExpiresAt = expiresAt ? new Date(expiresAt).toISOString() : null;

		const record: ShortenedUrlRecord = {
			code,
			originalUrl: validation.normalizedUrl,
			shortUrl,
			clicks: 0,
			createdAt: now,
			expiresAt: validExpiresAt,
			active: true,
		};

		// Persist to Cloudflare D1 database
		if (env?.url_shortener_db) {
			try {
				await UrlShortenerService.initDatabase(env.url_shortener_db);

				await env.url_shortener_db
					.prepare(
						`INSERT INTO urls (code, original_url, clicks, created_at, expires_at, active)
						 VALUES (?, ?, ?, ?, ?, ?)`
					)
					.bind(
						record.code,
						record.originalUrl,
						record.clicks,
						record.createdAt,
						record.expiresAt,
						record.active ? 1 : 0
					)
					.run();
			} catch (dbError) {
				console.warn("Could not persist to D1, using fallback memory store:", dbError);
			}
		}

		// Also cache in memory for fallback / fast lookup
		UrlShortenerService.memoryStore.set(code, record);

		return {
			success: true,
			data: record,
		};
	}

	/**
	 * Retrieves the original URL by code from D1, checking expiry and active status, and increments clicks
	 */
	public static async getOriginalUrl(code: string, env?: Env): Promise<string | null> {
		if (env?.url_shortener_db) {
			try {
				const row = await env.url_shortener_db
					.prepare("SELECT code, original_url, clicks, created_at, expires_at, active FROM urls WHERE code = ? LIMIT 1")
					.bind(code)
					.first<D1UrlRow>();

				if (row) {
					// Check if active
					if (row.active === 0) {
						return null;
					}

					// Check if expired
					if (row.expires_at && new Date(row.expires_at) < new Date()) {
						return null;
					}

					// Increment clicks asynchronously
					try {
						await env.url_shortener_db
							.prepare("UPDATE urls SET clicks = clicks + 1 WHERE code = ?")
							.bind(code)
							.run();
					} catch (updateErr) {
						console.error("Failed to increment clicks in D1:", updateErr);
					}

					return row.original_url;
				}
			} catch {
				// Fallback to memory store if query failed
			}
		}

		const inMemory = UrlShortenerService.memoryStore.get(code);
		if (inMemory) {
			if (!inMemory.active) return null;
			if (inMemory.expiresAt && new Date(inMemory.expiresAt) < new Date()) return null;
			inMemory.clicks += 1;
			return inMemory.originalUrl;
		}

		return null;
	}

	/**
	 * Handles the POST request to shorten a URL
	 */
	public static async handlePostShorten(request: Request, env: Env): Promise<Response> {
		const corsHeaders = UrlShortenerService.getCorsHeaders(request);

		let body: unknown;
		try {
			body = await request.json();
		} catch {
			return new Response(
				JSON.stringify({
					success: false,
					error: "Invalid or malformed JSON request body.",
				}),
				{
					status: 400,
					headers: {
						"Content-Type": "application/json",
						...corsHeaders,
					},
				},
			);
		}

		if (!body || typeof body !== "object" || !("url" in body)) {
			return new Response(
				JSON.stringify({
					success: false,
					error: "Missing required 'url' field in JSON request body.",
				}),
				{
					status: 400,
					headers: {
						"Content-Type": "application/json",
						...corsHeaders,
					},
				},
			);
		}

		const payload = body as ShortenPayload;
		const requestUrl = new URL(request.url);
		const baseUrl = `${requestUrl.protocol}//${requestUrl.host}`;

		const result = await UrlShortenerService.createShortUrl(
			payload.url,
			baseUrl,
			env,
			payload.expiresAt,
		);

		if (!result.success) {
			return new Response(JSON.stringify(result), {
				status: 400,
				headers: {
					"Content-Type": "application/json",
					...corsHeaders,
				},
			});
		}

		return new Response(JSON.stringify(result), {
			status: 201,
			headers: {
				"Content-Type": "application/json",
				...corsHeaders,
			},
		});
	}

	/**
	 * CORS headers support
	 */
	public static getCorsHeaders(request: Request): Record<string, string> {
		const origin = request.headers.get("Origin") || "*";
		return {
			"Access-Control-Allow-Origin": origin,
			"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
			"Access-Control-Allow-Headers": "Content-Type, Accept, Authorization",
			"Access-Control-Max-Age": "86400",
		};
	}
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);
		const corsHeaders = UrlShortenerService.getCorsHeaders(request);

		// Handle CORS preflight (OPTIONS)
		if (request.method === "OPTIONS") {
			return new Response(null, {
				status: 204,
				headers: corsHeaders,
			});
		}

		// Route for shortening URLs (POST /api/shorten or POST /api/urls)
		if (request.method === "POST" && (url.pathname === "/api/shorten" || url.pathname === "/api/urls")) {
			return UrlShortenerService.handlePostShorten(request, env);
		}

		// Route for redirecting short codes (GET /:code)
		const potentialCode = url.pathname.replace(/^\/+/, "");
		if (request.method === "GET" && potentialCode && !potentialCode.startsWith("api/")) {
			const originalUrl = await UrlShortenerService.getOriginalUrl(potentialCode, env);
			if (originalUrl) {
				return Response.redirect(originalUrl, 302);
			}
		}

		// Default fallback
		return new Response("Hello World!");
	},
} satisfies ExportedHandler<Env>;
