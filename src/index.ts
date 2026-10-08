/**
 * URL Shortener Cloudflare Worker
 *
 * Provides services to shorten URLs, list links, validate redirections,
 * and track analytics using Cloudflare D1.
 */

export interface ShortenPayload {
	url: string;
	expiresIn?: number; // In milliseconds, default 86400000 (24h)
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

export interface VisitRecord {
	id?: number;
	code: string;
	userAgent: string;
	visitedAt: string;
}

export interface LinkItem {
	code: string;
	shortUrl: string;
	originalUrl?: string;
	expiresIn: number | null;
	expiresAt?: string | null;
	active: boolean;
	clicks: number;
	createdAt?: string;
}

export interface UrlAnalyticsData {
	code: string;
	shortUrl: string;
	originalUrl: string;
	clicks: number;
	active: boolean;
	createdAt: string;
	expiresAt: string | null;
	visits: Array<{
		id?: number;
		userAgent: string;
		visitedAt: string;
	}>;
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

interface D1AnalyticsRow {
	id?: number;
	code: string;
	user_agent: string | null;
	visited_at: string;
}

export type RedirectionResult =
	| { status: 302; url: string }
	| { status: 404; error: string; description: string }
	| { status: 410; reason: "inactive" | "expired"; error: string; description: string };

/**
 * Service to handle validation, generation, storage, retrieval, and analytics of shortened URLs
 */
export class UrlShortenerService {
	private static readonly CODE_LENGTH = 6;
	private static readonly CHARACTERS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
	public static readonly DEFAULT_EXPIRES_IN_MS = 86400000; // 86400000 ms = 24 hours

	// In-memory fallback caches when D1 is not available or during unit testing
	private static readonly memoryStore = new Map<string, ShortenedUrlRecord>();
	private static readonly analyticsMemoryStore: VisitRecord[] = [];

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
	 * Ensures both the urls and url_analytics tables exist in Cloudflare D1
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

			// Add missing columns if table existed from an earlier schema
			const alterColumns = [
				"ALTER TABLE urls ADD COLUMN clicks INTEGER NOT NULL DEFAULT 0",
				"ALTER TABLE urls ADD COLUMN expires_at TIMESTAMP",
				"ALTER TABLE urls ADD COLUMN active BOOLEAN NOT NULL DEFAULT 1",
			];

			for (const query of alterColumns) {
				try {
					await db.prepare(query).run();
				} catch {
					// Column already exists or error ignored
				}
			}

			// Ensure url_analytics table exists
			await db
				.prepare(
					`CREATE TABLE IF NOT EXISTS url_analytics (
						id INTEGER PRIMARY KEY AUTOINCREMENT,
						code TEXT NOT NULL,
						user_agent TEXT,
						visited_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
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
		expiresInMs: number = UrlShortenerService.DEFAULT_EXPIRES_IN_MS,
	): Promise<ServiceResponse<ShortenedUrlRecord>> {
		const validation = UrlShortenerService.validateUrl(rawUrl);

		if (!validation.isValid || !validation.normalizedUrl) {
			return {
				success: false,
				error: validation.error || "Invalid URL",
			};
		}

		// Ensure expiresInMs is a positive integer
		const safeExpiresIn = typeof expiresInMs === "number" && expiresInMs > 0
			? expiresInMs
			: UrlShortenerService.DEFAULT_EXPIRES_IN_MS;

		const code = UrlShortenerService.generateShortCode();
		const cleanBase = baseUrl.replace(/\/+$/, "");
		const shortUrl = `${cleanBase}/${code}`;
		const now = new Date();
		const expiresAtDate = new Date(now.getTime() + safeExpiresIn);

		const record: ShortenedUrlRecord = {
			code,
			originalUrl: validation.normalizedUrl,
			shortUrl,
			clicks: 0,
			createdAt: now.toISOString(),
			expiresAt: expiresAtDate.toISOString(),
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
	 * Validates redirection status for a code without modifying clicks or logging analytics
	 * Safe for inspectors and previewers
	 */
	public static async inspectRedirection(code: string, env?: Env): Promise<RedirectionResult> {
		let row: D1UrlRow | null = null;

		if (env?.url_shortener_db) {
			try {
				row = await env.url_shortener_db
					.prepare("SELECT code, original_url, clicks, created_at, expires_at, active FROM urls WHERE code = ? LIMIT 1")
					.bind(code)
					.first<D1UrlRow>();
			} catch {
				// Query failed, proceed to memory store check
			}
		}

		if (!row) {
			const inMem = UrlShortenerService.memoryStore.get(code);
			if (inMem) {
				row = {
					code: inMem.code,
					original_url: inMem.originalUrl,
					clicks: inMem.clicks,
					created_at: inMem.createdAt,
					expires_at: inMem.expiresAt,
					active: inMem.active ? 1 : 0,
				};
			}
		}

		if (!row) {
			return {
				status: 404,
				error: "Not Found",
				description: "The requested short URL was not found in our database.",
			};
		}

		if (row.active === 0) {
			return {
				status: 410,
				reason: "inactive",
				error: "Link Inactive",
				description: "This short URL has been disabled or marked as inactive by the administrator.",
			};
		}

		if (row.expires_at && new Date(row.expires_at) < new Date()) {
			return {
				status: 410,
				reason: "expired",
				error: "Link Expired",
				description: `This short URL expired on ${new Date(row.expires_at).toUTCString()}.`,
			};
		}

		return {
			status: 302,
			url: row.original_url,
		};
	}

	/**
	 * Validates redirection AND records the visit (clicks + analytics: user-agent, datetime)
	 */
	public static async validateRedirectionAndTrack(
		code: string,
		userAgent: string,
		env?: Env,
	): Promise<RedirectionResult> {
		const result = await UrlShortenerService.inspectRedirection(code, env);

		if (result.status === 302) {
			const now = new Date().toISOString();

			// 1. Increment clicks in D1
			if (env?.url_shortener_db) {
				try {
					await UrlShortenerService.initDatabase(env.url_shortener_db);

					await env.url_shortener_db
						.prepare("UPDATE urls SET clicks = clicks + 1 WHERE code = ?")
						.bind(code)
						.run();

					// 2. Insert into url_analytics
					await env.url_shortener_db
						.prepare("INSERT INTO url_analytics (code, user_agent, visited_at) VALUES (?, ?, ?)")
						.bind(code, userAgent || "Unknown", now)
						.run();
				} catch (updateErr) {
					console.error("Failed to record analytics in D1:", updateErr);
				}
			}

			// Update memory store
			const inMem = UrlShortenerService.memoryStore.get(code);
			if (inMem) {
				inMem.clicks += 1;
			}
			UrlShortenerService.analyticsMemoryStore.push({
				code,
				userAgent: userAgent || "Unknown",
				visitedAt: now,
			});
		}

		return result;
	}

	/**
	 * Retrieves all links from D1 / memory store with code, shortUrl, expiresIn, and active
	 */
	public static async getAllLinks(baseUrl: string, env?: Env): Promise<LinkItem[]> {
		const cleanBase = baseUrl.replace(/\/+$/, "");
		const now = Date.now();
		const results: LinkItem[] = [];
		const seenCodes = new Set<string>();

		if (env?.url_shortener_db) {
			try {
				const rows = await env.url_shortener_db
					.prepare("SELECT code, original_url, clicks, created_at, expires_at, active FROM urls ORDER BY id DESC")
					.all<D1UrlRow>();

				if (rows?.results) {
					for (const r of rows.results) {
						seenCodes.add(r.code);
						const expiresTimestamp = r.expires_at ? new Date(r.expires_at).getTime() : null;
						const remainingMs = expiresTimestamp ? Math.max(0, expiresTimestamp - now) : null;

						results.push({
							code: r.code,
							shortUrl: `${cleanBase}/${r.code}`,
							originalUrl: r.original_url,
							expiresIn: remainingMs,
							expiresAt: r.expires_at,
							active: r.active === 1,
							clicks: r.clicks,
							createdAt: r.created_at,
						});
					}
				}
			} catch (err) {
				console.warn("Could not retrieve links from D1:", err);
			}
		}

		// Include any memory-stored links not yet included
		for (const [code, item] of UrlShortenerService.memoryStore.entries()) {
			if (!seenCodes.has(code)) {
				const expiresTimestamp = item.expiresAt ? new Date(item.expiresAt).getTime() : null;
				const remainingMs = expiresTimestamp ? Math.max(0, expiresTimestamp - now) : null;

				results.push({
					code: item.code,
					shortUrl: `${cleanBase}/${item.code}`,
					originalUrl: item.originalUrl,
					expiresIn: remainingMs,
					expiresAt: item.expiresAt,
					active: item.active,
					clicks: item.clicks,
					createdAt: item.createdAt,
				});
			}
		}

		return results;
	}

	/**
	 * Retrieves analytics and visit history for a specific code
	 */
	public static async getAnalytics(code: string, baseUrl: string, env?: Env): Promise<UrlAnalyticsData | null> {
		const cleanBase = baseUrl.replace(/\/+$/, "");
		let link: D1UrlRow | null = null;
		const visits: Array<{ id?: number; userAgent: string; visitedAt: string }> = [];

		if (env?.url_shortener_db) {
			try {
				link = await env.url_shortener_db
					.prepare("SELECT code, original_url, clicks, created_at, expires_at, active FROM urls WHERE code = ? LIMIT 1")
					.bind(code)
					.first<D1UrlRow>();

				const analyticsRows = await env.url_shortener_db
					.prepare("SELECT id, code, user_agent, visited_at FROM url_analytics WHERE code = ? ORDER BY id DESC LIMIT 100")
					.bind(code)
					.all<D1AnalyticsRow>();

				if (analyticsRows?.results) {
					for (const a of analyticsRows.results) {
						visits.push({
							id: a.id,
							userAgent: a.user_agent || "Unknown",
							visitedAt: a.visited_at,
						});
					}
				}
			} catch (err) {
				console.warn("Could not fetch analytics from D1:", err);
			}
		}

		if (!link) {
			const inMem = UrlShortenerService.memoryStore.get(code);
			if (inMem) {
				link = {
					code: inMem.code,
					original_url: inMem.originalUrl,
					clicks: inMem.clicks,
					created_at: inMem.createdAt,
					expires_at: inMem.expiresAt,
					active: inMem.active ? 1 : 0,
				};
			}
		}

		if (!link) {
			return null;
		}

		// Merge in-memory visits if needed
		if (visits.length === 0) {
			for (const v of UrlShortenerService.analyticsMemoryStore) {
				if (v.code === code) {
					visits.unshift({
						userAgent: v.userAgent,
						visitedAt: v.visitedAt,
					});
				}
			}
		}

		return {
			code: link.code,
			shortUrl: `${cleanBase}/${link.code}`,
			originalUrl: link.original_url,
			clicks: link.clicks,
			active: link.active === 1,
			createdAt: link.created_at,
			expiresAt: link.expires_at,
			visits,
		};
	}

	/**
	 * Handles POST /api/shorten
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

		// Handle expiresIn: default 86400000 ms (24 hours) or user-provided value
		const expiresIn = typeof payload.expiresIn === "number" && payload.expiresIn > 0
			? payload.expiresIn
			: UrlShortenerService.DEFAULT_EXPIRES_IN_MS;

		const result = await UrlShortenerService.createShortUrl(
			payload.url,
			baseUrl,
			env,
			expiresIn,
		);

		if (!result.success || !result.data) {
			return new Response(JSON.stringify(result), {
				status: 400,
				headers: {
					"Content-Type": "application/json",
					...corsHeaders,
				},
			});
		}

		// Return the code with the full shortUrl
		const responseBody = {
			success: true,
			code: result.data.code,
			shortUrl: result.data.shortUrl,
			data: result.data,
		};

		return new Response(JSON.stringify(responseBody), {
			status: 201,
			headers: {
				"Content-Type": "application/json",
				...corsHeaders,
			},
		});
	}

	/**
	 * Handles GET /api/links
	 */
	public static async handleGetLinks(request: Request, env: Env): Promise<Response> {
		const corsHeaders = UrlShortenerService.getCorsHeaders(request);
		const requestUrl = new URL(request.url);
		const baseUrl = `${requestUrl.protocol}//${requestUrl.host}`;

		const links = await UrlShortenerService.getAllLinks(baseUrl, env);

		return new Response(
			JSON.stringify({
				success: true,
				data: links,
			}),
			{
				status: 200,
				headers: {
					"Content-Type": "application/json",
					...corsHeaders,
				},
			},
		);
	}

	/**
	 * Handles GET /api/validate/:code
	 * Inspects status without altering clicks or logging analytics
	 */
	public static async handleValidateCode(code: string, request: Request, env: Env): Promise<Response> {
		const corsHeaders = UrlShortenerService.getCorsHeaders(request);
		const result = await UrlShortenerService.inspectRedirection(code, env);

		if (result.status === 302) {
			return new Response(
				JSON.stringify({
					success: true,
					code,
					status: 302,
					valid: true,
					title: "302 Found",
					description: "The link is active, unexpired, and redirects successfully.",
					targetUrl: result.url,
				}),
				{
					status: 200,
					headers: {
						"Content-Type": "application/json",
						...corsHeaders,
					},
				},
			);
		}

		return new Response(
			JSON.stringify({
				success: false,
				code,
				status: result.status,
				valid: false,
				reason: result.status === 410 ? result.reason : undefined,
				title: result.error,
				description: result.description,
			}),
			{
				status: 200, // Return 200 for validator API so frontend receives JSON cleanly
				headers: {
					"Content-Type": "application/json",
					...corsHeaders,
				},
			},
		);
	}

	/**
	 * Handles GET /api/analytics/:code
	 */
	public static async handleGetAnalytics(code: string, request: Request, env: Env): Promise<Response> {
		const corsHeaders = UrlShortenerService.getCorsHeaders(request);
		const requestUrl = new URL(request.url);
		const baseUrl = `${requestUrl.protocol}//${requestUrl.host}`;

		const data = await UrlShortenerService.getAnalytics(code, baseUrl, env);

		if (!data) {
			return new Response(
				JSON.stringify({
					success: false,
					error: "Short code not found",
				}),
				{
					status: 404,
					headers: {
						"Content-Type": "application/json",
						...corsHeaders,
					},
				},
			);
		}

		return new Response(
			JSON.stringify({
				success: true,
				data,
			}),
			{
				status: 200,
				headers: {
					"Content-Type": "application/json",
					...corsHeaders,
				},
			},
		);
	}

	/**
	 * Renders a user-friendly HTML error page for redirection failures
	 */
	public static renderErrorPage(status: number, title: string, description: string): string {
		return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${status} - ${title}</title>
  <style>
    body {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background-color: #0f172a;
      color: #f8fafc;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      padding: 1.5rem;
    }
    .card {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 1rem;
      padding: 2.5rem;
      max-width: 32rem;
      width: 100%;
      text-align: center;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
    }
    .badge {
      display: inline-block;
      padding: 0.25rem 0.75rem;
      font-size: 0.875rem;
      font-weight: 700;
      border-radius: 9999px;
      background: ${status === 404 ? "#ef4444" : "#f59e0b"};
      color: #ffffff;
      margin-bottom: 1rem;
    }
    h1 {
      font-size: 1.75rem;
      margin: 0 0 0.75rem 0;
      color: #ffffff;
    }
    p {
      color: #94a3b8;
      font-size: 1rem;
      line-height: 1.5;
      margin: 0 0 1.5rem 0;
    }
    a.btn {
      display: inline-block;
      background: #6366f1;
      color: white;
      text-decoration: none;
      padding: 0.75rem 1.5rem;
      border-radius: 0.75rem;
      font-weight: 600;
      transition: background 0.2s;
    }
    a.btn:hover {
      background: #4f46e5;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">HTTP ${status}</div>
    <h1>${title}</h1>
    <p>${description}</p>
    <a href="/" class="btn">Go to URL Shortener</a>
  </div>
</body>
</html>`;
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

		// Route for listing all URLs (GET /api/links)
		if (request.method === "GET" && url.pathname === "/api/links") {
			return UrlShortenerService.handleGetLinks(request, env);
		}

		// Route for inspecting/validating a code (GET /api/validate/:code)
		if (request.method === "GET" && url.pathname.startsWith("/api/validate/")) {
			const code = url.pathname.replace("/api/validate/", "").trim();
			return UrlShortenerService.handleValidateCode(code, request, env);
		}

		// Route for retrieving analytics (GET /api/analytics/:code)
		if (request.method === "GET" && url.pathname.startsWith("/api/analytics/")) {
			const code = url.pathname.replace("/api/analytics/", "").trim();
			return UrlShortenerService.handleGetAnalytics(code, request, env);
		}

		// Route for redirecting short codes (GET /:code)
		const potentialCode = url.pathname.replace(/^\/+/, "");
		if (request.method === "GET" && potentialCode && !potentialCode.startsWith("api/")) {
			const userAgent = request.headers.get("User-Agent") || "Unknown";
			const redirectResult = await UrlShortenerService.validateRedirectionAndTrack(potentialCode, userAgent, env);

			if (redirectResult.status === 302) {
				return Response.redirect(redirectResult.url, 302);
			}

			// For 404 or 410, return JSON if requested, otherwise human-readable HTML error page
			const acceptsJson = request.headers.get("Accept")?.includes("application/json");

			if (acceptsJson) {
				return new Response(
					JSON.stringify({
						success: false,
						status: redirectResult.status,
						error: redirectResult.error,
						description: redirectResult.description,
					}),
					{
						status: redirectResult.status,
						headers: {
							"Content-Type": "application/json",
							...corsHeaders,
						},
					},
				);
			}

			return new Response(
				UrlShortenerService.renderErrorPage(
					redirectResult.status,
					redirectResult.error,
					redirectResult.description,
				),
				{
					status: redirectResult.status,
					headers: {
						"Content-Type": "text/html; charset=utf-8",
						...corsHeaders,
					},
				},
			);
		}

		// Default fallback
		return new Response("Hello World!");
	},
} satisfies ExportedHandler<Env>;
