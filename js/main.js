/**
 * Women in AI, Research, Innovation & Entrepreneurship Club
 * Core Navigation & Global Interactions
 */
document.addEventListener("DOMContentLoaded", () => {
  // Mobile Navigation Drawer Toggle
  const menuBtn = document.querySelector(".menu");
  const navLinks = document.querySelector(".navlinks");

  if (menuBtn && navLinks) {
    menuBtn.addEventListener("click", () => {
      const isOpen = navLinks.classList.toggle("open");
      menuBtn.setAttribute("aria-expanded", String(isOpen));
      menuBtn.setAttribute("aria-label", isOpen ? "Close navigation" : "Open navigation");
    });
  }

  // Active Link Detection
  const path = window.location.pathname;
  const page = path.split("/").pop() || "index.html";

  document.querySelectorAll(".navlinks a").forEach(link => {
    const href = link.getAttribute("href") || "";
    if (!href || href.startsWith("#") || href.startsWith("http") || href.startsWith("mailto:")) return;
    
    // Exact match or index.html root match
    const isCurrent = href === page || (page === "" && href === "index.html");
    link.classList.toggle("active", isCurrent);
    if (isCurrent) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }

    // Close mobile menu upon clicking internal links
    link.addEventListener("click", () => {
      if (navLinks && navLinks.classList.contains("open")) {
        navLinks.classList.remove("open");
        menuBtn?.setAttribute("aria-expanded", "false");
        menuBtn?.setAttribute("aria-label", "Open navigation");
      }
    });
  });

  // Dynamic Year in Footer
  document.querySelectorAll("[data-year]").forEach(el => {
    el.textContent = "2026";
  });
});
