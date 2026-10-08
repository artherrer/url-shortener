import { useEffect, useState } from "react";
import QRCode from "qrcode";

export interface QrCodeDisplayProps {
	url: string;
	code?: string;
	size?: number;
}

export function QrCodeDisplay({ url, code, size = 180 }: QrCodeDisplayProps) {
	const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let isMounted = true;

		if (!url) {
			setQrDataUrl(null);
			return;
		}

		QRCode.toDataURL(url, {
			width: size * 2, // 2x for sharp retina rendering
			margin: 2,
			color: {
				dark: "#0f172a", // slate-900
				light: "#ffffff",
			},
			errorCorrectionLevel: "M",
		})
			.then((dataUrl) => {
				if (isMounted) {
					setQrDataUrl(dataUrl);
					setError(null);
				}
			})
			.catch((err) => {
				if (isMounted) {
					setError("Failed to generate QR code");
					console.error("QR Code Error:", err);
				}
			});

		return () => {
			isMounted = false;
		};
	}, [url, size]);

	const handleDownload = () => {
		if (!qrDataUrl) return;
		const a = document.createElement("a");
		a.href = qrDataUrl;
		a.download = `qrcode-${code || "short-url"}.png`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
	};

	if (error) {
		return (
			<div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 text-xs text-center">
				{error}
			</div>
		);
	}

	return (
		<div className="flex flex-col items-center p-3.5 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
			<div className="p-2 bg-white rounded-lg shadow-inner">
				{qrDataUrl ? (
					<img
						src={qrDataUrl}
						alt={`QR code for ${url}`}
						width={size}
						height={size}
						className="rounded"
					/>
				) : (
					<div
						style={{ width: size, height: size }}
						className="flex items-center justify-center bg-slate-50 text-slate-400 text-xs"
					>
						Generating QR...
					</div>
				)}
			</div>

			<div className="mt-2.5 flex items-center justify-between w-full px-1">
				<span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
					Scan with camera
				</span>
				<button
					type="button"
					onClick={handleDownload}
					disabled={!qrDataUrl}
					className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 hover:underline flex items-center gap-1 cursor-pointer disabled:opacity-50"
				>
					<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth="2"
							d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
						/>
					</svg>
					<span>Download PNG</span>
				</button>
			</div>
		</div>
	);
}
