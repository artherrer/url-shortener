import { useState } from "react";
import { UrlForm } from "./components/UrlForm";
import { ShortenUrlResponseData } from "./types";

export function App() {
	const [history, setHistory] = useState<ShortenUrlResponseData[]>([]);

	const handleUrlCreated = (newUrl: ShortenUrlResponseData) => {
		setHistory((prev) => [newUrl, ...prev.filter((item) => item.code !== newUrl.code)]);
	};

	return (
		<div className="min-h-screen bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col justify-between selection:bg-indigo-500 selection:text-white">
			{/* Barra superior */}
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
								Cloudflare Worker + React
							</p>
						</div>
					</div>

					<div className="flex items-center gap-2">
						<span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
							<span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
							Online
						</span>
					</div>
				</div>
			</header>

			{/* Contenido principal */}
			<main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-12 flex flex-col items-center justify-center">
				<div className="text-center mb-8 max-w-xl">
					<h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white mb-3">
						Acorta tus enlaces en segundos
					</h2>
					<p className="text-base sm:text-lg text-slate-600 dark:text-slate-400">
						Pega tu enlace largo a continuación para generar una URL corta, segura y lista
						para compartir.
					</p>
				</div>

				<UrlForm onUrlCreated={handleUrlCreated} />

				{/* Historial reciente en la sesión */}
				{history.length > 1 && (
					<div className="mt-12 w-full max-w-2xl">
						<h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-4">
							Enlaces generados en esta sesión ({history.length})
						</h3>
						<div className="space-y-2">
							{history.slice(1).map((item) => (
								<div
									key={item.code}
									className="flex items-center justify-between p-3 rounded-xl bg-white/60 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-sm"
								>
									<div className="min-w-0 pr-4">
										<a
											href={item.shortUrl}
											target="_blank"
											rel="noopener noreferrer"
											className="font-medium text-indigo-600 dark:text-indigo-400 hover:underline block truncate"
										>
											{item.shortUrl}
										</a>
										<p className="text-xs text-slate-500 dark:text-slate-400 truncate">
											{item.originalUrl}
										</p>
									</div>
									<span className="text-xs text-slate-400 shrink-0 font-mono">
										{item.code}
									</span>
								</div>
							))}
						</div>
					</div>
				)}
			</main>

			{/* Pie de página */}
			<footer className="border-t border-slate-200 dark:border-slate-800 py-6 text-center text-xs text-slate-500 dark:text-slate-500">
				<p>URL Shortener Powered by Cloudflare Workers & React + Tailwind CSS</p>
			</footer>
		</div>
	);
}
export default App;
