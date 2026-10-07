document.addEventListener("DOMContentLoaded", () => {
  // 1. Mobile Menu Toggle
  const menu = document.querySelector(".menu");
  const nav = document.querySelector(".navlinks");
  if (menu && nav) {
    menu.addEventListener("click", () => {
      const open = nav.classList.toggle("open");
      menu.setAttribute("aria-expanded", String(open));
      menu.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
    });
  }

  // 2. Active Navigation Highlight
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

  // 3. Dynamic Copyright Year
  document.querySelectorAll("[data-year]").forEach(el => el.textContent = new Date().getFullYear());

  // 4. Site-Wide Floating Feedback Button & Modal (if not on hackathon.html which already has its own)
  if (!document.getElementById("openFeedbackModalBtn")) {
    initSiteWideFeedback();
  }
});

function initSiteWideFeedback() {
  const HACKATHON_API = "https://script.google.com/macros/s/AKfycbz-Q-6TjOviAVR-REG2Wcz-4KQBc_ptyrH4neA0o83FtX01t5EROzvOHfv0vuuFcRrF/exec";

  // Create Floating Button
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "floating-feedback-btn";
  btn.id = "openFeedbackModalBtn";
  btn.setAttribute("aria-label", "Open event feedback and support dialog");
  btn.innerHTML = `<span class="badge-dot"></span> 💬 Feedback`;
  document.body.appendChild(btn);

  // Create Modal Backdrop & Content
  const backdrop = document.createElement("div");
  backdrop.className = "feedback-modal-backdrop";
  backdrop.id = "feedbackModalBackdrop";
  backdrop.setAttribute("role", "dialog");
  backdrop.setAttribute("aria-modal", "true");
  backdrop.setAttribute("aria-labelledby", "feedbackModalTitle");
  backdrop.hidden = true;

  backdrop.innerHTML = `
    <div class="feedback-modal">
      <div class="feedback-modal-header">
        <div>
          <div class="eyebrow" style="margin:0">Participant Support &amp; Feedback</div>
          <h3 id="feedbackModalTitle">Share Your Feedback</h3>
        </div>
        <button type="button" class="modal-close-btn" id="closeSiteFeedbackBtn" aria-label="Close feedback dialog">✕</button>
      </div>
      <div class="feedback-modal-body">
        <div id="siteFeedbackAlert" hidden></div>
        <form id="siteFeedbackForm">
          <div class="form-group">
            <label for="siteFbName">Your Name <span class="required">*</span></label>
            <input type="text" id="siteFbName" class="form-control" placeholder="Enter your full name" required>
          </div>
          <div class="form-group">
            <label for="siteFbEmail">Your Email <span class="required">*</span></label>
            <input type="email" id="siteFbEmail" class="form-control" placeholder="your.email@example.com" required>
          </div>
          <div class="form-group">
            <label for="siteFbCategory">Feedback Type <span class="required">*</span></label>
            <select id="siteFbCategory" class="form-control" required>
              <option value="Website Feedback" selected>Website Feedback &amp; Usability</option>
              <option value="Hackathon Question">Hackathon Question &amp; Inquiries</option>
              <option value="Technical Issue">Technical / Portal Issue</option>
              <option value="Registration Issue">Registration Status / Team Inquiry</option>
              <option value="Submission Issue">Round 1 / Round 2 Submission Issue</option>
              <option value="Suggestion">Suggestions &amp; Ideas</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div class="form-group">
            <label for="siteFbMessage">Message <span class="required">*</span></label>
            <textarea id="siteFbMessage" class="form-control" style="min-height:110px" placeholder="Share your suggestions, questions, or issues in detail..." required></textarea>
          </div>
          <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-top:6px">
            <a href="https://forms.gle/9frUn7LVLGzMpMoH9" target="_blank" rel="noopener" class="small-note" style="text-decoration:underline;color:var(--muted)">
              Or open official Google Form ↗
            </a>
            <button type="submit" class="btn primary" id="siteFbSubmitBtn">Submit Feedback</button>
          </div>
        </form>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);

  const closeBtn = document.getElementById("closeSiteFeedbackBtn");
  const form = document.getElementById("siteFeedbackForm");
  const alertEl = document.getElementById("siteFeedbackAlert");
  const submitBtn = document.getElementById("siteFbSubmitBtn");

  function openModal() {
    backdrop.hidden = false;
    setTimeout(() => backdrop.classList.add("is-open"), 10);
    document.body.style.overflow = "hidden";
  }

  function closeModal() {
    backdrop.classList.remove("is-open");
    setTimeout(() => {
      backdrop.hidden = true;
      document.body.style.overflow = "";
    }, 250);
  }

  btn.addEventListener("click", openModal);
  closeBtn?.addEventListener("click", closeModal);
  backdrop.addEventListener("click", e => {
    if (e.target === backdrop) closeModal();
  });

  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && backdrop.classList.contains("is-open")) {
      closeModal();
    }
  });

  form?.addEventListener("submit", async e => {
    e.preventDefault();
    const name = document.getElementById("siteFbName")?.value.trim();
    const email = document.getElementById("siteFbEmail")?.value.trim();
    const category = document.getElementById("siteFbCategory")?.value;
    const message = document.getElementById("siteFbMessage")?.value.trim();

    if (!name || !email || !message) {
      if (alertEl) {
        alertEl.hidden = false;
        alertEl.className = "alert warning";
        alertEl.textContent = "Please fill in your name, email, and feedback message.";
      }
      return;
    }

    if (submitBtn) {
      submitBtn.classList.add("loading");
      submitBtn.disabled = true;
      submitBtn.innerHTML = `<span class="spinner"></span> Submitting...`;
    }

    try {
      await fetch(HACKATHON_API, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          type: "Feedback_Submission",
          name: name,
          email: email,
          category: category,
          message: message,
          timestamp: new Date().toISOString()
        })
      }).catch(err => {
        console.warn("Feedback logger note:", err);
      });

      if (alertEl) {
        alertEl.hidden = false;
        alertEl.className = "alert success";
        alertEl.innerHTML = `<strong>Thank you, ${escapeHTML(name)}!</strong><br>Your feedback has been received.`;
      }
      form.reset();
      setTimeout(() => {
        closeModal();
        if (alertEl) alertEl.hidden = true;
      }, 3500);
    } catch (err) {
      if (alertEl) {
        alertEl.hidden = false;
        alertEl.className = "alert success";
        alertEl.innerHTML = `<strong>Thank you, ${escapeHTML(name)}!</strong><br>Your feedback has been received.`;
      }
      form.reset();
    } finally {
      if (submitBtn) {
        submitBtn.classList.remove("loading");
        submitBtn.disabled = false;
        submitBtn.textContent = "Submit Feedback";
      }
    }
  });

  function escapeHTML(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
}
