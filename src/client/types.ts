export interface ShortenUrlRequest {
	url: string;
	expiresAt?: string | null;
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

export interface ApiResponse<T> {
	success: boolean;
	data?: T;
	error?: string;
}
