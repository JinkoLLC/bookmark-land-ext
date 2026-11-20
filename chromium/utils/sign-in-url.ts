/** Sign in on the web app, then land on the page that confirms the extension is connected. */
export const SIGN_IN_URL = `${import.meta.env.WXT_WEB_APP_URL}/sign-in?redirect_url=${encodeURIComponent(
  "/extension/welcome?step=connect",
)}`;
