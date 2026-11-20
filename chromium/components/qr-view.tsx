import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { browser } from "wxt/browser";
import { StatusLine } from "@/components/status-line";
import { ViewHeader } from "@/components/view-header";
import { MORE_BELOW, useScrollMore } from "@/hooks/use-scroll-more";
import { copyText, copyWhenReady } from "@/utils/clipboard";
import { encodeQr } from "@/utils/qr-encode";
import { qrPng, qrSvg, svgDataUrl } from "@/utils/qr-render";
import { addressParts } from "@/utils/short-link";
import { extractDomain } from "../shared/url";

const RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
const MUTED = "text-neutral-500 dark:text-neutral-400";
const OUTLINE = `rounded-md border border-neutral-300 px-3 font-medium hover:bg-neutral-50 aria-disabled:opacity-60 dark:border-neutral-700 dark:hover:bg-neutral-800 ${RING}`;
const FILLED = `rounded-md bg-primary px-3 py-2 font-medium text-primary-foreground hover:bg-primary-hover aria-disabled:opacity-70 ${RING}`;
/** A button that can't work now: flat and grey, so it never reads as the way forward. */
const UNAVAILABLE = "cursor-not-allowed rounded-md border border-dashed border-neutral-300 bg-neutral-100 px-3 font-medium text-neutral-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400";
/** A code past this version has modules too fine to scan reliably off a screen at the popup's size. */
const DENSE_ABOVE_VERSION = 25;
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
export function QrImage({
  svg,
  label,
  size,
}: {
  svg: string;
  label: string;
  size: number;
}) {
  return (
    <img
      src={svgDataUrl(svg)}
      alt={label}
      width={size}
      height={size}
      className="shrink-0 rounded"
    />
  );
}

/**
 * A page's address, in full while it fits in six lines, so a query string is
 * there to read before anything is made from it. Only a longer one is held to
 * six lines, with a disclosure showing all of it.
 */
export function PageAddress({
  text: address,
  id,
  className = "",
}: {
  /** The address, or the short sentence it is given in ("Opens …"). */
  text: string;
  id?: string;
  className?: string;
}) {
  const text = useRef<HTMLParagraphElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const [long, setLong] = useState(false);
  const [open, setOpen] = useState(false);
  useLayoutEffect(() => {
    const element = text.current;
    // Measured while held to six lines: is anything cut off?
    if (element && !open) setLong(element.scrollHeight > element.clientHeight + 1);
  }, [address, open]);
  return (
    <div className="min-w-0">
      {/* A long address pushes the control under it out of sight: once open there is one above it too, and that one is the Tab stop. */}
      {long && open && (
        <button
          type="button"
          aria-expanded
          onClick={() => {
            setOpen(false);
            // This button goes away: focus stays on the disclosure.
            toggle.current?.focus();
          }}
          className={`block min-h-6 text-xs ${TEXT_LINK}`}
        >
          Hide full address
        </button>
      )}
      {/* Wraps after a separator; only a long run without one breaks mid-word. */}
      <p ref={text} id={id} className={`text-xs [overflow-wrap:anywhere] ${open ? "" : "line-clamp-6"} ${className}`}>
        {addressParts(address).map((part, index) => (
          <Fragment key={index}>
            {index > 0 && <wbr />}
            {part}
          </Fragment>
        ))}
      </p>
      {long && (
        <button
          ref={toggle}
          type="button"
          aria-expanded={open}
          tabIndex={open ? -1 : undefined}
          onClick={() => setOpen(!open)}
          className={`block min-h-6 text-xs ${TEXT_LINK}`}
        >
          {open ? "Hide full address" : "Show full address"}
        </button>
      )}
    </div>
  );
}

/** A copy's outcome; "Copied" goes back to the button's own label after two seconds. */
export type CopyState = "idle" | "copied" | "failed";
export function useCopyState() {
  const [copy, setCopy] = useState<CopyState>("idle");
  useEffect(() => {
    if (copy !== "copied") return;
    const timer = setTimeout(() => setCopy("idle"), 2_000);
    return () => clearTimeout(timer);
  }, [copy]);
  return [copy, setCopy] as const;
}

/**
 * Copy image, Download PNG and Download SVG for one QR code. `stacked` is the
 * narrow column beside a small code: three outline buttons.
 */
export function QrExports({
  svg,
  fileName,
  stacked = false,
  copyState,
  onCopied,
}: {
  svg: string;
  fileName: string;
  stacked?: boolean;
  /** The copy's outcome when the owner holds it, and announces "copied" itself, beside another Copy. */
  copyState?: readonly [CopyState, (state: CopyState) => void];
  /** The image reached the clipboard. */
  onCopied?: () => void;
}) {
  // Drawn when the code appears, so a download runs straight from its click.
  // null = being drawn; "failed" = it can't be, which leaves the SVG.
  const [png, setPng] = useState<Blob | null | "failed">(null);
  const own = useCopyState();
  const [copy, setCopy] = copyState ?? own;
  useEffect(() => {
    let current = true;
    setPng(null);
    void qrPng(svg).then(
      (blob) => current && setPng(blob),
      (error) => {
        console.error("[extension] QR code PNG failed", error);
        if (current) setPng("failed");
      },
    );
    return () => {
      current = false;
    };
  }, [svg]);

  /** The PNG, drawn now if a click comes before the one above is ready. */
  const drawn = () => (png instanceof Blob ? Promise.resolve(png) : qrPng(svg));
  const copyImage = () => {
    setCopy("idle");
    void copyWhenReady("image/png", drawn()).then((ok) => {
      setCopy(ok ? "copied" : "failed");
      if (ok) onCopied?.();
    });
  };
  const height = stacked ? "py-1.5" : "py-2";
  const failed = png === "failed";

  return (
    <div className={`flex min-w-0 flex-col gap-2 ${stacked ? "flex-1" : ""}`}>
      <button
        type="button"
        // Without a PNG neither button can work, and the line below says so.
        disabled={failed}
        onClick={copyImage}
        className={failed ? `${UNAVAILABLE} ${height}` : stacked ? `${OUTLINE} ${height}` : FILLED}
      >
        {copy === "copied" ? "Copied" : "Copy image"}
      </button>
      <div className={`flex gap-2 ${stacked ? "flex-col" : ""}`}>
        <button
          type="button"
          disabled={failed}
          // A failure here is the same one the drawing above reports.
          onClick={() => void drawn().then((blob) => download(blob, `${fileName}.png`), () => {})}
          className={`flex-1 ${failed ? UNAVAILABLE : OUTLINE} ${height}`}
        >
          Download PNG
        </button>
        <button
          type="button"
          onClick={() => download(new Blob([svg], { type: "image/svg+xml" }), `${fileName}.svg`)}
          // The one export left without a PNG; beside the short link's filled Copy it stays an outline.
          className={`flex-1 ${failed && !stacked ? FILLED : `${OUTLINE} ${height}`}`}
        >
          Download SVG
        </button>
      </div>
      {!copyState && (
        <span role="status" className="sr-only">
          {copy === "copied" ? "Copied" : ""}
        </span>
      )}
      {failed ? (
        <StatusLine tone="error" role="alert" className="text-xs">
          Couldn&apos;t make the PNG. Use Download SVG.
        </StatusLine>
      ) : (
        copy === "failed" && (
          <StatusLine tone="error" role="alert" className="text-xs">
            Couldn&apos;t copy. Use Download PNG.
          </StatusLine>
        )
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
  onCopied,
}: {
  url: string;
  onBack: () => void;
  /** Opens the Short link view; absent signed out or when short links aren't open to the account. */
  onShortLink?: () => void;
  /** The address passes the local short-link checks: without it no short link is offered. */
  canShorten: boolean;
  /** What a copy here put on the clipboard, for the popup's root. */
  onCopied?: (what: "image" | "address") => void;
}) {
  const matrix = useMemo(() => encodeQr(url), [url]);
  const svg = useMemo(() => matrix && qrSvg(matrix), [matrix]);
  // A version's side is 17 + 4 x version modules.
  const dense = matrix !== null && matrix.length > 17 + 4 * DENSE_ABOVE_VERSION;
  const scroll = useScrollMore();
  const [copy, setCopy] = useCopyState();
  const shortLink = (label = "Use a short link") =>
    onShortLink &&
    canShorten && (
      <button type="button" onClick={onShortLink} className={`min-h-6 ${TEXT_LINK}`}>
        {label}
      </button>
    );
  return (
    <>
      <ViewHeader title="QR code" id="qr-heading" onBack={onBack} focusOnOpen />
      <main
        ref={scroll.ref}
        aria-labelledby="qr-heading"
        // A stop of its own only when there is something to scroll, as in the main view.
        tabIndex={scroll.overflows ? 0 : undefined}
        className={`min-h-0 scroll-py-2 overflow-y-auto focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring ${scroll.more ? MORE_BELOW : ""}`}
      >
        <div className="flex flex-col gap-2 p-3">
          {svg ? (
            <>
              <div className="flex justify-center">
                {/* The whole address: two pages of one site never share a name. */}
                <QrImage svg={svg} label={`QR code for ${url}`} size={200} />
              </div>
              <PageAddress text={url} id="qr-address" className={MUTED} />
              {/* Directly above the exports, so the warning and the action read together. */}
              {dense && (
                <p className={`text-xs ${MUTED}`}>
                  This code is dense. Scan it from the downloaded PNG or a print
                  {shortLink() ? <>, or {shortLink("use a short link")}.</> : "."}
                </p>
              )}
              <QrExports svg={svg} fileName={`qr-${extractDomain(url)}`} onCopied={() => onCopied?.("image")} />
              <p className={`text-xs ${MUTED}`}>
                Made in your browser. It isn&apos;t tracked and can&apos;t be changed after printing.
                {!dense && shortLink() && <> Want scans counted? {shortLink()}</>}
              </p>
            </>
          ) : (
            <>
              <StatusLine tone="error" role="alert" className="font-medium">
                This address is too long for a QR code.
              </StatusLine>
              {/* Said only where short links are offered at all. */}
              {onShortLink && !canShorten && (
                <p className="text-xs">A short link can&apos;t take an address this long either.</p>
              )}
              <PageAddress text={url} className={MUTED} />
              {/* The only thing to do here, so it is the filled button. */}
              <button
                type="button"
                onClick={() =>
                  void copyText(url).then((ok) => {
                    setCopy(ok ? "copied" : "failed");
                    if (ok) onCopied?.("address");
                  })
                }
                className={FILLED}
              >
                {copy === "copied" ? "Copied" : "Copy address"}
              </button>
              <span role="status" className="sr-only">
                {copy === "copied" ? "Copied" : ""}
              </span>
              {copy === "failed" && (
                <StatusLine tone="error" role="alert" className="text-xs">
                  Couldn&apos;t copy the address.
                </StatusLine>
              )}
              {shortLink() && <p className="text-xs">A short link&apos;s QR code would fit. {shortLink()}</p>}
            </>
          )}
        </div>
      </main>
    </>
  );
}
