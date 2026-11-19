import { useEffect, useMemo, useState } from "react";
import { browser } from "wxt/browser";
import { StatusLine } from "@/components/status-line";
import { ViewHeader } from "@/components/view-header";
import { copyWhenReady } from "@/utils/clipboard";
import { encodeQr } from "@/utils/qr-encode";
import { qrPng, qrSvg, svgDataUrl } from "@/utils/qr-render";
import { extractDomain } from "../shared/url";

const RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
const MUTED = "text-neutral-500 dark:text-neutral-400";
const OUTLINE = `rounded-md border border-neutral-300 px-3 font-medium hover:bg-neutral-50 aria-disabled:opacity-60 dark:border-neutral-700 dark:hover:bg-neutral-800 ${RING}`;
const FILLED = `rounded-md bg-primary px-3 py-2 font-medium text-primary-foreground hover:opacity-90 ${RING}`;
export const TEXT_LINK = `rounded underline underline-offset-2 hover:text-neutral-950 dark:hover:text-white ${RING}`;

/**
 * The decided fallback if a real toolbar popup cuts a download off when it
 * closes: set this and the Download buttons open the image in a new tab,
 * where it can be saved. Needs no permission either way.
 */
const DOWNLOAD_IN_NEW_TAB = false;

function download(blob: Blob, name: string) {
  if (DOWNLOAD_IN_NEW_TAB) {
    // A data: address outlives the popup; a blob: address would die with it.
    const reader = new FileReader();
    reader.onload = () => void browser.tabs.create({ url: String(reader.result) });
    reader.readAsDataURL(blob);
    return;
  }
  const link = document.createElement("a");
  // Not revoked: the browser may still be reading it, and it goes with the popup.
  link.href = URL.createObjectURL(blob);
  link.download = name;
  link.click();
}

/** The SVG of the QR code for `text`; null when the text is too long for one. */
export function useQrSvg(text: string): string | null {
  return useMemo(() => {
    const matrix = encodeQr(text);
    return matrix && qrSvg(matrix);
  }, [text]);
}

/** A QR code on screen: dark on white in both themes, named for what it opens. */
export function QrImage({ svg, label, size }: { svg: string; label: string; size: number }) {
  return <img src={svgDataUrl(svg)} alt={label} width={size} height={size} className="shrink-0 rounded" />;
}

/**
 * Copy image, Download PNG and Download SVG for one QR code. `stacked` is the
 * narrow column beside a small code: three outline buttons.
 */
export function QrExports({ svg, fileName, stacked = false }: { svg: string; fileName: string; stacked?: boolean }) {
  // Drawn when the code appears, so a download runs straight from its click.
  const [png, setPng] = useState<Blob | null>(null);
  const [copy, setCopy] = useState<"idle" | "copied" | "failed">("idle");
  useEffect(() => {
    let current = true;
    void qrPng(svg).then(
      (blob) => current && setPng(blob),
      (error) => console.error("[extension] QR code PNG failed", error),
    );
    return () => {
      current = false;
    };
  }, [svg]);

  const copyImage = () => {
    setCopy("idle");
    void copyWhenReady("image/png", png ? Promise.resolve(png) : qrPng(svg)).then((ok) =>
      setCopy(ok ? "copied" : "failed"),
    );
  };
  const height = stacked ? "py-1.5" : "py-2";

  return (
    <div className={`flex min-w-0 flex-col gap-2 ${stacked ? "flex-1" : ""}`}>
      <button type="button" onClick={copyImage} className={stacked ? `${OUTLINE} ${height}` : FILLED}>
        {copy === "copied" ? "Copied" : "Copy image"}
      </button>
      <div className={`flex gap-2 ${stacked ? "flex-col" : ""}`}>
        <button
          type="button"
          aria-disabled={!png}
          onClick={() => png && download(png, `${fileName}.png`)}
          className={`flex-1 ${OUTLINE} ${height}`}
        >
          Download PNG
        </button>
        <button
          type="button"
          onClick={() => download(new Blob([svg], { type: "image/svg+xml" }), `${fileName}.svg`)}
          className={`flex-1 ${OUTLINE} ${height}`}
        >
          Download SVG
        </button>
      </div>
      <span role="status" className="sr-only">
        {copy === "copied" ? "Copied" : ""}
      </span>
      {copy === "failed" && (
        <StatusLine tone="error" role="alert" className="text-xs">
          Couldn&apos;t copy. Use Download PNG.
        </StatusLine>
      )}
    </div>
  );
}

/**
 * A plain QR code of the page's address: made in the browser, nothing sent
 * or stored. Replaces the popup's content; only its Back row stays fixed.
 */
export function QrView({
  url,
  onBack,
  onShortLink,
  canShorten,
}: {
  url: string;
  onBack: () => void;
  /** Opens the Short link view; absent signed out or when short links aren't open to the account. */
  onShortLink?: () => void;
  /** The address passes the local short-link checks. */
  canShorten: boolean;
}) {
  const svg = useQrSvg(url);
  const shortLink = onShortLink && (
    <button type="button" onClick={onShortLink} className={`min-h-6 ${TEXT_LINK}`}>
      Use a short link
    </button>
  );
  return (
    <>
      <ViewHeader title="QR code" id="qr-heading" onBack={onBack} focusOnOpen />
      <main className="flex min-h-0 scroll-py-2 flex-col gap-2 overflow-y-auto p-3">
        {svg ? (
          <>
            <div className="flex justify-center">
              <QrImage svg={svg} label={`QR code for ${url}`} size={200} />
            </div>
            <p className="break-all text-xs">{url}</p>
            <QrExports svg={svg} fileName={`qr-${extractDomain(url)}`} />
            <p className={`text-xs ${MUTED}`}>
              Made in your browser. It isn&apos;t tracked and can&apos;t be changed after printing.
              {shortLink && <> Want scans counted? {shortLink}</>}
            </p>
          </>
        ) : (
          <>
            <StatusLine tone="error" role="alert" className="font-medium">
              This address is too long for a QR code.
            </StatusLine>
            {/* Only its start: thousands of characters would be all this view shows. */}
            <p className={`line-clamp-3 break-all text-xs ${MUTED}`} title={url}>
              {url}
            </p>
            {/* An address this long is over the short-link limit today; the rule is kept as planned. */}
            {shortLink && canShorten && <p className="text-xs">A short link&apos;s QR code would fit. {shortLink}</p>}
          </>
        )}
      </main>
    </>
  );
}
