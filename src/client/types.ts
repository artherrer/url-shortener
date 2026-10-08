export interface ShortenUrlRequest {
	url: string;
}

export interface ShortenUrlResponseData {
	code: string;
	shortUrl: string;
	originalUrl: string;
	createdAt: string;
}

export interface ApiResponse<T> {
	success: boolean;
	data?: T;
	error?: string;
}
