(function () {
  "use strict";

  var script = document.currentScript;
  if (!script) return;

  var company = (script.getAttribute("data-company") || "").trim();
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(company)) return;

  var scriptUrl;
  try {
    scriptUrl = new URL(script.src, window.location.href);
  } catch (_) {
    return;
  }
  if (scriptUrl.protocol !== "https:" && !(scriptUrl.protocol === "http:" && scriptUrl.hostname === "localhost")) return;

  var initialPosition = script.getAttribute("data-position") === "left" ? "left" : "right";
  var frame = document.createElement("iframe");
  frame.title = "Live Chat";
  frame.setAttribute("aria-label", "Live Chat");
  frame.setAttribute("allow", "clipboard-write");
  frame.setAttribute("sandbox", "allow-scripts allow-forms allow-same-origin allow-popups");
  frame.setAttribute("loading", "eager");
  frame.setAttribute("scrolling", "no");
  frame.referrerPolicy = "strict-origin-when-cross-origin";
  frame.style.position = "fixed";
  frame.style.display = "block";
  frame.style.bottom = "10px";
  frame.style.left = initialPosition === "left" ? "10px" : "auto";
  frame.style.right = initialPosition === "right" ? "10px" : "auto";
  // Default launcher is 60px with 6px breathing room on each side.
  frame.style.width = "72px";
  frame.style.height = "72px";
  frame.style.maxWidth = "calc(100vw - 20px)";
  frame.style.maxHeight = "calc(100vh - 20px)";
  frame.style.margin = "0";
  frame.style.padding = "0";
  frame.style.border = "0";
  frame.style.background = "transparent";
  frame.style.zIndex = "2147483000";
  frame.style.overflow = "hidden";
  frame.style.colorScheme = "normal";
  frame.style.transition = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "none"
    : "width 120ms ease, height 120ms ease";
  frame.style.borderRadius = "50%";

  var lastResizeData = {
    open: false,
    width: 380,
    height: 620,
    position: initialPosition,
    launcherSize: 60,
    launcherShape: "CIRCLE",
    panelRadius: 18
  };

  function sendInit() {
    if (!frame.contentWindow) return;
    frame.contentWindow.postMessage({
      type: "conventus-live-chat-init",
      siteOrigin: window.location.origin,
      siteUrl: window.location.href
    }, scriptUrl.origin);
  }

  function resizeFrame(data) {
    lastResizeData = Object.assign({}, lastResizeData, data);
    var state = lastResizeData;
    var isLeft = state.position === "left" || (!state.position && initialPosition === "left");
    frame.style.left = isLeft ? "16px" : "auto";
    frame.style.right = isLeft ? "auto" : "16px";

    if (state.open) {
      var maxWidth = Math.max(1, window.innerWidth - 32);
      var maxHeight = Math.max(1, window.innerHeight - 32);
      frame.style.bottom = "16px";
      frame.style.maxWidth = maxWidth + "px";
      frame.style.maxHeight = maxHeight + "px";
      frame.style.width = Math.min(Number(state.width) || 380, maxWidth) + "px";
      frame.style.height = Math.min(Number(state.height) || 620, maxHeight) + "px";
      frame.style.borderRadius = Math.min(28, Math.max(8, Number(state.panelRadius) || 18)) + "px";
    } else {
      var launcherSize = Math.min(80, Math.max(52, Number(state.launcherSize) || 60));
      var launcherFrameSize = launcherSize + 12;
      var availableWidth = Math.max(1, window.innerWidth - 20);
      var availableHeight = Math.max(1, window.innerHeight - 20);
      frame.style.bottom = "10px";
      frame.style.maxWidth = availableWidth + "px";
      frame.style.maxHeight = availableHeight + "px";
      frame.style.width = Math.min(launcherFrameSize, availableWidth) + "px";
      frame.style.height = Math.min(launcherFrameSize, availableHeight) + "px";
      frame.style.borderRadius = state.launcherShape === "ROUNDED" ? "18px" : "50%";
    }
  }

  // Register listeners before adding the iframe so a fast load/ready message
  // cannot race the parent's message handler.
  window.addEventListener("message", function (event) {
    if (event.origin !== scriptUrl.origin || event.source !== frame.contentWindow) return;
    var data = event.data;
    if (!data || typeof data !== "object") return;

    // The iframe announces readiness and retries until it receives this init.
    // This avoids losing the only handshake during React hydration.
    if (data.type === "conventus-live-chat-ready") {
      sendInit();
      return;
    }
    if (data.type !== "conventus-live-chat-resize" || typeof data.open !== "boolean") return;
    resizeFrame(data);
  }, false);

  frame.addEventListener("load", sendInit);

  window.addEventListener("resize", function () {
    if (lastResizeData.open) {
      resizeFrame({ open: true, width: 380, height: 620, position: lastResizeData.position });
    } else {
      resizeFrame({ open: false, position: lastResizeData.position });
    }
  }, { passive: true });

  frame.src = scriptUrl.origin + "/embed/live-chat/" + encodeURIComponent(company) + "?site=" + encodeURIComponent(window.location.origin);

  function mountFrame() {
    if (!document.body) {
      document.addEventListener("DOMContentLoaded", mountFrame, { once: true });
      return;
    }
    if (!frame.isConnected) document.body.appendChild(frame);
    sendInit();
  }

  mountFrame();
})();