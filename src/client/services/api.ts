import { ApiResponse, ShortenUrlResponseData } from "../types";

/**
 * Servicio para comunicarse con la API del Cloudflare Worker
 */
export const urlApiClient = {
	/**
	 * Envía una URL para ser acortada en el Worker
	 */
	async shortenUrl(originalUrl: string): Promise<ShortenUrlResponseData> {
		const response = await fetch("/api/shorten", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json",
			},
			body: JSON.stringify({ url: originalUrl.trim() }),
		});

		let result: ApiResponse<ShortenUrlResponseData>;

		try {
			result = await response.json();
		} catch (parseError) {
			throw new Error("Respuesta inválida del servidor");
		}

		if (!response.ok || !result.success || !result.data) {
			throw new Error(result.error || `Error del servidor (${response.status})`);
		}

		return result.data;
	},
};
