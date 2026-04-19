const toggles = () => Array.from(document.querySelectorAll("[data-theme-toggle]"));

function currentTheme() {
  return document.documentElement.dataset.theme || "light";
}

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("theme", theme);
  updateToggleLabels();
}

function updateToggleLabels() {
  const isDark = currentTheme() === "dark";
  toggles().forEach((btn) => {
    btn.textContent = isDark ? "☀️" : "🌙";
    btn.setAttribute("aria-label", "Toggle color theme");
  });
}

function initThemeToggle() {
  toggles().forEach((btn) => {
    btn.addEventListener("click", () => {
      setTheme(currentTheme() === "dark" ? "light" : "dark");
    });
  });
  updateToggleLabels();
}

document.addEventListener("DOMContentLoaded", initThemeToggle);
