// Shared behaviour for the dedicated AI Innovation Hackathon 2026 page.
// Problem-statement PDFs are scheduled to unlock automatically on 18 Oct 2026 at 00:00 IST.
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

  // Official release moment: 18 October 2026, 00:00 IST (UTC+05:30).
  const releaseAt = new Date("2026-10-18T00:00:00+05:30");
  const links = document.querySelectorAll("[data-release-href]");
  const notice = document.getElementById("problemReleaseNotice");
  const status = document.getElementById("problemReleaseStatus");

  const updateReleaseState = () => {
    const now = new Date();
    const unlocked = now >= releaseAt;

    links.forEach(link => {
      if (unlocked) {
        link.href = link.dataset.releaseHref;
        link.target = "_blank";
        link.rel = "noopener";
        link.removeAttribute("aria-disabled");
        link.textContent = link.dataset.releaseLabel || "View Problem Statements";
      } else {
        link.href = "#";
        link.setAttribute("aria-disabled", "true");
        link.setAttribute("tabindex", "0");
        link.textContent = "🔒 Locked — Opens 18 October 2026";
      }
    });

    if (notice) notice.classList.toggle("is-open", unlocked);
    if (status) {
      status.textContent = unlocked
        ? "Problem statements are now unlocked."
        : "They will unlock automatically at 12:00 AM IST on 18 October 2026.";
    }
  };

  document.querySelectorAll("[data-release-href]").forEach(link => {
    link.addEventListener("click", event => {
      if (new Date() < releaseAt) {
        event.preventDefault();
        link.setAttribute("aria-disabled", "true");
      }
    });
  });

  updateReleaseState();
  // Re-check periodically so an already-open page unlocks without a refresh.
  window.setInterval(updateReleaseState, 30_000);

  document.querySelectorAll("[data-year]").forEach(el =>
    el.textContent = new Date().getFullYear()
  );
});
