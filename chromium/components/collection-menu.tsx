import { useEffect, useRef } from "react";
import { browser } from "wxt/browser";
import { menuPosition } from "@/utils/panel-layout";
import { menuKeyIndex } from "@/utils/tree-keys";

export type CollectionMenuState = {
  id: string;
  name: string;
  /** Set for a published collection: its public address. */
  publishedUrl?: string;
  x: number;
  y: number;
};

const ITEM =
  "w-full rounded px-2 py-1 text-left hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring dark:hover:bg-neutral-800";

/**
 * Menu for a collection row (right-click, the Menu key or Shift+F10).
 * "Manage Collection" opens the web app with that collection selected, where
 * the full management UI (rename, icon, share, delete…) lives.
 */
export function CollectionContextMenu({
  menu,
  onClose,
}: {
  menu: CollectionMenuState;
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Focus moves into the menu, and back to the row it was opened from.
  useEffect(() => {
    const opener = document.activeElement;
    menuRef.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    return () => {
      if (opener instanceof HTMLElement) opener.focus();
    };
  }, []);

  const open = (url: string) => {
    onClose();
    void browser.tabs.create({ url });
  };

  const { left, top } = menuPosition(
    menu.x,
    menu.y,
    window.innerWidth,
    window.innerHeight,
  );

  return (
    <>
      {/* Pointer-only backdrop; the keyboard closes with Escape or Tab. */}
      <div
        aria-hidden="true"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
        className="fixed inset-0 z-10"
      />
      <div
        ref={menuRef}
        role="menu"
        aria-label={`Collection menu for ${menu.name}`}
        style={{ left, top }}
        className="fixed z-20 min-w-40 rounded-md border border-neutral-200 bg-white p-1 shadow-md dark:border-neutral-700 dark:bg-neutral-900"
        onKeyDown={(e) => {
          if (e.key === "Escape" || e.key === "Tab") {
            e.preventDefault();
            onClose();
            return;
          }
          const items = [...e.currentTarget.querySelectorAll<HTMLElement>("[role=menuitem]")];
          const next = menuKeyIndex(e.key, items.indexOf(e.target as HTMLElement), items.length);
          if (next === null) return;
          e.preventDefault();
          items[next].focus();
        }}
      >
        <button
          type="button"
          role="menuitem"
          onClick={() =>
            open(`${import.meta.env.WXT_WEB_APP_URL}/collections/${menu.id}`)
          }
          className={ITEM}
        >
          Manage Collection
        </button>
        {menu.publishedUrl && (
          <button
            type="button"
            role="menuitem"
            onClick={() => open(menu.publishedUrl!)}
            className={ITEM}
          >
            Open published collection
          </button>
        )}
      </div>
    </>
  );
}
