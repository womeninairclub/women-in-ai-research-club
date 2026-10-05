// =========================================================
// AI INNOVATION HACKATHON 2026 — STAGE 2 PORTAL & API
// Women in AI, Research, Innovation & Entrepreneurship Club
// =========================================================

const HACKATHON_API =
  "https://script.google.com/macros/s/AKfycbz-Q-6TjOviAVR-REG2Wcz-4KQBc_ptyrH4neA0o83FtX01t5EROzvOHfv0vuuFcRrF/exec";

document.addEventListener("DOMContentLoaded", () => {
  // ---------------------------------------------------------
  // 1. AUTOMATIC PROBLEM STATEMENT UNLOCK (18 Oct 2026 00:00 IST)
  // ---------------------------------------------------------
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

  links.forEach(link => {
    link.addEventListener("click", event => {
      if (new Date() < releaseAt) {
        event.preventDefault();
        alert("🔒 Problem statements unlock on 18 October 2026 at 12:00 AM IST.");
      }
    });
  });

  updateReleaseState();
  window.setInterval(updateReleaseState, 30_000);

  // ---------------------------------------------------------
  // 1B. FORM TAB SWITCHING (STAGE 1 VS STAGE 2)
  // ---------------------------------------------------------
  const tabBtns = document.querySelectorAll(".form-tab-btn");
  const stage1Panel = document.getElementById("stage1Panel");
  const stage2Panel = document.getElementById("stage2Panel");

  tabBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      tabBtns.forEach(b => {
        b.classList.remove("active");
        b.classList.add("secondary");
      });
      btn.classList.add("active");
      btn.classList.remove("secondary");

      const targetId = btn.dataset.target;
      if (targetId === "stage1Panel") {
        if (stage1Panel) stage1Panel.style.display = "block";
        if (stage2Panel) stage2Panel.style.display = "none";
      } else if (targetId === "stage2Panel") {
        if (stage1Panel) stage1Panel.style.display = "none";
        if (stage2Panel) stage2Panel.style.display = "block";
      }
    });
  });

  // ---------------------------------------------------------
  // 1C. STAGE 1 IDEA SCREENING PROPOSAL FORM
  // ---------------------------------------------------------
  const stage1Form = document.getElementById("stage1ScreeningForm");
  const stage1Alert = document.getElementById("stage1StatusAlert");

  stage1Form?.addEventListener("submit", async e => {
    e.preventDefault();

    const submitBtn = stage1Form.querySelector("button[type='submit']");
    const payload = {
      type: "Stage1_Screening",
      participationType: document.getElementById("s1Type")?.value || "Team",
      teamName: document.getElementById("s1TeamName")?.value.trim(),
      leaderName: document.getElementById("s1LeaderName")?.value.trim(),
      email: document.getElementById("s1Email")?.value.trim(),
      phone: document.getElementById("s1Phone")?.value.trim(),
      track: document.getElementById("s1Track")?.value,
      statement: document.getElementById("s1Statement")?.value.trim(),
      solution: document.getElementById("s1Solution")?.value.trim(),
      approach: document.getElementById("s1Approach")?.value.trim(),
      pitchLink: document.getElementById("s1PitchLink")?.value.trim()
    };

    setButtonLoading(submitBtn, true, "Submitting Proposal...");
    if (stage1Alert) {
      stage1Alert.hidden = false;
      renderAlert(stage1Alert, "info", `<span class="spinner"></span> Transmitting Stage 1 proposal to screening database...`);
    }

    try {
      const res = await fetch(HACKATHON_API, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (data.success) {
        renderAlert(stage1Alert, "success", `
          <h4 style="margin:0 0 6px;color:#10b981;font-size:17px">🎉 Stage 1 Idea Proposal Received!</h4>
          <p style="margin:0 0 8px">Your proposal has been logged for Stage 1 idea screening.</p>
          <div style="font-size:13.5px;line-height:1.6">
            <strong>Official Reference Code:</strong> <code style="color:#10b981;font-size:15px;font-weight:700">${escapeHtml(data.refId)}</code><br>
            <strong>Track:</strong> ${escapeHtml(payload.track)}<br>
            <strong>Timestamp:</strong> ${escapeHtml(data.timestamp)} IST<br>
            <strong>Status:</strong> <span class="status-pill under-review">ROUND 1 SUBMITTED</span>
          </div>
          <p style="margin-top:10px;font-size:12.5px;color:var(--muted)">Shortlisting announcements take place on 19 October 2026. Selected teams proceed to Stage 2.</p>
        `);
        stage1Form.reset();
      } else if (data.alreadySubmitted) {
        renderAlert(stage1Alert, "warning", `
          <strong>⚠️ Already Submitted:</strong><br>
          ${escapeHtml(data.message)}<br>
          <strong>Reference Code:</strong> <code>${escapeHtml(data.refId)}</code>
        `);
      } else {
        renderAlert(stage1Alert, "error", `<strong>Submission Failed:</strong> ${escapeHtml(data.error || "Server rejected submission.")}`);
      }
    } catch (err) {
      console.error("Stage 1 submission error:", err);
      renderAlert(stage1Alert, "error", "Network submission failed. Please try again.");
    } finally {
      setButtonLoading(submitBtn, false, "Submit Stage 1 Proposal");
    }
  });

  // ---------------------------------------------------------
  // 2. LIVE PARTICIPANT / TEAM STATUS CHECKER
  // ---------------------------------------------------------
  const checkStatusBtn = document.getElementById("checkStatusBtn");
  const lookupInput = document.getElementById("participantLookupInput");
  const lookupResult = document.getElementById("statusLookupResult");

  const runStatusLookup = async () => {
    const query = lookupInput?.value.trim();
    if (!query) {
      renderAlert(lookupResult, "warning", "Please enter a Team Name, Leader Email, or Reference ID.");
      return;
    }

    setButtonLoading(checkStatusBtn, true, "Searching...");
    lookupResult.hidden = false;
    lookupResult.innerHTML = `
      <div class="alert info">
        <span class="spinner"></span> Querying official registration sheet and screening database...
      </div>
    `;

    try {
      const res = await fetch(`${HACKATHON_API}?action=checkStatus&query=${encodeURIComponent(query)}&t=${Date.now()}`);
      if (!res.ok) throw new Error("HTTP error " + res.status);
      const data = await res.json();

      if (data.found) {
        let pillClass = "submitted";
        const st = String(data.status || "").toLowerCase();
        if (st.includes("shortlisted") || st.includes("selected") || st.includes("winner") || st.includes("finalist")) {
          pillClass = "selected";
        } else if (st.includes("not selected") || st.includes("rejected")) {
          pillClass = "not-selected";
        }

        lookupResult.innerHTML = `
          <div class="status-result-box" style="border: 1px solid var(--line-strong);">
            <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:12px">
              <h4 style="font-size:18px;margin:0;color:var(--text)">${escapeHtml(data.teamName)}</h4>
              <span class="status-pill ${pillClass}">${escapeHtml(data.status)}</span>
            </div>
            <div style="font-size:13.5px;color:var(--muted);display:grid;gap:6px">
              <div><strong>Type:</strong> ${escapeHtml(data.type || "Team")}</div>
              ${data.referenceId ? `<div><strong>Official Reference ID:</strong> <code style="color:var(--purple);font-weight:700">${escapeHtml(data.referenceId)}</code></div>` : ""}
              <div><strong>Stage 2 Main Hackathon Access:</strong> ${data.eligibleForStage2 ? `<span style="color:#10b981;font-weight:700">Eligible / Unlocked</span>` : `<span style="color:var(--muted-2)">Not Eligible / Shortlist Required</span>`}</div>
            </div>
          </div>
        `;
      } else {
        renderAlert(lookupResult, "warning", data.message || "No record matched your inquiry. Please check your spelling or team name.");
      }
    } catch (err) {
      console.error("Status lookup error:", err);
      renderAlert(lookupResult, "error", "Unable to connect to the backend server. Please try again later or check your internet connection.");
    } finally {
      setButtonLoading(checkStatusBtn, false, "Check Status");
    }
  };

  checkStatusBtn?.addEventListener("click", runStatusLookup);
  lookupInput?.addEventListener("keypress", e => {
    if (e.key === "Enter") {
      e.preventDefault();
      runStatusLookup();
    }
  });

  // ---------------------------------------------------------
  // 3. STAGE 2 ELIGIBILITY GATE VERIFICATION
  // ---------------------------------------------------------
  const verifyGateBtn = document.getElementById("verifyStage2GateBtn");
  const gateInput = document.getElementById("stage2GateInput");
  const gateResult = document.getElementById("stage2GateResult");
  const stage2Fieldset = document.getElementById("stage2FormFieldset");
  const finTeamName = document.getElementById("finTeamName");
  const finEmail = document.getElementById("finEmail");

  const runGateVerification = async () => {
    const query = gateInput?.value.trim();
    if (!query) {
      renderAlert(gateResult, "warning", "Please enter your registered Team Name, Leader Email, or Reference ID.");
      return;
    }

    setButtonLoading(verifyGateBtn, true, "Verifying...");
    gateResult.hidden = false;
    gateResult.innerHTML = `
      <div class="alert info">
        <span class="spinner"></span> Verifying shortlist status against official database...
      </div>
    `;

    try {
      const res = await fetch(`${HACKATHON_API}?action=checkStatus&query=${encodeURIComponent(query)}&t=${Date.now()}`);
      if (!res.ok) throw new Error("HTTP error " + res.status);
      const data = await res.json();

      if (data.found && data.eligibleForStage2) {
        if (stage2Fieldset) {
          stage2Fieldset.removeAttribute("disabled");
          stage2Fieldset.style.opacity = "1";
        }
        if (finTeamName && data.teamName) finTeamName.value = data.teamName;
        if (finEmail && query.includes("@")) finEmail.value = query;

        renderAlert(gateResult, "success", `
          <strong>✅ Verification Successful!</strong><br>
          Team <strong>${escapeHtml(data.teamName)}</strong> status: <span class="status-pill selected">${escapeHtml(data.status)}</span>.<br>
          Stage 2 Final Submission Form is now unlocked below. Please complete your project details.
        `);
      } else if (data.found && !data.eligibleForStage2) {
        if (stage2Fieldset) {
          stage2Fieldset.setAttribute("disabled", "true");
          stage2Fieldset.style.opacity = "0.6";
        }
        renderAlert(gateResult, "error", `
          <strong>🔒 Round 2 Access Blocked:</strong><br>
          Current status for <strong>${escapeHtml(data.teamName)}</strong> is <strong>${escapeHtml(data.status)}</strong>.<br>
          Stage 2 Submission is reserved exclusively for shortlisted/selected teams.
        `);
      } else {
        if (stage2Fieldset) {
          stage2Fieldset.setAttribute("disabled", "true");
          stage2Fieldset.style.opacity = "0.6";
        }
        renderAlert(gateResult, "warning", data.message || "Team or Email not found in registration records.");
      }
    } catch (err) {
      console.error("Gate verification error:", err);
      renderAlert(gateResult, "error", "Verification server request failed. Please try again.");
    } finally {
      setButtonLoading(verifyGateBtn, false, "Verify Eligibility");
    }
  };

  verifyGateBtn?.addEventListener("click", runGateVerification);
  gateInput?.addEventListener("keypress", e => {
    if (e.key === "Enter") {
      e.preventDefault();
      runGateVerification();
    }
  });

  // ---------------------------------------------------------
  // 4. STAGE 2 FINAL PROJECT SUBMISSION FORM
  // ---------------------------------------------------------
  const stage2Form = document.getElementById("stage2FinalForm");
  const stage2Alert = document.getElementById("stage2StatusAlert");

  stage2Form?.addEventListener("submit", async e => {
    e.preventDefault();

    const submitBtn = stage2Form.querySelector("button[type='submit']");
    const githubUrl = document.getElementById("finGithub")?.value.trim();

    if (!githubUrl || !githubUrl.toLowerCase().includes("github.com")) {
      if (stage2Alert) {
        stage2Alert.hidden = false;
        renderAlert(stage2Alert, "warning", "Please provide a valid public GitHub repository URL (e.g. https://github.com/username/repository).");
      }
      return;
    }

    const payload = {
      type: "Stage2_Final",
      teamName: document.getElementById("finTeamName")?.value.trim(),
      email: document.getElementById("finEmail")?.value.trim(),
      track: document.getElementById("finTrack")?.value,
      projectTitle: document.getElementById("finProjectTitle")?.value.trim(),
      githubUrl: githubUrl,
      demoUrl: document.getElementById("finDemoUrl")?.value.trim(),
      description: document.getElementById("finDescription")?.value.trim()
    };

    setButtonLoading(submitBtn, true, "Submitting Final Project...");
    if (stage2Alert) {
      stage2Alert.hidden = false;
      renderAlert(stage2Alert, "info", `<span class="spinner"></span> Transmitting GitHub repository and project deliverables to jury database...`);
    }

    try {
      const res = await fetch(HACKATHON_API, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (data.success) {
        renderAlert(stage2Alert, "success", `
          <h4 style="margin:0 0 6px;color:#10b981;font-size:17px">🏆 Final Project Recorded Successfully!</h4>
          <p style="margin:0 0 8px">Your final GitHub repository submission has been logged for evaluation.</p>
          <div style="font-size:13.5px;line-height:1.6">
            <strong>Official Final Reference ID:</strong> <code style="color:#10b981;font-size:15px;font-weight:700">${escapeHtml(data.refId)}</code><br>
            <strong>Project Title:</strong> ${escapeHtml(payload.projectTitle)}<br>
            <strong>Timestamp:</strong> ${escapeHtml(data.timestamp)} IST<br>
            <strong>Status:</strong> <span class="status-pill selected">FINAL SUBMISSION RECEIVED</span>
          </div>
          <p style="margin-top:10px;font-size:12.5px;color:var(--muted)">Jury evaluation occurs from 6:00 PM – 8:00 PM IST on 20 October 2026. Final results will be published at 8:00 PM IST.</p>
        `);
        stage2Form.reset();
      } else if (data.alreadySubmitted) {
        renderAlert(stage2Alert, "warning", `
          <strong>⚠️ Already Submitted:</strong><br>
          ${escapeHtml(data.message)}<br>
          <strong>Reference Code:</strong> <code>${escapeHtml(data.refId)}</code>
        `);
      } else {
        renderAlert(stage2Alert, "error", `<strong>Submission Failed:</strong> ${escapeHtml(data.error || "Server rejected submission.")}`);
      }
    } catch (err) {
      console.error("Stage 2 submission error:", err);
      renderAlert(stage2Alert, "error", "Network submission failed. Please try again.");
    } finally {
      setButtonLoading(submitBtn, false, "Submit Final Project");
    }
  });

  // ---------------------------------------------------------
  // HELPER UTILITIES
  // ---------------------------------------------------------
  function renderAlert(targetEl, type, htmlContent) {
    if (!targetEl) return;
    targetEl.hidden = false;
    targetEl.className = `alert ${type}`;
    targetEl.innerHTML = htmlContent;
  }

  function setButtonLoading(btn, isLoading, defaultText) {
    if (!btn) return;
    if (isLoading) {
      btn.classList.add("loading");
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner"></span> ${defaultText}`;
    } else {
      btn.classList.remove("loading");
      btn.disabled = false;
      btn.textContent = defaultText;
    }
  }

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
});
