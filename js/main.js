document.addEventListener("DOMContentLoaded", () => {

  const menu = document.querySelector(".menu");
  const links = document.querySelector(".navlinks");

  if (menu && links) {
    menu.addEventListener("click", () => {
      links.classList.toggle("open");
    });
  }

  const yearElements = document.querySelectorAll("[data-year]");

  yearElements.forEach((element) => {
    element.textContent = new Date().getFullYear();
  });

});
