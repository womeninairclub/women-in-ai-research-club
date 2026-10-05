document.addEventListener("DOMContentLoaded", () => {
  const menu = document.querySelector(".menu");
  const nav = document.querySelector(".navlinks");
  if (menu && nav) {
    menu.addEventListener("click", () => {
      const open = nav.classList.toggle("open");
      menu.setAttribute("aria-expanded", String(open));
      menu.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
    });
  }
  const current = window.location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".navlinks a").forEach(link => {
    const href = link.getAttribute("href") || "";
    if (!href || href.startsWith("#") || href.startsWith("http") || href.startsWith("mailto:")) return;
    link.classList.toggle("active", href === current);
  });
  document.querySelectorAll(".navlinks a").forEach(link => link.addEventListener("click", () => {
    nav?.classList.remove("open");
    menu?.setAttribute("aria-expanded", "false");
    menu?.setAttribute("aria-label", "Open navigation");
  }));
  document.querySelectorAll("[data-year]").forEach(el => el.textContent = new Date().getFullYear());
});
