import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  isIPhoneDevice,
  isFullscreenSupported,
  isFullscreenActive,
  requestBrowserFullscreen,
  exitBrowserFullscreen,
} from "@/lib/exam/fullscreen";

describe("lib/exam/fullscreen", () => {
  const originalNavigator = globalThis.navigator;
  const originalDocument = (globalThis as unknown as { document?: unknown }).document;

  let mockDoc: {
    documentElement: Record<string, unknown>;
    fullscreenEnabled?: boolean;
    webkitFullscreenEnabled?: boolean;
    mozFullScreenEnabled?: boolean;
    msFullscreenEnabled?: boolean;
    fullscreenElement?: unknown;
    webkitFullscreenElement?: unknown;
    mozFullScreenElement?: unknown;
    msFullscreenElement?: unknown;
    exitFullscreen?: () => Promise<void>;
    webkitExitFullscreen?: () => Promise<void>;
    mozCancelFullScreen?: () => Promise<void>;
    msExitFullscreen?: () => Promise<void>;
  };

  beforeEach(() => {
    vi.restoreAllMocks();

    mockDoc = {
      documentElement: {},
      fullscreenEnabled: true,
      fullscreenElement: null,
    };

    Object.defineProperty(globalThis, "document", {
      value: mockDoc,
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "navigator", {
      value: originalNavigator,
      configurable: true,
      writable: true,
    });

    if (originalDocument === undefined) {
      delete (globalThis as unknown as { document?: unknown }).document;
    } else {
      Object.defineProperty(globalThis, "document", {
        value: originalDocument,
        configurable: true,
        writable: true,
      });
    }
  });

  describe("isIPhoneDevice", () => {
    it("detects iPhone user agent", () => {
      Object.defineProperty(globalThis, "navigator", {
        value: {
          userAgent:
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
        },
        configurable: true,
        writable: true,
      });

      expect(isIPhoneDevice()).toBe(true);
    });

    it("detects iPod user agent", () => {
      Object.defineProperty(globalThis, "navigator", {
        value: {
          userAgent:
            "Mozilla/5.0 (iPod touch; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15",
        },
        configurable: true,
        writable: true,
      });

      expect(isIPhoneDevice()).toBe(true);
    });

    it("returns false for iPad, Mac, Windows, and Android", () => {
      const agents = [
        "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36",
      ];

      for (const ua of agents) {
        Object.defineProperty(globalThis, "navigator", {
          value: { userAgent: ua },
          configurable: true,
          writable: true,
        });
        expect(isIPhoneDevice()).toBe(false);
      }
    });
  });

  describe("isFullscreenSupported", () => {
    it("returns false on iPhone devices regardless of method presence", () => {
      Object.defineProperty(globalThis, "navigator", {
        value: { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)" },
        configurable: true,
        writable: true,
      });

      mockDoc.documentElement.requestFullscreen = vi.fn();
      expect(isFullscreenSupported()).toBe(false);
    });

    it("returns true when standard requestFullscreen is available", () => {
      Object.defineProperty(globalThis, "navigator", {
        value: { userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
        configurable: true,
        writable: true,
      });

      mockDoc.documentElement.requestFullscreen = vi.fn();
      mockDoc.fullscreenEnabled = true;

      expect(isFullscreenSupported()).toBe(true);
    });

    it("returns true with WebKit prefixes (Safari on macOS / iPad)", () => {
      Object.defineProperty(globalThis, "navigator", {
        value: { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" },
        configurable: true,
        writable: true,
      });

      delete mockDoc.documentElement.requestFullscreen;
      mockDoc.documentElement.webkitRequestFullscreen = vi.fn();
      mockDoc.webkitFullscreenEnabled = true;
      delete mockDoc.fullscreenEnabled;

      expect(isFullscreenSupported()).toBe(true);
    });

    it("returns false if no fullscreen request methods exist", () => {
      Object.defineProperty(globalThis, "navigator", {
        value: { userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
        configurable: true,
        writable: true,
      });

      mockDoc.documentElement = {};
      expect(isFullscreenSupported()).toBe(false);
    });
  });

  describe("isFullscreenActive", () => {
    it("returns true when document.fullscreenElement is set", () => {
      mockDoc.fullscreenElement = mockDoc.documentElement;
      expect(isFullscreenActive()).toBe(true);
    });

    it("returns true when webkitFullscreenElement is set", () => {
      mockDoc.fullscreenElement = null;
      mockDoc.webkitFullscreenElement = mockDoc.documentElement;
      expect(isFullscreenActive()).toBe(true);
    });

    it("returns false when no fullscreenElement is present", () => {
      mockDoc.fullscreenElement = null;
      mockDoc.webkitFullscreenElement = null;
      expect(isFullscreenActive()).toBe(false);
    });
  });

  describe("requestBrowserFullscreen", () => {
    it("returns false on iPhone devices without attempting request", async () => {
      Object.defineProperty(globalThis, "navigator", {
        value: { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)" },
        configurable: true,
        writable: true,
      });

      const reqMock = vi.fn();
      mockDoc.documentElement.requestFullscreen = reqMock;

      const result = await requestBrowserFullscreen();
      expect(result).toBe(false);
      expect(reqMock).not.toHaveBeenCalled();
    });

    it("calls requestFullscreen and returns true if active", async () => {
      Object.defineProperty(globalThis, "navigator", {
        value: { userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
        configurable: true,
        writable: true,
      });

      mockDoc.documentElement.requestFullscreen = vi.fn().mockImplementation(async () => {
        mockDoc.fullscreenElement = mockDoc.documentElement;
      });

      const result = await requestBrowserFullscreen();
      expect(result).toBe(true);
    });

    it("returns false if requestFullscreen rejects (user denied or policy error)", async () => {
      Object.defineProperty(globalThis, "navigator", {
        value: { userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
        configurable: true,
        writable: true,
      });

      mockDoc.documentElement.requestFullscreen = vi.fn().mockRejectedValue(new Error("Permissions denied"));

      const result = await requestBrowserFullscreen();
      expect(result).toBe(false);
    });
  });

  describe("exitBrowserFullscreen", () => {
    it("calls document.exitFullscreen when fullscreen is active", async () => {
      mockDoc.fullscreenElement = mockDoc.documentElement;

      const exitMock = vi.fn().mockResolvedValue(undefined);
      mockDoc.exitFullscreen = exitMock;

      await exitBrowserFullscreen();
      expect(exitMock).toHaveBeenCalled();
    });

    it("does not call exitFullscreen if not in fullscreen", async () => {
      mockDoc.fullscreenElement = null;

      const exitMock = vi.fn();
      mockDoc.exitFullscreen = exitMock;

      await exitBrowserFullscreen();
      expect(exitMock).not.toHaveBeenCalled();
    });
  });
});
