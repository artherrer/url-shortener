import React, { useEffect, useState } from "react";
import { urlApiClient } from "../services/api";
import { QrCodeDisplay } from "./QrCodeDisplay";
import { UrlAnalyticsData } from "../types";

export interface AnalyticsModalProps {
	code: string | null;
	onClose: () => void;
}

export function AnalyticsModal({ code, onClose }: AnalyticsModalProps) {
	const [data, setData] = useState<UrlAnalyticsData | null>(null);
	const [loading, setLoading] = useState<boolean>(true);
	const [error, setError] = useState<string | null>(null);

	const loadAnalytics = async (shortCode: string) => {
		setLoading(true);
		setError(null);
		try {
			const res = await urlApiClient.getAnalytics(shortCode);
			setData(res);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load analytics");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		if (code) {
			loadAnalytics(code);
		} else {
			setData(null);
		}
	}, [code]);

	// Close on Escape key press
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				onClose();
			}
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [onClose]);

	if (!code) return null;

	const formatDateTime = (isoString: string): string => {
		try {
			const d = new Date(isoString);
			return d.toLocaleString(undefined, {
				dateStyle: "medium",
				timeStyle: "medium",
			});
		} catch {
			return isoString;
		}
	};

	const parseUserAgentBadge = (ua: string): { label: string; color: string } => {
		const lower = ua.toLowerCase();
		if (lower.includes("curl") || lower.includes("postman") || lower.includes("http")) {
			return { label: "API / CLI", color: "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300" };
		}
		if (lower.includes("mobile") || lower.includes("android") || lower.includes("iphone")) {
			return { label: "Mobile", color: "bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300" };
		}
		if (lower.includes("chrome") && !lower.includes("edg")) {
			return { label: "Chrome", color: "bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300" };
		}
		if (lower.includes("safari") && !lower.includes("chrome")) {
			return { label: "Safari", color: "bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300" };
		}
		if (lower.includes("firefox")) {
			return { label: "Firefox", color: "bg-orange-100 dark:bg-orange-950/60 text-orange-700 dark:text-orange-300" };
		}
		if (lower.includes("edg")) {
			return { label: "Edge", color: "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300" };
		}
		return { label: "Browser", color: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300" };
	};

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
			<div
				className="bg-white dark:bg-slate-900 rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden"
				role="dialog"
				aria-modal="true"
			>
				{/* Modal Header */}
				<div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
					<div className="flex items-center gap-2.5">
						<div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
							<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth="2"
									d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
								/>
							</svg>
						</div>
						<div>
							<h3 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
								<span>URL Analytics</span>
								<span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-indigo-600 dark:text-indigo-400">
									{code}
								</span>
							</h3>
							<p className="text-xs text-slate-500 dark:text-slate-400">
								Click counts and visitor logs
							</p>
						</div>
					</div>

					<div className="flex items-center gap-2">
						<button
							type="button"
							onClick={() => loadAnalytics(code)}
							disabled={loading}
							className="p-2 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
							title="Refresh data"
						>
							<svg
								className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth="2"
									d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
								/>
							</svg>
						</button>
						<button
							type="button"
							onClick={onClose}
							className="p-2 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
							title="Close modal"
						>
							<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
							</svg>
						</button>
					</div>
				</div>

				{/* Modal Body */}
				<div className="p-6 overflow-y-auto flex-1 space-y-6">
					{loading && !data ? (
						<div className="py-12 text-center text-slate-400 text-sm">
							Loading analytics data...
						</div>
					) : error ? (
						<div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300 text-sm">
							{error}
						</div>
					) : data ? (
						<>
							{/* Summary Cards */}
							<div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
								<div className="p-4 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/40">
									<p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
										Total Clicks
									</p>
									<p className="text-2xl sm:text-3xl font-extrabold text-indigo-900 dark:text-indigo-100 mt-1">
										{data.clicks.toLocaleString()}
									</p>
								</div>

								<div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800">
									<p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
										Status
									</p>
									<p className="mt-1.5">
										{data.active ? (
											<span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
												<span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
												Active
											</span>
										) : (
											<span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300">
												Inactive
											</span>
										)}
									</p>
								</div>

								<div className="col-span-2 sm:col-span-1 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800">
									<p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
										Visits Logged
									</p>
									<p className="text-2xl sm:text-3xl font-extrabold text-slate-800 dark:text-slate-200 mt-1">
										{data.visits.length}
									</p>
								</div>
							</div>

							{/* URL details */}
							<div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 text-xs space-y-1.5">
								<div className="flex items-center justify-between">
									<span className="text-slate-400">Short URL:</span>
									<a
										href={data.shortUrl}
										target="_blank"
										rel="noopener noreferrer"
										className="font-medium text-indigo-600 dark:text-indigo-400 hover:underline truncate max-w-xs"
									>
										{data.shortUrl}
									</a>
								</div>
								<div className="flex items-center justify-between">
									<span className="text-slate-400">Target:</span>
									<span className="font-mono text-slate-600 dark:text-slate-300 truncate max-w-xs">
										{data.originalUrl}
									</span>
								</div>
							</div>

							{/* QR Code Container */}
							<div className="flex flex-col sm:flex-row items-center gap-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800">
								<div className="shrink-0">
									<QrCodeDisplay url={data.shortUrl} code={data.code} size={110} />
								</div>
								<div className="text-xs text-slate-500 dark:text-slate-400 space-y-1 text-center sm:text-left">
									<p className="font-semibold text-slate-800 dark:text-slate-200">
										Scan or Share QR Code
									</p>
									<p>
										Scan this code to test real-time redirection and increment the click count above.
									</p>
								</div>
							</div>

							{/* Visit History Log */}
							<div>
								<h4 className="text-sm font-bold text-slate-900 dark:text-white mb-3 flex items-center justify-between">
									<span>Visitor History (User-Agent & Datetime)</span>
									<span className="text-xs font-normal text-slate-400">
										Showing last {data.visits.length} visits
									</span>
								</h4>

								{data.visits.length === 0 ? (
									<div className="p-8 text-center rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-slate-400 text-xs sm:text-sm">
										No visits recorded yet for this URL. Visit the short URL to generate real-time analytics!
									</div>
								) : (
									<div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
										{data.visits.map((visit, index) => {
											const badge = parseUserAgentBadge(visit.userAgent);
											return (
												<div
													key={visit.id || index}
													className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2"
												>
													<div className="min-w-0 flex-1">
														<div className="flex items-center gap-2 mb-1">
															<span className={`px-2 py-0.5 rounded font-medium text-[11px] ${badge.color}`}>
																{badge.label}
															</span>
															<span className="font-medium text-slate-700 dark:text-slate-300">
																{formatDateTime(visit.visitedAt)}
															</span>
														</div>
														<p
															className="font-mono text-[11px] text-slate-500 dark:text-slate-400 truncate"
															title={visit.userAgent}
														>
															{visit.userAgent}
														</p>
													</div>
												</div>
											);
										})}
									</div>
								)}
							</div>
						</>
					) : null}
				</div>

				{/* Modal Footer */}
				<div className="px-6 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex justify-end">
					<button
						type="button"
						onClick={onClose}
						className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition cursor-pointer"
					>
						Close
					</button>
				</div>
			</div>
		</div>
	);
}
