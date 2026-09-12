/**
 * Cross-browser Fullscreen & Device Detection utilities for ProctorED.
 *
 * Supports standard Fullscreen API, WebKit (Safari/iOS), Mozilla (Firefox),
 * and legacy Microsoft vendor prefixes.
 */

interface WebKitDocument extends Document {
  webkitFullscreenElement?: Element | null;
  webkitFullscreenEnabled?: boolean;
  webkitExitFullscreen?: () => Promise<void> | void;
  mozFullScreenElement?: Element | null;
  mozFullScreenEnabled?: boolean;
  mozCancelFullScreen?: () => Promise<void> | void;
  msFullscreenElement?: Element | null;
  msFullscreenEnabled?: boolean;
  msExitFullscreen?: () => Promise<void> | void;
}

interface WebKitHTMLElement extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void> | void;
  webkitRequestFullScreen?: () => Promise<void> | void;
  mozRequestFullScreen?: () => Promise<void> | void;
  msRequestFullscreen?: () => Promise<void> | void;
}

/**
 * Detects if current client is an iPhone or iPod.
 * Apple iOS strictly limits HTML5 Fullscreen API on iPhones to `<video>` elements only.
 * Full element fullscreen is only supported on iPadOS and macOS Safari.
 */
export function isIPhoneDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const userAgent = navigator.userAgent || "";
  // Check for iPhone / iPod
  return /iPhone|iPod/i.test(userAgent);
}

/**
 * Checks if the Fullscreen API is available and enabled in the current browser.
 * Always returns false on iPhone.
 */
export function isFullscreenSupported(): boolean {
  if (typeof document === "undefined") return false;
  if (isIPhoneDevice()) return false;

  const doc = document as WebKitDocument;
  const docEl = document.documentElement as WebKitHTMLElement;

  const hasMethod = Boolean(
    docEl.requestFullscreen ||
      docEl.webkitRequestFullscreen ||
      docEl.webkitRequestFullScreen ||
      docEl.mozRequestFullScreen ||
      docEl.msRequestFullscreen
  );

  const hasEnabledFlag =
    doc.fullscreenEnabled !== undefined
      ? doc.fullscreenEnabled
      : doc.webkitFullscreenEnabled !== undefined
      ? doc.webkitFullscreenEnabled
      : doc.mozFullScreenEnabled !== undefined
      ? doc.mozFullScreenEnabled
      : doc.msFullscreenEnabled !== undefined
      ? doc.msFullscreenEnabled
      : true;

  return hasMethod && hasEnabledFlag;
}

/**
 * Checks if the browser is currently in fullscreen mode.
 */
export function isFullscreenActive(): boolean {
  if (typeof document === "undefined") return false;
  const doc = document as WebKitDocument;

  return Boolean(
    doc.fullscreenElement ||
      doc.webkitFullscreenElement ||
      doc.mozFullScreenElement ||
      doc.msFullscreenElement
  );
}

/**
 * Requests fullscreen mode on the given element (defaults to document.documentElement).
 * Must be triggered directly inside a user gesture (e.g. onClick).
 *
 * Returns a Promise that resolves to `true` if fullscreen was successfully entered,
 * or `false` if blocked, denied, canceled, or unsupported.
 */
export async function requestBrowserFullscreen(element?: HTMLElement): Promise<boolean> {
  if (typeof document === "undefined") return false;
  if (!isFullscreenSupported()) return false;

  const target = (element ?? document.documentElement) as WebKitHTMLElement;

  try {
    if (target.requestFullscreen) {
      await target.requestFullscreen();
    } else if (target.webkitRequestFullscreen) {
      await target.webkitRequestFullscreen();
    } else if (target.webkitRequestFullScreen) {
      await target.webkitRequestFullScreen();
    } else if (target.mozRequestFullScreen) {
      await target.mozRequestFullScreen();
    } else if (target.msRequestFullscreen) {
      await target.msRequestFullscreen();
    } else {
      return false;
    }

    // Verify fullscreen is actually active
    return isFullscreenActive();
  } catch {
    // Request denied by user, policy blocked, or gesture lost
    return false;
  }
}

/**
 * Exits fullscreen mode safely across browsers.
 */
export async function exitBrowserFullscreen(): Promise<void> {
  if (typeof document === "undefined") return;
  if (!isFullscreenActive()) return;

  const doc = document as WebKitDocument;

  try {
    if (doc.exitFullscreen) {
      await doc.exitFullscreen();
    } else if (doc.webkitExitFullscreen) {
      await doc.webkitExitFullscreen();
    } else if (doc.mozCancelFullScreen) {
      await doc.mozCancelFullScreen();
    } else if (doc.msExitFullscreen) {
      await doc.msExitFullscreen();
    }
  } catch {
    // Silently ignore if already exited
  }
}
