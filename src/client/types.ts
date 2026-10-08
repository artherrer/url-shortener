export interface ShortenUrlRequest {
	url: string;
	expiresIn?: number; // In milliseconds, default 86400000 (24h)
	alias?: string; // Optional custom short code
}

export interface ShortenUrlResponseData {
	code: string;
	shortUrl: string;
	originalUrl: string;
	clicks: number;
	createdAt: string;
	expiresAt: string | null;
	active: boolean;
}

export interface ShortenPostResponse {
	success: boolean;
	code: string;
	shortUrl: string;
	data?: ShortenUrlResponseData;
	error?: string;
}

export interface LinkItem {
	code: string;
	shortUrl: string;
	originalUrl?: string;
	expiresIn: number | null; // Remaining milliseconds until expiration
	expiresAt?: string | null;
	active: boolean;
	clicks: number;
	createdAt?: string;
}

export interface VisitRecord {
	id?: number;
	userAgent: string;
	visitedAt: string;
}

export interface UrlAnalyticsData {
	code: string;
	shortUrl: string;
	originalUrl: string;
	clicks: number;
	active: boolean;
	createdAt: string;
	expiresAt: string | null;
	visits: VisitRecord[];
}

export interface ApiResponse<T> {
	success: boolean;
	data?: T;
	error?: string;
}

export interface ValidationResponse {
	success: boolean;
	code: string;
	status: number;
	valid: boolean;
	title: string;
	description: string;
	targetUrl?: string;
}
