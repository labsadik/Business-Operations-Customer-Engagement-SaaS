(function () {
  "use strict";
  var script = document.currentScript;
  if (!script) return;
  var company = (script.getAttribute("data-company") || "").trim();
  if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(company)) return;
  var scriptUrl;
  try { scriptUrl = new URL(script.src, window.location.href); } catch (_) { return; }
  if (scriptUrl.protocol !== "https:" && scriptUrl.hostname !== "localhost") return;
  var position = script.getAttribute("data-position") === "left" ? "left" : "right";
  var frame = document.createElement("iframe");
  frame.title = "Live Chat";
  frame.setAttribute("aria-label", "Live Chat");
  frame.setAttribute("allow", "clipboard-write");
  frame.setAttribute("loading", "lazy");
  frame.referrerPolicy = "strict-origin-when-cross-origin";
  frame.src = scriptUrl.origin + "/embed/live-chat/" + encodeURIComponent(company) + "?site=" + encodeURIComponent(window.location.origin);
  frame.style.position = "fixed";
  frame.style.bottom = "16px";
  frame.style[position] = "16px";
  frame.style.width = "76px";
  frame.style.height = "76px";
  frame.style.maxWidth = "calc(100vw - 16px)";
  frame.style.maxHeight = "calc(100vh - 16px)";
  frame.style.border = "0";
  frame.style.background = "transparent";
  frame.style.zIndex = "2147483000";
  frame.style.overflow = "hidden";
  frame.style.colorScheme = "normal";
  frame.style.transition = "width 120ms ease, height 120ms ease";
  frame.style.borderRadius = "18px";
  frame.addEventListener("load", function () {
    if (!frame.contentWindow) return;
    frame.contentWindow.postMessage({ type: "conventus-live-chat-init", siteOrigin: window.location.origin }, scriptUrl.origin);
  });
  document.body.appendChild(frame);

  window.addEventListener("message", function (event) {
    if (event.origin !== scriptUrl.origin || event.source !== frame.contentWindow) return;
    var data = event.data;
    if (!data || data.type !== "conventus-live-chat-resize" || typeof data.open !== "boolean") return;
    var isLeft = data.position === "left";
    frame.style.left = isLeft ? "16px" : "auto";
    frame.style.right = isLeft ? "auto" : "16px";
    if (data.open) {
      frame.style.width = Math.min(Number(data.width) || 380, Math.max(300, window.innerWidth - 16)) + "px";
      frame.style.height = Math.min(Number(data.height) || 620, Math.max(320, window.innerHeight - 16)) + "px";
      frame.style.borderRadius = "18px";
    } else {
      frame.style.width = "76px";
      frame.style.height = "76px";
      frame.style.borderRadius = "18px";
    }
  }, false);

  window.addEventListener("resize", function () {
    if (parseInt(frame.style.width, 10) > 100) {
      frame.style.width = Math.min(380, Math.max(300, window.innerWidth - 16)) + "px";
      frame.style.height = Math.min(620, Math.max(320, window.innerHeight - 16)) + "px";
    }
  }, { passive: true });
})();