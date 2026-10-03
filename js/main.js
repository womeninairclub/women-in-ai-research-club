document.addEventListener("DOMContentLoaded", () => {

  const menu = document.querySelector(".menu");
  const links = document.querySelector(".navlinks");

  if (menu && links) {
    menu.addEventListener("click", () => {
      links.classList.toggle("open");
    });
  }

  // Automatically underline the page currently being visited.
  let currentPage = window.location.pathname.split("/").pop();
  if (!currentPage) currentPage = "index.html";

  document.querySelectorAll(".navlinks a").forEach((link) => {
    const href = link.getAttribute("href");
    if (!href || href.startsWith("http") || href.startsWith("#") || href.startsWith("mailto:")) return;
    link.classList.toggle("active", href === currentPage);
  });

  document.querySelectorAll(".navlinks a").forEach((link) => {
    link.addEventListener("click", () => {
      if (links) links.classList.remove("open");
    });
  });

  document.querySelectorAll("[data-year]").forEach((element) => {
    element.textContent = new Date().getFullYear();
  });

});
