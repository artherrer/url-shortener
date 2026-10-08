import { useEffect, useState } from "react";
import { UrlForm } from "./components/UrlForm";
import { AnalyticsModal } from "./components/AnalyticsModal";
import { LinkItem, ValidationResponse } from "./types";
import { urlApiClient } from "./services/api";

export function App() {
	const [links, setLinks] = useState<LinkItem[]>([]);
	const [isLoadingLinks, setIsLoadingLinks] = useState<boolean>(false);
	const [linksError, setLinksError] = useState<string | null>(null);

	// Redirection validator state
	const [testCode, setTestCode] = useState<string>("");
	const [checkingStatus, setCheckingStatus] = useState<boolean>(false);
	const [statusResult, setStatusResult] = useState<ValidationResponse | null>(null);

	// Analytics modal state
	const [selectedAnalyticsCode, setSelectedAnalyticsCode] = useState<string | null>(null);

	const fetchLinks = async () => {
		setIsLoadingLinks(true);
		setLinksError(null);
		try {
			const data = await urlApiClient.getLinks();
			setLinks(data);
		} catch (err) {
			setLinksError(err instanceof Error ? err.message : "Error loading links");
		} finally {
			setIsLoadingLinks(false);
		}
	};

	useEffect(() => {
		fetchLinks();
	}, []);

	const handleUrlCreated = () => {
		fetchLinks();
	};

	const handleCheckCode = async (codeToCheck?: string) => {
		const target = (codeToCheck || testCode).trim().replace(/^https?:\/\/[^/]+\//, "");
		if (!target) return;

		setTestCode(target);
		setCheckingStatus(true);
		setStatusResult(null);

		try {
			const result = await urlApiClient.checkRedirectionStatus(target);
			setStatusResult(result);
		} catch {
			setStatusResult({
				success: false,
				code: target,
				status: 500,
				valid: false,
				title: "Inspection Failed",
				description: "Unable to connect to worker to verify code status.",
			});
		} finally {
			setCheckingStatus(false);
		}
	};

	const formatRemainingTime = (remainingMs: number | null): string => {
		if (remainingMs === null) return "Never expires";
		if (remainingMs <= 0) return "Expired (410)";

		const totalSeconds = Math.floor(remainingMs / 1000);
		const days = Math.floor(totalSeconds / 86400);
		const hours = Math.floor((totalSeconds % 86400) / 3600);
		const minutes = Math.floor((totalSeconds % 3600) / 60);

		if (days > 0) return `${days}d ${hours}h remaining`;
		if (hours > 0) return `${hours}h ${minutes}m remaining`;
		if (minutes > 0) return `${minutes}m remaining`;
		return `${totalSeconds}s remaining`;
	};

	return (
		<div className="min-h-screen bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col justify-between selection:bg-indigo-500 selection:text-white">
			{/* Top Bar */}
			<header className="border-b border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 backdrop-blur-md sticky top-0 z-10">
				<div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
					<div className="flex items-center gap-2.5">
						<div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
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
						<div>
							<h1 className="text-lg font-bold bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-300 bg-clip-text text-transparent">
								URL Shortener
							</h1>
							<p className="text-xs text-slate-500 dark:text-slate-400">
								Cloudflare D1 + React
							</p>
						</div>
					</div>

					<div className="flex items-center gap-2">
						<span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
							<span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
							D1 Ready
						</span>
					</div>
				</div>
			</header>

			{/* Main Content */}
			<main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-10 space-y-12">
				{/* Header Section */}
				<div className="text-center max-w-xl mx-auto">
					<h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white mb-3">
						Shorten & Track Links
					</h2>
					<p className="text-base sm:text-lg text-slate-600 dark:text-slate-400">
						Generate short links with configurable expiration, persistent Cloudflare D1 storage, click tracking, and user-agent analytics.
					</p>
				</div>

				{/* URL Form Component */}
				<UrlForm onUrlCreated={handleUrlCreated} />

				{/* Redirection Status Checker */}
				<div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md rounded-2xl p-6 sm:p-8 shadow-lg border border-slate-200 dark:border-slate-800">
					<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
						<div>
							<h3 className="text-lg font-bold text-slate-900 dark:text-white">
								Redirection Status Checker
							</h3>
							<p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
								Inspect live redirection: <span className="font-semibold text-emerald-600 dark:text-emerald-400">302</span> (valid),{" "}
								<span className="font-semibold text-red-500">404</span> (not found), or{" "}
								<span className="font-semibold text-amber-500">410</span> (inactive / expired).
							</p>
						</div>

						<div className="flex items-center gap-2">
							<input
								type="text"
								value={testCode}
								onChange={(e) => setTestCode(e.target.value)}
								onKeyDown={(e) => e.key === "Enter" && handleCheckCode()}
								placeholder="Enter short code (e.g. aB3x9Z)"
								className="px-3.5 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
							/>
							<button
								type="button"
								onClick={() => handleCheckCode()}
								disabled={checkingStatus || !testCode.trim()}
								className="px-4 py-2 rounded-xl text-sm font-medium bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 hover:bg-slate-800 disabled:opacity-50 cursor-pointer transition"
							>
								{checkingStatus ? "Checking..." : "Inspect"}
							</button>
						</div>
					</div>

					{/* Result banner if inspected */}
					{statusResult && (
						<div
							className={`p-4 rounded-xl border mb-6 ${
								statusResult.status === 302
									? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200"
									: statusResult.status === 404
									? "bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800 text-red-900 dark:text-red-200"
									: "bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200"
							}`}
						>
							<div className="flex items-center justify-between mb-1.5">
								<span className="font-bold text-sm tracking-wide uppercase flex items-center gap-2">
									<span>{statusResult.title}</span>
									<span className="font-mono text-xs px-2 py-0.5 rounded bg-white/60 dark:bg-black/30 font-semibold">
										Code: {statusResult.code}
									</span>
								</span>
								<div className="flex items-center gap-2">
									<button
										type="button"
										onClick={() => setSelectedAnalyticsCode(statusResult.code)}
										className="text-xs font-semibold px-2.5 py-1 rounded bg-white/80 dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
									>
										View Analytics
									</button>
									<span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-white/70 dark:bg-black/40">
										HTTP {statusResult.status}
									</span>
								</div>
							</div>
							<p className="text-sm">{statusResult.description}</p>
							{statusResult.targetUrl && (
								<p className="text-xs mt-2 truncate font-mono">
									Redirect target:{" "}
									<a
										href={statusResult.targetUrl}
										target="_blank"
										rel="noopener noreferrer"
										className="underline hover:opacity-80"
									>
										{statusResult.targetUrl}
									</a>
								</p>
							)}
						</div>
					)}

					{/* Status Definitions Guide */}
					<div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
						<div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
							<div className="flex items-center gap-1.5 font-semibold text-emerald-600 dark:text-emerald-400 mb-1">
								<span className="w-2 h-2 rounded-full bg-emerald-500" />
								<span>302 Found (Valid)</span>
							</div>
							<p className="text-slate-600 dark:text-slate-400">
								Valid, active, and unexpired link. Performs standard temporary redirection without permanent browser caching.
							</p>
						</div>

						<div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
							<div className="flex items-center gap-1.5 font-semibold text-red-500 mb-1">
								<span className="w-2 h-2 rounded-full bg-red-500" />
								<span>404 Not Found</span>
							</div>
							<p className="text-slate-600 dark:text-slate-400">
								The short code does not exist in Cloudflare D1 or has been permanently removed.
							</p>
						</div>

						<div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
							<div className="flex items-center gap-1.5 font-semibold text-amber-500 mb-1">
								<span className="w-2 h-2 rounded-full bg-amber-500" />
								<span>410 Gone (Inactive / Expired)</span>
							</div>
							<p className="text-slate-600 dark:text-slate-400">
								Resource is deactivated (<code className="font-mono">active: false</code>) or has passed its expiration window (<code className="font-mono">expiresIn</code>).
							</p>
						</div>
					</div>
				</div>

				{/* Saved URLs Table (/api/links) */}
				<div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md rounded-2xl p-6 sm:p-8 shadow-lg border border-slate-200 dark:border-slate-800">
					<div className="flex items-center justify-between mb-6">
						<div>
							<h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
								<span>Saved URLs & Analytics</span>
								<span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-mono font-medium">
									/api/links
								</span>
							</h3>
							<p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
								Listing all URLs stored in D1 database with active state, expiration timer, and live clicks
							</p>
						</div>

						<button
							type="button"
							onClick={fetchLinks}
							disabled={isLoadingLinks}
							className="px-3.5 py-1.5 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition flex items-center gap-1.5 cursor-pointer"
						>
							<svg
								className={`w-3.5 h-3.5 ${isLoadingLinks ? "animate-spin" : ""}`}
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
							<span>Refresh</span>
						</button>
					</div>

					{linksError && (
						<div className="p-3 mb-4 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-xs">
							{linksError}
						</div>
					)}

					{isLoadingLinks && links.length === 0 ? (
						<div className="py-12 text-center text-slate-400 text-sm">
							Loading links from D1...
						</div>
					) : links.length === 0 ? (
						<div className="py-12 text-center text-slate-400 text-sm">
							No shortened links found in database. Create your first link above!
						</div>
					) : (
						<div className="overflow-x-auto">
							<table className="w-full text-left text-xs sm:text-sm">
								<thead>
									<tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase text-[11px] tracking-wider">
										<th className="pb-3 font-semibold">Code</th>
										<th className="pb-3 font-semibold">Short URL</th>
										<th className="pb-3 font-semibold">Clicks</th>
										<th className="pb-3 font-semibold">Status</th>
										<th className="pb-3 font-semibold">Expires In</th>
										<th className="pb-3 font-semibold text-right">Actions</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
									{links.map((link) => {
										const isExpired = link.expiresIn !== null && link.expiresIn <= 0;
										return (
											<tr key={link.code} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
												<td className="py-3.5 pr-2 font-mono font-semibold text-indigo-600 dark:text-indigo-400">
													{link.code}
												</td>
												<td className="py-3.5 pr-2 font-medium">
													<a
														href={link.shortUrl}
														target="_blank"
														rel="noopener noreferrer"
														className="hover:underline text-slate-900 dark:text-white truncate block max-w-[200px]"
													>
														{link.shortUrl}
													</a>
												</td>
												<td className="py-3.5 pr-2">
													<button
														type="button"
														onClick={() => setSelectedAnalyticsCode(link.code)}
														className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-mono text-xs font-semibold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition cursor-pointer"
														title="View detailed visit analytics"
													>
														<span>{link.clicks}</span>
														<span className="text-[10px] text-indigo-400">clicks</span>
													</button>
												</td>
												<td className="py-3.5 pr-2">
													{!link.active ? (
														<span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300">
															Inactive (410)
														</span>
													) : isExpired ? (
														<span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
															Expired (410)
														</span>
													) : (
														<span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
															Active (302)
														</span>
													)}
												</td>
												<td className="py-3.5 pr-2 text-xs font-mono text-slate-600 dark:text-slate-400">
													{formatRemainingTime(link.expiresIn)}
												</td>
												<td className="py-3.5 text-right space-x-1.5 sm:space-x-2">
													<button
														type="button"
														onClick={() => setSelectedAnalyticsCode(link.code)}
														className="text-xs px-2.5 py-1 rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 transition cursor-pointer font-medium"
													>
														Analytics
													</button>
													<button
														type="button"
														onClick={() => handleCheckCode(link.code)}
														className="text-xs px-2.5 py-1 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition cursor-pointer"
													>
														Validate
													</button>
													<a
														href={link.shortUrl}
														target="_blank"
														rel="noopener noreferrer"
														className="text-xs px-2.5 py-1 rounded bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:bg-slate-800 transition inline-block font-medium"
													>
														Visit
													</a>
												</td>
											</tr>
										);
									})}
								</tbody>
							</table>
						</div>
					)}
				</div>
			</main>

			{/* Analytics Modal Component */}
			<AnalyticsModal
				code={selectedAnalyticsCode}
				onClose={() => setSelectedAnalyticsCode(null)}
			/>

			{/* Footer */}
			<footer className="border-t border-slate-200 dark:border-slate-800 py-6 text-center text-xs text-slate-500">
				<p>URL Shortener Powered by Cloudflare Workers, D1 & React + Tailwind CSS</p>
			</footer>
		</div>
	);
}
export default App;
