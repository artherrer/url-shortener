import React, { useState, ChangeEvent, FormEvent } from "react";
import { urlApiClient } from "../services/api";
import { ShortenUrlResponseData } from "../types";

export interface UrlFormProps {
	onUrlCreated?: (data: { code: string; shortUrl: string; data?: ShortenUrlResponseData }) => void;
}

const EXPIRATION_PRESETS = [
	{ label: "1 Day (86,400,000 ms)", value: 86400000 },
	{ label: "1 Hour (3,600,000 ms)", value: 3600000 },
	{ label: "7 Days (604,800,000 ms)", value: 604800000 },
	{ label: "30 Days (2,592,000,000 ms)", value: 2592000000 },
	{ label: "Custom Milliseconds", value: -1 },
];

export function UrlForm({ onUrlCreated }: UrlFormProps) {
	const [url, setUrl] = useState<string>("");
	const [selectedPreset, setSelectedPreset] = useState<number>(86400000);
	const [customExpiresIn, setCustomExpiresIn] = useState<string>("86400000");
	const [validationError, setValidationError] = useState<string | null>(null);
	const [isTouched, setIsTouched] = useState<boolean>(false);
	const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
	const [apiError, setApiError] = useState<string | null>(null);
	const [lastSuccess, setLastSuccess] = useState<{
		code: string;
		shortUrl: string;
		data?: ShortenUrlResponseData;
	} | null>(null);
	const [copied, setCopied] = useState<boolean>(false);

	/**
	 * Computes effective expiresIn value in milliseconds
	 */
	const getEffectiveExpiresIn = (): number => {
		if (selectedPreset === -1) {
			const parsed = parseInt(customExpiresIn, 10);
			return !isNaN(parsed) && parsed > 0 ? parsed : 86400000;
		}
		return selectedPreset;
	};

	/**
	 * Validates URL format and safety
	 */
	const validateUrl = (value: string): string | null => {
		const trimmed = value.trim();

		if (!trimmed) {
			return "URL is required.";
		}

		if (trimmed.length > 2048) {
			return "URL is too long (maximum 2048 characters).";
		}

		if (!/^https?:\/\//i.test(trimmed)) {
			return "URL must begin with http:// or https://";
		}

		try {
			const parsed = new URL(trimmed);

			if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
				return "Only HTTP or HTTPS protocols are permitted.";
			}

			if (!parsed.hostname || parsed.hostname.length < 3) {
				return "Domain or hostname is invalid.";
			}

			if (!parsed.hostname.includes(".") && parsed.hostname !== "localhost") {
				return "Enter a valid, complete domain name (e.g., example.com).";
			}

			if (/\s/.test(trimmed)) {
				return "URL cannot contain spaces.";
			}

			return null;
		} catch {
			return "Provided URL format is invalid.";
		}
	};

	const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
		const nextValue = e.target.value;
		setUrl(nextValue);
		setApiError(null);

		if (isTouched) {
			setValidationError(validateUrl(nextValue));
		}
	};

	const handleBlur = () => {
		setIsTouched(true);
		setValidationError(validateUrl(url));
	};

	const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		setIsTouched(true);

		const error = validateUrl(url);
		if (error) {
			setValidationError(error);
			return;
		}

		setValidationError(null);
		setApiError(null);
		setIsSubmitting(true);
		setCopied(false);

		const expiresInMs = getEffectiveExpiresIn();

		try {
			const result = await urlApiClient.shortenUrl(url, expiresInMs);
			setLastSuccess(result);
			setUrl("");
			setIsTouched(false);
			if (onUrlCreated) {
				onUrlCreated(result);
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : "Unexpected error while shortening URL.";
			setApiError(message);
		} finally {
			setIsSubmitting(false);
		}
	};

	const handleCopy = async (textToCopy: string) => {
		try {
			await navigator.clipboard.writeText(textToCopy);
			setCopied(true);
			setTimeout(() => setCopied(false), 2500);
		} catch {
			setCopied(false);
		}
	};

	const isValid = url.trim().length > 0 && validationError === null;

	return (
		<div className="w-full max-w-2xl mx-auto">
			<form
				onSubmit={handleSubmit}
				noValidate
				className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md rounded-2xl p-6 sm:p-8 shadow-xl border border-slate-200/80 dark:border-slate-800 transition-all duration-300 hover:shadow-2xl"
			>
				{/* URL Input */}
				<div className="mb-5">
					<label
						htmlFor="url-input"
						className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-2"
					>
						Target URL to shorten
					</label>
					<div className="relative">
						<div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 dark:text-slate-500">
							<svg
								className="w-5 h-5"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth="2"
									d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
								/>
							</svg>
						</div>

						<input
							id="url-input"
							type="url"
							value={url}
							onChange={handleChange}
							onBlur={handleBlur}
							placeholder="https://example.com/very/long/destination/url"
							disabled={isSubmitting}
							aria-invalid={!!validationError}
							aria-describedby={validationError ? "url-error" : undefined}
							className={`w-full pl-11 pr-10 py-3.5 rounded-xl border text-slate-900 dark:text-white bg-slate-50 dark:bg-slate-800/60 placeholder-slate-400 dark:placeholder-slate-500 text-sm sm:text-base focus:outline-none focus:ring-2 transition duration-200 ${
								validationError
									? "border-red-500 focus:border-red-500 focus:ring-red-500/20"
									: isTouched && isValid
									? "border-emerald-500 focus:border-emerald-500 focus:ring-emerald-500/20"
									: "border-slate-300 dark:border-slate-700 focus:border-indigo-500 focus:ring-indigo-500/20"
							} disabled:opacity-50 disabled:cursor-not-allowed`}
						/>

						{url && !isSubmitting && (
							<button
								type="button"
								onClick={() => {
									setUrl("");
									setValidationError(null);
									setIsTouched(false);
								}}
								className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
								title="Clear input"
							>
								<svg
									className="w-4 h-4"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth="2"
										d="M6 18L18 6M6 6l12 12"
									/>
								</svg>
							</button>
						)}
					</div>

					{/* Frontend Validation Error */}
					{validationError && (
						<p
							id="url-error"
							className="mt-2 text-xs sm:text-sm text-red-600 dark:text-red-400 flex items-center gap-1.5"
						>
							<svg
								className="w-4 h-4 shrink-0"
								fill="currentColor"
								viewBox="0 0 20 20"
							>
								<path
									fillRule="evenodd"
									d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
									clipRule="evenodd"
								/>
							</svg>
							<span>{validationError}</span>
						</p>
					)}
				</div>

				{/* Expiration Configuration Field (expiresIn) */}
				<div className="mb-6">
					<div className="flex items-center justify-between mb-2">
						<label
							htmlFor="expires-select"
							className="block text-sm font-semibold text-slate-800 dark:text-slate-200"
						>
							Link Lifetime (<code className="text-xs font-mono text-indigo-600 dark:text-indigo-400">expiresIn</code>)
						</label>
						<span className="text-xs text-slate-500 dark:text-slate-400">
							Default: 86,400,000 ms (24h)
						</span>
					</div>

					<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
						<select
							id="expires-select"
							value={selectedPreset}
							onChange={(e) => setSelectedPreset(Number(e.target.value))}
							disabled={isSubmitting}
							className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
						>
							{EXPIRATION_PRESETS.map((preset) => (
								<option key={preset.value} value={preset.value}>
									{preset.label}
								</option>
							))}
						</select>

						{selectedPreset === -1 ? (
							<div className="relative">
								<input
									type="number"
									min="1000"
									step="1000"
									value={customExpiresIn}
									onChange={(e) => setCustomExpiresIn(e.target.value)}
									placeholder="Milliseconds (e.g. 86400000)"
									disabled={isSubmitting}
									className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
								/>
								<span className="absolute inset-y-0 right-3 flex items-center text-xs text-slate-400 pointer-events-none">
									ms
								</span>
							</div>
						) : (
							<div className="px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60 text-xs text-slate-600 dark:text-slate-400 flex items-center justify-between">
								<span>Effective duration:</span>
								<span className="font-mono font-medium text-slate-800 dark:text-slate-200">
									{getEffectiveExpiresIn().toLocaleString()} ms
								</span>
							</div>
						)}
					</div>
				</div>

				{/* API Error Box */}
				{apiError && (
					<div className="mb-6 p-4 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300 text-sm flex items-start gap-3">
						<svg
							className="w-5 h-5 shrink-0 mt-0.5 text-red-600 dark:text-red-400"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth="2"
								d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
							/>
						</svg>
						<div>
							<strong className="font-semibold block">Error shortening URL</strong>
							<span>{apiError}</span>
						</div>
					</div>
				)}

				{/* Submit Button */}
				<button
					type="submit"
					disabled={isSubmitting || (isTouched && !!validationError) || !url.trim()}
					className="w-full py-3.5 px-6 rounded-xl font-medium text-white bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-indigo-500/50 shadow-md shadow-indigo-500/25 transition duration-200 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:from-indigo-600 disabled:hover:to-violet-600 disabled:active:scale-100"
				>
					{isSubmitting ? (
						<>
							<svg
								className="animate-spin -ml-1 mr-2 h-5 w-5 text-white"
								xmlns="http://www.w3.org/2000/svg"
								fill="none"
								viewBox="0 0 24 24"
							>
								<circle
									className="opacity-25"
									cx="12"
									cy="12"
									r="10"
									stroke="currentColor"
									strokeWidth="4"
								/>
								<path
									className="opacity-75"
									fill="currentColor"
									d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
								/>
							</svg>
							<span>Generating Short URL...</span>
						</>
					) : (
						<>
							<span>Shorten URL</span>
							<svg
								className="w-5 h-5"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth="2"
									d="M14 5l7 7m0 0l-7 7m7-7H3"
								/>
							</svg>
						</>
					)}
				</button>
			</form>

			{/* Success Card displaying code and full shortUrl */}
			{lastSuccess && (
				<div className="mt-8 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md rounded-2xl p-6 shadow-xl border border-emerald-200 dark:border-emerald-900/50">
					<div className="flex items-center justify-between mb-3">
						<div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-semibold text-sm">
							<svg
								className="w-5 h-5"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth="2"
									d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
								/>
							</svg>
							<span>URL Shortened Successfully!</span>
						</div>
						<div className="flex items-center gap-2 text-xs">
							<span className="text-slate-400">Code:</span>
							<span className="font-mono bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-indigo-600 dark:text-indigo-400 font-bold">
								{lastSuccess.code}
							</span>
						</div>
					</div>

					<div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 bg-slate-50 dark:bg-slate-800/80 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700">
						<div className="flex-1 min-w-0">
							<p className="text-xs text-slate-500 dark:text-slate-400">Full Short URL:</p>
							<a
								href={lastSuccess.shortUrl}
								target="_blank"
								rel="noopener noreferrer"
								className="text-base font-semibold text-indigo-600 dark:text-indigo-400 hover:underline truncate block"
							>
								{lastSuccess.shortUrl}
							</a>
						</div>

						<div className="flex items-center gap-2 shrink-0">
							<button
								type="button"
								onClick={() => handleCopy(lastSuccess.shortUrl)}
								className={`px-4 py-2 rounded-lg text-sm font-medium transition cursor-pointer flex items-center gap-1.5 ${
									copied
										? "bg-emerald-600 text-white"
										: "bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/60"
								}`}
							>
								{copied ? (
									<>
										<svg
											className="w-4 h-4"
											fill="none"
											stroke="currentColor"
											viewBox="0 0 24 24"
										>
											<path
												strokeLinecap="round"
												strokeLinejoin="round"
												strokeWidth="2"
												d="M5 13l4 4L19 7"
											/>
										</svg>
										<span>Copied!</span>
									</>
								) : (
									<>
										<svg
											className="w-4 h-4"
											fill="none"
											stroke="currentColor"
											viewBox="0 0 24 24"
										>
											<path
												strokeLinecap="round"
												strokeLinejoin="round"
												strokeWidth="2"
												d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
											/>
										</svg>
										<span>Copy</span>
									</>
								)}
							</button>

							<a
								href={lastSuccess.shortUrl}
								target="_blank"
								rel="noopener noreferrer"
								className="p-2 rounded-lg text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-700/50 transition"
								title="Open in new tab"
							>
								<svg
									className="w-5 h-5"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth="2"
										d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
									/>
								</svg>
							</a>
						</div>
					</div>

					{lastSuccess.data?.originalUrl && (
						<p className="mt-3 text-xs text-slate-500 dark:text-slate-400 truncate">
							Destination: <span className="font-mono">{lastSuccess.data.originalUrl}</span>
						</p>
					)}
				</div>
			)}
		</div>
	);
}
