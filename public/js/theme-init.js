/* Apply the saved theme before first paint. External so CSP can be script-src 'self'
   with no inline nonce. A static nonce in the HTML is public and would not stop XSS. */
(function () {
  try {
    var s = localStorage.getItem("itx-theme");
    var d = document.documentElement;
    if (s === "dark") { d.dataset.theme = "dark"; }
    else if (s === "light") { d.dataset.theme = "light"; }
    else if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      d.dataset.theme = "dark";
    }
  } catch (_) { /* storage unavailable — leave the default theme */ }
})();
