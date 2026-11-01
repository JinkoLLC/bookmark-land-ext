import { browser } from "wxt/browser";

/**
 * Shown when clerk-js hasn't managed to load for a while — usually a dead
 * dev-browser cookie (terminal: every FAPI call 401s and clerk never
 * retries), occasionally just a very slow network. The copy deliberately
 * does NOT claim the user is signed out; opening the web app refreshes the
 * session either way.
 */
export function AuthStalled() {
  const openWebApp = () => {
    void browser.tabs.create({
      url: `${import.meta.env.WXT_WEB_APP_URL}/sign-in`,
    });
  };
  return (
    <div className="flex flex-col gap-3">
      <p className="text-neutral-500">
        Can&apos;t verify your session right now. Opening bookmark.land
        usually refreshes it — then reopen this window.
      </p>
      <button
        type="button"
        onClick={openWebApp}
        className="self-start rounded-md bg-primary px-3 py-2 font-medium text-primary-foreground hover:opacity-90 focus-visible:outline-2 focus-visible:outline-ring"
      >
        Open bookmark.land
      </button>
    </div>
  );
}
