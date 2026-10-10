// Applies the saved (or system) colour theme before the page paints.
(function () {
  var theme = null;
  try {
    theme = JSON.parse(localStorage.getItem("sr.theme"));
  } catch (e) {}
  if (theme !== "light" && theme !== "dark") {
    theme = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }
  document.documentElement.setAttribute("data-theme", theme);
})();
