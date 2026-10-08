import {
	ApiResponse,
	LinkItem,
	ShortenPostResponse,
	ShortenUrlResponseData,
	UrlAnalyticsData,
	ValidationResponse,
} from "../types";

/**
 * Service for communicating with Cloudflare Worker API
 */
export const urlApiClient = {
	/**
	 * Sends a URL to be shortened with optional expiresIn (default 86400000 ms) and optional custom alias
	 * Returns code and full shortUrl
	 */
	async shortenUrl(
		originalUrl: string,
		expiresIn: number = 86400000,
		alias?: string,
	): Promise<{ code: string; shortUrl: string; data?: ShortenUrlResponseData }> {
		const payload: { url: string; expiresIn: number; alias?: string } = {
			url: originalUrl.trim(),
			expiresIn,
		};
		if (alias && alias.trim()) {
			payload.alias = alias.trim();
		}

		const response = await fetch("/api/shorten", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json",
			},
			body: JSON.stringify(payload),
		});

		let result: ShortenPostResponse;

		try {
			result = await response.json();
		} catch {
			throw new Error("Invalid response received from server.");
		}

		if (!response.ok || !result.success || !result.code || !result.shortUrl) {
			throw new Error(result.error || `Server error (${response.status})`);
		}

		return {
			code: result.code,
			shortUrl: result.shortUrl,
			data: result.data,
		};
	},

	/**
	 * Retrieves all URLs from /api/links with code, shortUrl, expiresIn, and active fields
	 */
	async getLinks(): Promise<LinkItem[]> {
		const response = await fetch("/api/links", {
			method: "GET",
			headers: {
				Accept: "application/json",
			},
		});

		let result: ApiResponse<LinkItem[]>;

		try {
			result = await response.json();
		} catch {
			throw new Error("Failed to load links from server.");
		}

		if (!response.ok || !result.success || !Array.isArray(result.data)) {
			throw new Error(result.error || `Failed to fetch links (${response.status})`);
		}

		return result.data;
	},

	/**
	 * Validates redirection status of a short code using the dedicated validator endpoint
	 * Avoids browser opaque-redirect traps and proxy misses
	 */
	async checkRedirectionStatus(code: string): Promise<ValidationResponse> {
		const cleanCode = code.trim().replace(/^https?:\/\/[^/]+\//, "");
		const response = await fetch(`/api/validate/${encodeURIComponent(cleanCode)}`, {
			method: "GET",
			headers: {
				Accept: "application/json",
			},
		});

		if (!response.ok) {
			return {
				success: false,
				code: cleanCode,
				status: response.status,
				valid: false,
				title: `HTTP ${response.status}`,
				description: "Unable to inspect status from worker.",
			};
		}

		const json = (await response.json()) as ValidationResponse;
		return json;
	},

	/**
	 * Retrieves analytics and visit history for a specific code
	 */
	async getAnalytics(code: string): Promise<UrlAnalyticsData> {
		const cleanCode = code.trim().replace(/^https?:\/\/[^/]+\//, "");
		const response = await fetch(`/api/analytics/${encodeURIComponent(cleanCode)}`, {
			method: "GET",
			headers: {
				Accept: "application/json",
			},
		});

		let result: ApiResponse<UrlAnalyticsData>;
		try {
			result = await response.json();
		} catch {
			throw new Error("Invalid analytics response from server.");
		}

		if (!response.ok || !result.success || !result.data) {
			throw new Error(result.error || `Failed to load analytics (${response.status})`);
		}

		return result.data;
	},
};
