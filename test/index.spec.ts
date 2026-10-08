import {
	env,
	createExecutionContext,
	waitOnExecutionContext,
	SELF,
} from "cloudflare:test";
import { describe, it, expect } from "vitest";
import worker from "../src/index";

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

	it("successfully shortens a valid URL via POST /api/shorten", async () => {
		const targetUrl = "https://example.com/articulos/guia-completa-2026?ref=newsletter";
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
			data: { code: string; shortUrl: string; originalUrl: string };
		};

		expect(json.success).toBe(true);
		expect(json.data.code).toBeDefined();
		expect(json.data.code.length).toBe(6);
		expect(json.data.originalUrl).toBe(targetUrl);
		expect(json.data.shortUrl).toBe(`http://localhost:8787/${json.data.code}`);

		// Test redirecting using the generated code
		const redirectReq = new IncomingRequest(`http://localhost:8787/${json.data.code}`);
		const redirectRes = await worker.fetch(redirectReq, env, ctx);
		expect(redirectRes.status).toBe(302);
		expect(redirectRes.headers.get("Location")).toBe(targetUrl);
	});

	it("rejects invalid or missing URL with 400 Bad Request", async () => {
		const ctx = createExecutionContext();

		// Empty URL
		const reqEmpty = new IncomingRequest("http://localhost:8787/api/shorten", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ url: "" }),
		});
		const resEmpty = await worker.fetch(reqEmpty, env, ctx);
		expect(resEmpty.status).toBe(400);

		// Malformed URL
		const reqInvalid = new IncomingRequest("http://localhost:8787/api/shorten", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ url: "esto-no-es-una-url" }),
		});
		const resInvalid = await worker.fetch(reqInvalid, env, ctx);
		expect(resInvalid.status).toBe(400);

		const errorJson = (await resInvalid.json()) as { success: boolean; error: string };
		expect(errorJson.success).toBe(false);
		expect(errorJson.error).toBeDefined();
	});
});
