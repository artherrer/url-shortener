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
	});
});
