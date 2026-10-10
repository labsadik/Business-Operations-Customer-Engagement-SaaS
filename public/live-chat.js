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
  frame.style.bottom = "16px";
  frame.style.left = initialPosition === "left" ? "16px" : "auto";
  frame.style.right = initialPosition === "right" ? "16px" : "auto";
  frame.style.width = "76px";
  frame.style.height = "76px";
  frame.style.maxWidth = "calc(100vw - 32px)";
  frame.style.maxHeight = "calc(100vh - 32px)";
  frame.style.margin = "0";
  frame.style.padding = "0";
  frame.style.border = "0";
  frame.style.background = "transparent";
  frame.style.zIndex = "2147483000";
  frame.style.overflow = "hidden";
  frame.style.colorScheme = "normal";
  frame.style.transition = "width 120ms ease, height 120ms ease";
  frame.style.borderRadius = "18px";

  function sendInit() {
    if (!frame.contentWindow) return;
    frame.contentWindow.postMessage({
      type: "conventus-live-chat-init",
      siteOrigin: window.location.origin,
      siteUrl: window.location.href
    }, scriptUrl.origin);
  }

  function resizeFrame(data) {
    var isLeft = data.position === "left" || (!data.position && initialPosition === "left");
    frame.style.left = isLeft ? "16px" : "auto";
    frame.style.right = isLeft ? "auto" : "16px";
    if (data.open) {
      var maxWidth = Math.max(260, window.innerWidth - 32);
      var maxHeight = Math.max(260, window.innerHeight - 32);
      frame.style.width = Math.min(Number(data.width) || 380, maxWidth) + "px";
      frame.style.height = Math.min(Number(data.height) || 620, maxHeight) + "px";
    } else {
      frame.style.width = "76px";
      frame.style.height = "76px";
    }
    frame.style.borderRadius = "18px";
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
    if (parseInt(frame.style.width, 10) > 100) {
      resizeFrame({ open: true, width: 380, height: 620, position: frame.style.left === "16px" ? "left" : "right" });
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