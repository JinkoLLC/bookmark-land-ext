import { browser } from "wxt/browser";
import { menuPosition } from "@/utils/panel-layout";

export type CollectionMenuState = {
  id: string;
  name: string;
  x: number;
  y: number;
};

/**
 * Right-click menu for a collection row. "Manage Collection" opens the
 * web app with that collection selected, where the full management UI
 * (rename, icon, share, delete…) lives.
 */
export function CollectionContextMenu({
  menu,
  onClose,
}: {
  menu: CollectionMenuState;
  onClose: () => void;
}) {
  const manage = () => {
    onClose();
    void browser.tabs.create({
      url: `${import.meta.env.WXT_WEB_APP_URL}/collections/${menu.id}`,
    });
  };

  const { left, top } = menuPosition(
    menu.x,
    menu.y,
    window.innerWidth,
    window.innerHeight,
  );

  return (
    <>
      <button
        type="button"
        aria-label="Close collection menu"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
        className="fixed inset-0 z-10 cursor-default"
      />
      <div
        role="menu"
        aria-label={`Collection menu for ${menu.name}`}
        style={{ left, top }}
        className="fixed z-20 min-w-40 rounded-md border border-neutral-200 bg-white p-1 shadow-md dark:border-neutral-700 dark:bg-neutral-900"
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
      >
        <button
          type="button"
          role="menuitem"
          autoFocus
          onClick={manage}
          className="w-full rounded px-2 py-1 text-left hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-ring dark:hover:bg-neutral-800"
        >
          Manage Collection
        </button>
      </div>
    </>
  );
}
