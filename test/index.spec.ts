import {
	env,
	createExecutionContext,
	waitOnExecutionContext,
} from "cloudflare:test";
import { describe, it, expect } from "vitest";
import worker, { UrlShortenerService } from "../src/index";

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

describe("URL Shortener Worker", () => {
	it("responds with Hello World! on default GET request", async () => {
		const request = new IncomingRequest("http://example.com");
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(await response.text()).toMatchInlineSnapshot(`"Hello World!"`);
	});

	it("responds to OPTIONS preflight with CORS headers", async () => {
		const request = new IncomingRequest("http://example.com/api/shorten", {
			method: "OPTIONS",
			headers: {
				Origin: "http://localhost:5173",
			},
		});
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(204);
		expect(response.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:5173");
		expect(response.headers.get("Access-Control-Allow-Methods")).toContain("POST");
	});

	it("POST /api/shorten: returns code and full shortUrl with default 86400000ms expiresIn", async () => {
		const targetUrl = "https://example.com/article/polishing-endpoints?ref=test";
		const request = new IncomingRequest("http://localhost:8787/api/shorten", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Origin: "http://localhost:5173",
			},
			body: JSON.stringify({ url: targetUrl }),
		});

		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(201);
		const json = (await response.json()) as {
			success: boolean;
			code: string;
			shortUrl: string;
			data?: { code: string; shortUrl: string; originalUrl: string; expiresAt: string };
		};

		expect(json.success).toBe(true);
		expect(json.code).toBeDefined();
		expect(json.code.length).toBe(6);
		expect(json.shortUrl).toBe(`http://localhost:8787/${json.code}`);
		expect(json.data?.expiresAt).toBeDefined();
	});

	it("POST /api/shorten: supports custom expiresIn in request body", async () => {
		const targetUrl = "https://example.com/custom-expiry-page";
		const customExpiresIn = 3600000; // 1 hour
		const request = new IncomingRequest("http://localhost:8787/api/shorten", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ url: targetUrl, expiresIn: customExpiresIn }),
		});

		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(201);
		const json = (await response.json()) as {
			success: boolean;
			code: string;
			shortUrl: string;
			data?: { expiresAt: string };
		};

		expect(json.code).toBeDefined();
		expect(json.shortUrl).toBe(`http://localhost:8787/${json.code}`);
		expect(new Date(json.data!.expiresAt).getTime()).toBeGreaterThan(Date.now());
	});

	it("GET /api/links: returns all saved URLs with code, shortUrl, expiresIn, clicks, and active", async () => {
		const postReq = new IncomingRequest("http://localhost:8787/api/shorten", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ url: "https://example.com/item-for-links-list", expiresIn: 86400000 }),
		});
		const ctx = createExecutionContext();
		await worker.fetch(postReq, env, ctx);

		const linksReq = new IncomingRequest("http://localhost:8787/api/links", {
			method: "GET",
			headers: { Accept: "application/json" },
		});
		const linksRes = await worker.fetch(linksReq, env, ctx);
		await waitOnExecutionContext(ctx);

		expect(linksRes.status).toBe(200);
		const json = (await linksRes.json()) as {
			success: boolean;
			data: Array<{
				code: string;
				shortUrl: string;
				expiresIn: number | null;
				active: boolean;
				clicks: number;
			}>;
		};

		expect(json.success).toBe(true);
		expect(Array.isArray(json.data)).toBe(true);
		expect(json.data.length).toBeGreaterThan(0);

		const first = json.data[0];
		expect(first.code).toBeDefined();
		expect(first.shortUrl).toContain(first.code);
		expect(typeof first.active).toBe("boolean");
		expect(typeof first.expiresIn).toBe("number");
		expect(typeof first.clicks).toBe("number");
	});

	describe("Redirection & Validation API", () => {
		it("GET /api/validate/:code returns 302 details for valid code without triggering browser redirect", async () => {
			const targetUrl = "https://example.com/redirect-target-302";
			const postReq = new IncomingRequest("http://localhost:8787/api/shorten", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ url: targetUrl }),
			});
			const ctx = createExecutionContext();
			const postRes = await worker.fetch(postReq, env, ctx);
			const postJson = (await postRes.json()) as { code: string };

			const valReq = new IncomingRequest(`http://localhost:8787/api/validate/${postJson.code}`);
			const valRes = await worker.fetch(valReq, env, ctx);
			await waitOnExecutionContext(ctx);

			expect(valRes.status).toBe(200);
			const valJson = (await valRes.json()) as {
				success: boolean;
				status: number;
				valid: boolean;
				targetUrl: string;
			};
			expect(valJson.status).toBe(302);
			expect(valJson.valid).toBe(true);
			expect(valJson.targetUrl).toBe(targetUrl);
		});

		it("GET /api/validate/:code returns 404 details when code does not exist", async () => {
			const ctx = createExecutionContext();
			const valReq = new IncomingRequest("http://localhost:8787/api/validate/nonExistent999");
			const valRes = await worker.fetch(valReq, env, ctx);
			await waitOnExecutionContext(ctx);

			const valJson = (await valRes.json()) as { status: number; valid: boolean };
			expect(valJson.status).toBe(404);
			expect(valJson.valid).toBe(false);
		});

		it("GET /api/validate/:code returns 410 details when short code is inactive", async () => {
			const ctx = createExecutionContext();
			await UrlShortenerService.initDatabase(env.url_shortener_db);
			const inactiveCode = "inact9";
			await env.url_shortener_db
				.prepare(
					"INSERT OR REPLACE INTO urls (code, original_url, clicks, created_at, expires_at, active) VALUES (?, ?, ?, ?, ?, ?)"
				)
				.bind(inactiveCode, "https://example.com/inactive", 0, new Date().toISOString(), null, 0)
				.run();

			const valReq = new IncomingRequest(`http://localhost:8787/api/validate/${inactiveCode}`);
			const valRes = await worker.fetch(valReq, env, ctx);
			await waitOnExecutionContext(ctx);

			const valJson = (await valRes.json()) as { status: number; valid: boolean };
			expect(valJson.status).toBe(410);
			expect(valJson.valid).toBe(false);
		});
	});

	describe("Analytics Tracking & Retrieval", () => {
		it("records user-agent and datetime on GET /:code and retrieves via /api/analytics/:code", async () => {
			const targetUrl = "https://example.com/analytics-test-target";
			const postReq = new IncomingRequest("http://localhost:8787/api/shorten", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ url: targetUrl }),
			});
			const ctx = createExecutionContext();
			const postRes = await worker.fetch(postReq, env, ctx);
			const postJson = (await postRes.json()) as { code: string };

			const testUserAgent = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) MobileTestBrowser/1.0";

			// Perform redirection visit
			const visitReq = new IncomingRequest(`http://localhost:8787/${postJson.code}`, {
				headers: {
					"User-Agent": testUserAgent,
				},
			});
			const visitRes = await worker.fetch(visitReq, env, ctx);
			await waitOnExecutionContext(ctx);

			expect(visitRes.status).toBe(302);
			expect(visitRes.headers.get("Location")).toBe(targetUrl);

			// Retrieve analytics
			const analyticsReq = new IncomingRequest(`http://localhost:8787/api/analytics/${postJson.code}`);
			const analyticsRes = await worker.fetch(analyticsReq, env, ctx);
			await waitOnExecutionContext(ctx);

			expect(analyticsRes.status).toBe(200);
			const analyticsJson = (await analyticsRes.json()) as {
				success: boolean;
				data: {
					code: string;
					clicks: number;
					visits: Array<{ userAgent: string; visitedAt: string }>;
				};
			};

			expect(analyticsJson.success).toBe(true);
			expect(analyticsJson.data.clicks).toBeGreaterThanOrEqual(1);
			expect(analyticsJson.data.visits.length).toBeGreaterThanOrEqual(1);

			const latestVisit = analyticsJson.data.visits[0];
			expect(latestVisit.userAgent).toBe(testUserAgent);
			expect(latestVisit.visitedAt).toBeDefined();
			expect(new Date(latestVisit.visitedAt).getTime()).toBeLessThanOrEqual(Date.now() + 5000);
		});

		it("records 'Unknown' when User-Agent header is missing on visit", async () => {
			const targetUrl = "https://example.com/no-ua-test";
			const postReq = new IncomingRequest("http://localhost:8787/api/shorten", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ url: targetUrl }),
			});
			const ctx = createExecutionContext();
			const postRes = await worker.fetch(postReq, env, ctx);
			const postJson = (await postRes.json()) as { code: string };

			// Visit without User-Agent header
			const visitReq = new IncomingRequest(`http://localhost:8787/${postJson.code}`);
			const visitRes = await worker.fetch(visitReq, env, ctx);
			await waitOnExecutionContext(ctx);

			expect(visitRes.status).toBe(302);

			// Query analytics
			const analyticsReq = new IncomingRequest(`http://localhost:8787/api/analytics/${postJson.code}`);
			const analyticsRes = await worker.fetch(analyticsReq, env, ctx);
			await waitOnExecutionContext(ctx);

			const analyticsJson = (await analyticsRes.json()) as {
				success: boolean;
				data: {
					visits: Array<{ userAgent: string }>;
				};
			};

			expect(analyticsJson.data.visits.length).toBeGreaterThan(0);
			expect(analyticsJson.data.visits[0].userAgent).toBe("Unknown");
		});
	});

	describe("Edge Cases & Validation Resilience", () => {
		it("POST /api/shorten: rejects missing or empty url with status 400", async () => {
			const ctx = createExecutionContext();

			// Missing url property
			const req1 = new IncomingRequest("http://localhost:8787/api/shorten", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({}),
			});
			const res1 = await worker.fetch(req1, env, ctx);
			await waitOnExecutionContext(ctx);
			expect(res1.status).toBe(400);

			// Empty string url
			const req2 = new IncomingRequest("http://localhost:8787/api/shorten", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ url: "   " }),
			});
			const res2 = await worker.fetch(req2, env, ctx);
			await waitOnExecutionContext(ctx);
			expect(res2.status).toBe(400);
		});

		it("POST /api/shorten: rejects unsupported protocols (e.g. ftp, javascript, file)", async () => {
			const ctx = createExecutionContext();
			const forbiddenSchemes = [
				"ftp://files.example.com/archive.zip",
				"javascript:alert(1)",
				"file:///etc/passwd",
				"data:text/plain;base64,SGVsbG8sIFdvcmxkIQ==",
			];

			for (const badUrl of forbiddenSchemes) {
				const req = new IncomingRequest("http://localhost:8787/api/shorten", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ url: badUrl }),
				});
				const res = await worker.fetch(req, env, ctx);
				await waitOnExecutionContext(ctx);

				expect(res.status).toBe(400);
				const json = (await res.json()) as { success: boolean; error: string };
				expect(json.success).toBe(false);
				expect(json.error).toBeDefined();
			}
		});

		it("POST /api/shorten: rejects URLs exceeding 2048 characters", async () => {
			const ctx = createExecutionContext();
			const longUrl = `https://example.com/search?query=${"a".repeat(2050)}`;
			const req = new IncomingRequest("http://localhost:8787/api/shorten", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ url: longUrl }),
			});
			const res = await worker.fetch(req, env, ctx);
			await waitOnExecutionContext(ctx);

			expect(res.status).toBe(400);
			const json = (await res.json()) as { error: string };
			expect(json.error).toContain("2048");
		});

		it("POST /api/shorten: gracefully falls back to default expiresIn for negative or non-numeric values", async () => {
			const ctx = createExecutionContext();
			const req = new IncomingRequest("http://localhost:8787/api/shorten", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ url: "https://example.com/safe-fallback", expiresIn: -5000 }),
			});
			const res = await worker.fetch(req, env, ctx);
			await waitOnExecutionContext(ctx);

			expect(res.status).toBe(201);
			const json = (await res.json()) as {
				success: boolean;
				data: { expiresAt: string };
			};
			expect(json.success).toBe(true);
			expect(new Date(json.data.expiresAt).getTime()).toBeGreaterThan(Date.now());
		});

		it("GET /api/validate/:code returns 410 with reason 'expired' for expired link", async () => {
			const ctx = createExecutionContext();
			await UrlShortenerService.initDatabase(env.url_shortener_db);
			const expiredCode = "expir1";
			const pastDate = new Date(Date.now() - 3600000).toISOString(); // 1 hr ago

			await env.url_shortener_db
				.prepare(
					"INSERT OR REPLACE INTO urls (code, original_url, clicks, created_at, expires_at, active) VALUES (?, ?, ?, ?, ?, ?)"
				)
				.bind(expiredCode, "https://example.com/expired-target", 0, new Date().toISOString(), pastDate, 1)
				.run();

			const valReq = new IncomingRequest(`http://localhost:8787/api/validate/${expiredCode}`);
			const valRes = await worker.fetch(valReq, env, ctx);
			await waitOnExecutionContext(ctx);

			expect(valRes.status).toBe(200);
			const valJson = (await valRes.json()) as {
				status: number;
				valid: boolean;
				reason: string;
				description: string;
			};
			expect(valJson.status).toBe(410);
			expect(valJson.valid).toBe(false);
			expect(valJson.reason).toBe("expired");
			expect(valJson.description).toContain("expired on");
		});

		it("GET /:code returns 410 HTML page when expired link is accessed directly in browser", async () => {
			const ctx = createExecutionContext();
			await UrlShortenerService.initDatabase(env.url_shortener_db);
			const expiredCode = "expir2";
			const pastDate = new Date(Date.now() - 3600000).toISOString();

			await env.url_shortener_db
				.prepare(
					"INSERT OR REPLACE INTO urls (code, original_url, clicks, created_at, expires_at, active) VALUES (?, ?, ?, ?, ?, ?)"
				)
				.bind(expiredCode, "https://example.com/expired-target-2", 0, new Date().toISOString(), pastDate, 1)
				.run();

			const directReq = new IncomingRequest(`http://localhost:8787/${expiredCode}`, {
				headers: { Accept: "text/html,application/xhtml+xml" },
			});
			const directRes = await worker.fetch(directReq, env, ctx);
			await waitOnExecutionContext(ctx);

			expect(directRes.status).toBe(410);
			const html = await directRes.text();
			expect(html).toContain("410");
			expect(html).toContain("Link Expired");
			// Verify fix: button redirects to frontend root, not api root '/'
			expect(html).toContain('href="http://localhost:5173"');
			expect(html).not.toContain('href="/"');
		});

		it("GET /:code returns 404 HTML page when code is not found in browser", async () => {
			const ctx = createExecutionContext();
			const req = new IncomingRequest("http://localhost:8787/totallyFakeCode404", {
				headers: { Accept: "text/html" },
			});
			const res = await worker.fetch(req, env, ctx);
			await waitOnExecutionContext(ctx);

			expect(res.status).toBe(404);
			const html = await res.text();
			expect(html).toContain("404");
			expect(html).toContain("Not Found");
			expect(html).toContain('href="http://localhost:5173"');
		});
	});

	describe("Custom Aliases Feature", () => {
		it("POST /api/shorten: successfully creates short URL with a valid custom alias", async () => {
			const targetUrl = "https://example.com/special-summer-sale";
			const customAlias = "summer-sale-2026";
			const ctx = createExecutionContext();

			const req = new IncomingRequest("http://localhost:8787/api/shorten", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					url: targetUrl,
					alias: customAlias,
				}),
			});

			const res = await worker.fetch(req, env, ctx);
			await waitOnExecutionContext(ctx);

			expect(res.status).toBe(201);
			const json = (await res.json()) as {
				success: boolean;
				code: string;
				shortUrl: string;
			};

			expect(json.success).toBe(true);
			expect(json.code).toBe(customAlias);
			expect(json.shortUrl).toBe(`http://localhost:8787/${customAlias}`);

			// Verify redirection works with custom alias
			const visitReq = new IncomingRequest(`http://localhost:8787/${customAlias}`);
			const visitRes = await worker.fetch(visitReq, env, ctx);
			await waitOnExecutionContext(ctx);

			expect(visitRes.status).toBe(302);
			expect(visitRes.headers.get("Location")).toBe(targetUrl);
		});

		it("POST /api/shorten: returns 409 conflict when custom alias already exists", async () => {
			const targetUrl = "https://example.com/first-claim";
			const duplicateAlias = "exclusive-deal";
			const ctx = createExecutionContext();

			// First insertion
			const firstReq = new IncomingRequest("http://localhost:8787/api/shorten", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					url: targetUrl,
					alias: duplicateAlias,
				}),
			});
			const firstRes = await worker.fetch(firstReq, env, ctx);
			await waitOnExecutionContext(ctx);
			expect(firstRes.status).toBe(201);

			// Second insertion with identical alias
			const dupReq = new IncomingRequest("http://localhost:8787/api/shorten", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					url: "https://example.com/second-attempt",
					alias: duplicateAlias,
				}),
			});
			const dupRes = await worker.fetch(dupReq, env, ctx);
			await waitOnExecutionContext(ctx);

			expect(dupRes.status).toBe(409);
			const dupJson = (await dupRes.json()) as { success: boolean; error: string };
			expect(dupJson.success).toBe(false);
			expect(dupJson.error).toContain(duplicateAlias);
			expect(dupJson.error).toContain("already in use");
		});

		it("POST /api/shorten: rejects invalid alias formats (length, special characters)", async () => {
			const ctx = createExecutionContext();

			const invalidAliases = [
				{ alias: "ab", reason: "too short" },
				{ alias: "a".repeat(55), reason: "too long" },
				{ alias: "my alias with spaces", reason: "spaces" },
				{ alias: "hello@world!", reason: "special characters" },
				{ alias: "link/with/slashes", reason: "slashes" },
			];

			for (const item of invalidAliases) {
				const req = new IncomingRequest("http://localhost:8787/api/shorten", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						url: "https://example.com/test-invalid-alias",
						alias: item.alias,
					}),
				});
				const res = await worker.fetch(req, env, ctx);
				await waitOnExecutionContext(ctx);

				expect(res.status).toBe(400);
				const json = (await res.json()) as { success: boolean; error: string };
				expect(json.success).toBe(false);
				expect(json.error).toBeDefined();
			}
		});

		it("POST /api/shorten: rejects reserved alias names", async () => {
			const ctx = createExecutionContext();
			const reservedNames = ["api", "links", "shorten", "validate", "analytics"];

			for (const reserved of reservedNames) {
				const req = new IncomingRequest("http://localhost:8787/api/shorten", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						url: "https://example.com/test-reserved",
						alias: reserved,
					}),
				});
				const res = await worker.fetch(req, env, ctx);
				await waitOnExecutionContext(ctx);

				expect(res.status).toBe(400);
				const json = (await res.json()) as { success: boolean; error: string };
				expect(json.success).toBe(false);
				expect(json.error).toContain("reserved");
			}
		});

		it("POST /api/shorten: alias is optional, generates random code when omitted or empty", async () => {
			const ctx = createExecutionContext();

			// Omitted alias
			const req1 = new IncomingRequest("http://localhost:8787/api/shorten", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					url: "https://example.com/random-code-1",
				}),
			});
			const res1 = await worker.fetch(req1, env, ctx);
			await waitOnExecutionContext(ctx);
			const json1 = (await res1.json()) as { code: string };
			expect(res1.status).toBe(201);
			expect(json1.code.length).toBe(6);

			// Empty string alias
			const req2 = new IncomingRequest("http://localhost:8787/api/shorten", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					url: "https://example.com/random-code-2",
					alias: "   ",
				}),
			});
			const res2 = await worker.fetch(req2, env, ctx);
			await waitOnExecutionContext(ctx);
			const json2 = (await res2.json()) as { code: string };
			expect(res2.status).toBe(201);
			expect(json2.code.length).toBe(6);
		});
	});
});
