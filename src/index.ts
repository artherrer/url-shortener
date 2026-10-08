/**
 * URL Shortener Cloudflare Worker
 *
 * Provee servicio para acortar URLs y gestionar redirecciones.
 */

export interface ShortenPayload {
	url: string;
}

export interface ShortenedUrlRecord {
	code: string;
	originalUrl: string;
	shortUrl: string;
	createdAt: string;
}

export interface ServiceResponse<T> {
	success: boolean;
	data?: T;
	error?: string;
}

/**
 * Servicio encargado de la lógica de validación, generación y almacenamiento de URLs acortadas
 */
export class UrlShortenerService {
	private static readonly CODE_LENGTH = 6;
	private static readonly CHARACTERS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

	// Almacén en memoria como respaldo cuando D1 no está inicializado o en entornos de prueba
	private static readonly memoryStore = new Map<string, ShortenedUrlRecord>();

	/**
	 * Genera un código aleatorio criptográficamente seguro
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
	 * Valida que una URL cumpla con los estándares esperados
	 */
	public static validateUrl(candidateUrl: unknown): { isValid: boolean; error?: string; normalizedUrl?: string } {
		if (!candidateUrl || typeof candidateUrl !== "string") {
			return { isValid: false, error: "La propiedad 'url' es requerida y debe ser un texto." };
		}

		const trimmed = candidateUrl.trim();

		if (trimmed.length === 0) {
			return { isValid: false, error: "La URL no puede estar vacía." };
		}

		if (trimmed.length > 2048) {
			return { isValid: false, error: "La URL excede la longitud máxima permitida (2048 caracteres)." };
		}

		try {
			const parsed = new URL(trimmed);

			if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
				return { isValid: false, error: "El protocolo debe ser http:// o https://" };
			}

			if (!parsed.hostname || parsed.hostname.length < 3) {
				return { isValid: false, error: "El nombre de host o dominio no es válido." };
			}

			return { isValid: true, normalizedUrl: parsed.toString() };
		} catch {
			return { isValid: false, error: "El formato de la URL proporcionada no es válido." };
		}
	}

	/**
	 * Inicializa la tabla en D1 si existe la conexión
	 */
	private static async initDatabase(db: D1Database): Promise<void> {
		try {
			await db
				.prepare(
					`CREATE TABLE IF NOT EXISTS urls (
						id INTEGER PRIMARY KEY AUTOINCREMENT,
						code TEXT NOT NULL UNIQUE,
						original_url TEXT NOT NULL,
						created_at TEXT NOT NULL
					);`,
				)
				.run();
		} catch {
			// En caso de que el entorno o permisos no lo permitan, continuar sin bloquear
		}
	}

	/**
	 * Procesa la creación de una URL corta
	 */
	public static async createShortUrl(
		rawUrl: string,
		baseUrl: string,
		env?: Env,
	): Promise<ServiceResponse<ShortenedUrlRecord>> {
		const validation = UrlShortenerService.validateUrl(rawUrl);

		if (!validation.isValid || !validation.normalizedUrl) {
			return {
				success: false,
				error: validation.error || "URL inválida",
			};
		}

		const code = UrlShortenerService.generateShortCode();
		const cleanBase = baseUrl.replace(/\/+$/, "");
		const shortUrl = `${cleanBase}/${code}`;
		const now = new Date().toISOString();

		const record: ShortenedUrlRecord = {
			code,
			originalUrl: validation.normalizedUrl,
			shortUrl,
			createdAt: now,
		};

		// Guardar en D1 si está configurado
		if (env?.url_shortener_db) {
			try {
				await UrlShortenerService.initDatabase(env.url_shortener_db);
				await env.url_shortener_db
					.prepare("INSERT INTO urls (code, original_url, created_at) VALUES (?, ?, ?)")
					.bind(code, record.originalUrl, now)
					.run();
			} catch (dbError) {
				console.warn("No se pudo persistir en D1, usando almacenamiento auxiliar:", dbError);
			}
		}

		// Respaldar en el store en memoria
		UrlShortenerService.memoryStore.set(code, record);

		return {
			success: true,
			data: record,
		};
	}

	/**
	 * Obtiene la URL original dado un código
	 */
	public static async getOriginalUrl(code: string, env?: Env): Promise<string | null> {
		if (env?.url_shortener_db) {
			try {
				const result = await env.url_shortener_db
					.prepare("SELECT original_url FROM urls WHERE code = ? LIMIT 1")
					.bind(code)
					.first<{ original_url: string }>();

				if (result?.original_url) {
					return result.original_url;
				}
			} catch {
				// Fallback al almacén en memoria
			}
		}

		const inMemory = UrlShortenerService.memoryStore.get(code);
		return inMemory ? inMemory.originalUrl : null;
	}

	/**
	 * Maneja la petición POST de acortamiento proveniente del formulario
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
					error: "Cuerpo de solicitud JSON inválido o malformado.",
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
					error: "Se requiere el campo 'url' en el cuerpo JSON.",
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

		const rawUrl = (body as ShortenPayload).url;
		const requestUrl = new URL(request.url);
		const baseUrl = `${requestUrl.protocol}//${requestUrl.host}`;

		const result = await UrlShortenerService.createShortUrl(rawUrl, baseUrl, env);

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
	 * Headers para soporte CORS
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

		// Manejo de preflight CORS (OPTIONS)
		if (request.method === "OPTIONS") {
			return new Response(null, {
				status: 204,
				headers: corsHeaders,
			});
		}

		// Ruta del servicio para procesar el formulario (POST /api/shorten)
		if (request.method === "POST" && (url.pathname === "/api/shorten" || url.pathname === "/api/urls")) {
			return UrlShortenerService.handlePostShorten(request, env);
		}

		// Redirección si se solicita un código acortado (GET /:code)
		const potentialCode = url.pathname.replace(/^\/+/, "");
		if (request.method === "GET" && potentialCode && !potentialCode.startsWith("api/")) {
			const originalUrl = await UrlShortenerService.getOriginalUrl(potentialCode, env);
			if (originalUrl) {
				return Response.redirect(originalUrl, 302);
			}
		}

		// Mantener compatibilidad con endpoint por defecto
		return new Response("Hello World!");
	},
} satisfies ExportedHandler<Env>;
