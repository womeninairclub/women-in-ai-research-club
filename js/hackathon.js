// Shared lightweight behaviour for the dedicated hackathon page.
// Challenge content is served from the official participant-facing PDF resources.
document.addEventListener("DOMContentLoaded", () => {
  const menu = document.getElementById("hackMenu");
  const nav = document.getElementById("hackNavLinks");
  menu?.addEventListener("click", () => {
    const open = nav?.classList.toggle("open") || false;
    menu.setAttribute("aria-expanded", String(open));
  });
  nav?.querySelectorAll("a").forEach(a =>
    a.addEventListener("click", () => nav.classList.remove("open"))
  );
  document.querySelectorAll("[data-year]").forEach(el =>
    el.textContent = new Date().getFullYear()
  );
});
