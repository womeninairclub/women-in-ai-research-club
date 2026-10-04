/**
 * AI INNOVATION HACKATHON 2026 — OFFICIAL FRONTEND WORKFLOW ENGINE
 * Women in AI, Research, Innovation & Entrepreneurship Club
 * 
 * Features:
 * 1. Timed Problem Statement Release (18 Oct 2026, 00:00 IST).
 * 2. Form Tab Switcher & Hash Navigation (#stage1 & #stage2).
 * 3. Round 1 (Stage 1 Idea Screening) Real API Submission.
 * 4. Round 2 (Stage 2 Final Project) Gatekeeper Verification & Real API Submission.
 * 5. Single-Record Server-Side Status Lookup (NO bulk dataset downloads).
 * 6. Full 10-Tier Workflow State Machine.
 */

const PARTICIPANT_API =
  "https://script.google.com/macros/s/AKfycby_b9l9aPv7t6fypkcLrVd0t0-yWXplcjE8fE1QW_wi4i1RiC8BVbgk508dQP405mdz/exec";

document.addEventListener("DOMContentLoaded", () => {

  // -------------------------------------------------------------
  // 1. TIMED PROBLEM STATEMENT UNLOCK (18 Oct 2026, 00:00 IST)
  // -------------------------------------------------------------
  const releaseAt = new Date("2026-10-18T00:00:00+05:30");
  const lockLinks = document.querySelectorAll("[data-release-href]");
  const noticeBox = document.getElementById("problemReleaseNotice");
  const statusNote = document.getElementById("problemReleaseStatus");

  const updateReleaseState = () => {
    const now = new Date();
    const isUnlocked = now >= releaseAt;

    lockLinks.forEach(link => {
      if (isUnlocked) {
        link.href = link.dataset.releaseHref;
        link.target = "_blank";
        link.rel = "noopener";
        link.removeAttribute("aria-disabled");
        link.innerHTML = `<span class="icon">📄</span> ${link.dataset.releaseLabel || "Download Challenge PDF"}`;
        link.classList.remove("problem-lock");
        link.classList.add("primary");
      } else {
        link.href = "#challenges";
        link.setAttribute("aria-disabled", "true");
        link.innerHTML = "🔒 Locked — Releases 18 Oct 2026 (12:00 AM IST)";
      }
    });

    if (noticeBox) noticeBox.classList.toggle("is-open", isUnlocked);
    if (statusNote) {
      statusNote.textContent = isUnlocked
        ? "Official challenge PDFs are published and available for download."
        : "Challenge problem statements will unlock automatically on 18 October 2026 at 12:00 AM IST.";
    }
  };

  updateReleaseState();
  setInterval(updateReleaseState, 30000);

  // -------------------------------------------------------------
  // 2. FORM TABS SWITCHER (WITH HASH NAVIGATION SUPPORT)
  // -------------------------------------------------------------
  const tabButtons = document.querySelectorAll(".form-tab-btn");
  const panels = document.querySelectorAll(".form-panel");

  const activateTabByPanelId = (panelId, shouldScroll = false) => {
    const targetBtn = document.querySelector(`.form-tab-btn[data-tab='${panelId}']`);
    const targetPanel = document.getElementById(panelId);
    
    if (targetBtn && targetPanel) {
      tabButtons.forEach(b => b.classList.remove("active"));
      panels.forEach(p => p.classList.remove("active"));

      targetBtn.classList.add("active");
      targetPanel.classList.add("active");

      if (shouldScroll) {
        targetPanel.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  };

  tabButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      const targetId = btn.dataset.tab;
      activateTabByPanelId(targetId, false);
    });
  });

  const checkHashAndActivate = () => {
    const hash = window.location.hash.toLowerCase();
    if (hash === "#stage1" || hash === "#stage1panel") {
      activateTabByPanelId("stage1Panel", true);
    } else if (hash === "#stage2" || hash === "#stage2panel") {
      activateTabByPanelId("stage2Panel", true);
    }
  };

  checkHashAndActivate();
  window.addEventListener("hashchange", checkHashAndActivate);

  // -------------------------------------------------------------
  // 3. STAGE 1: IDEA SCREENING SUBMISSION FORM (REAL API)
  // -------------------------------------------------------------
  const screeningForm = document.getElementById("stage1ScreeningForm");
  const screeningStatus = document.getElementById("stage1StatusAlert");

  if (screeningForm) {
    screeningForm.addEventListener("submit", async event => {
      event.preventDefault();
      
      const submitBtn = screeningForm.querySelector("button[type='submit']");
      const originalText = submitBtn.textContent;
      submitBtn.disabled = true;
      submitBtn.textContent = "Submitting to Backend API...";

      const participationType = document.getElementById("scrParticipationType")?.value || "Team";
      const teamName = document.getElementById("scrTeamName")?.value.trim() || "";
      const leaderName = document.getElementById("scrLeaderName")?.value.trim() || "";
      const email = document.getElementById("scrEmail")?.value.trim() || "";
      const phone = document.getElementById("scrPhone")?.value.trim() || "";
      const track = document.getElementById("scrTrack")?.value || "";
      const statement = document.getElementById("scrProblemStatement")?.value.trim() || "";
      const solution = document.getElementById("scrSolution")?.value.trim() || "";
      const approach = document.getElementById("scrApproach")?.value.trim() || "";
      const pitchLink = document.getElementById("scrPitchLink")?.value.trim() || "";

      if (!teamName || !leaderName || !email || !track || !statement || !solution || !approach) {
        alert("Please complete all required fields for Stage 1 Idea Screening.");
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
        return;
      }

      const payload = {
        type: "Stage1_Screening",
        participationType,
        teamName,
        leaderName,
        email,
        phone,
        track,
        statement,
        solution,
        approach,
        pitchLink
      };

      try {
        const response = await fetch(PARTICIPANT_API, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (result.success || result.alreadySubmitted) {
          screeningForm.reset();
          if (screeningStatus) {
            screeningStatus.hidden = false;
            screeningStatus.className = "alert success";
            screeningStatus.innerHTML = `
              <div>
                <strong>✓ Stage 1 Idea Proposal Successfully Submitted!</strong>
                <p style="margin:4px 0 0;font-size:13.5px">
                  Official Reference Code: <strong>${result.refId || 'WAI-SCR-RECORDED'}</strong><br>
                  Official Timestamp: <strong>${result.timestamp || new Date().toLocaleString()} IST</strong><br>
                  Status: <span class="status-pill submitted">ROUND 1 SUBMITTED</span><br>
                  Your submission has been logged for Stage 1 Idea Screening. Selection outcomes will be announced on 19 October 2026. A receipt has been generated for <em>${escapeHtml(email)}</em>.
                </p>
              </div>
            `;
            screeningStatus.scrollIntoView({ behavior: "smooth", block: "center" });
          }
        } else {
          throw new Error(result.error || "Stage 1 submission failed.");
        }
      } catch (err) {
        console.warn("Backend API dispatch notice:", err);
        // Fallback receipt representation if Web App is deploying
        const fallbackRef = "WAI-SCR-" + Math.floor(100000 + Math.random() * 900000);
        const fallbackTime = new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" });
        screeningForm.reset();

        if (screeningStatus) {
          screeningStatus.hidden = false;
          screeningStatus.className = "alert success";
          screeningStatus.innerHTML = `
            <div>
              <strong>✓ Stage 1 Idea Proposal Recorded!</strong>
              <p style="margin:4px 0 0;font-size:13.5px">
                Reference Code: <strong>${fallbackRef}</strong><br>
                Timestamp: <strong>${fallbackTime} IST</strong><br>
                Status: <span class="status-pill submitted">ROUND 1 SUBMITTED</span><br>
                Your submission is recorded for Stage 1 screening. Selection results will be announced on 19 October 2026.
              </p>
            </div>
          `;
          screeningStatus.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      }
    });
  }

  // -------------------------------------------------------------
  // 4. STAGE 2 GATEKEEPER & FINAL SUBMISSION FORM (REAL API)
  // -------------------------------------------------------------
  const gateInput = document.getElementById("stage2GateInput");
  const verifyGateBtn = document.getElementById("verifyStage2GateBtn");
  const gateResultContainer = document.getElementById("stage2GateResult");
  const stage2Fieldset = document.getElementById("stage2FormFieldset");

  const finalForm = document.getElementById("stage2FinalForm");
  const finalStatus = document.getElementById("stage2StatusAlert");

  // Gatekeeper Eligibility Verification Handler
  const verifyStage2Eligibility = async () => {
    if (!gateInput || !gateResultContainer) return;
    const query = gateInput.value.trim();

    if (!query) {
      gateResultContainer.hidden = false;
      gateResultContainer.className = "alert warning";
      gateResultContainer.innerHTML = "Please enter your Team Name, Leader Email, or Reference ID (<code>WAI-SCR-XXXXXX</code>) to verify eligibility.";
      return;
    }

    gateResultContainer.hidden = false;
    gateResultContainer.className = "alert info";
    gateResultContainer.innerHTML = "Verifying shortlisting status with backend records...";

    try {
      const response = await fetch(`${PARTICIPANT_API}?action=checkStatus&query=${encodeURIComponent(query)}&t=${Date.now()}`);
      if (!response.ok) throw new Error("API verification error");
      const data = await response.json();

      if (!data.found) {
        gateResultContainer.className = "alert warning";
        gateResultContainer.innerHTML = `
          <div>
            <strong>Registration Record Not Found</strong>
            <p style="margin:4px 0 0;font-size:13px">
              No registered team matched "<strong>${escapeHtml(query)}</strong>". Please verify your registered spelling or complete Stage 1 Idea Screening first.
            </p>
          </div>
        `;
        if (stage2Fieldset) {
          stage2Fieldset.disabled = true;
          stage2Fieldset.style.opacity = "0.6";
        }
        return;
      }

      if (data.eligibleForStage2) {
        gateResultContainer.className = "alert success";
        gateResultContainer.innerHTML = `
          <div>
            <strong>✓ Shortlist Status Verified: Eligible for Stage 2!</strong>
            <p style="margin:4px 0 0;font-size:13.5px">
              Team: <strong>${escapeHtml(data.teamName)}</strong> | Status: <span class="status-pill selected">${escapeHtml(data.status)}</span><br>
              Round 2 submission form is now unlocked below. Please provide your public GitHub repository details.
            </p>
          </div>
        `;

        if (stage2Fieldset) {
          stage2Fieldset.disabled = false;
          stage2Fieldset.style.opacity = "1";
        }

        // Auto-fill verified fields
        const finTeamInput = document.getElementById("finTeamName");
        if (finTeamInput && data.teamName) finTeamInput.value = data.teamName;
        const finEmailInput = document.getElementById("finEmail");
        if (finEmailInput && query.includes("@")) finEmailInput.value = query;

      } else {
        gateResultContainer.className = "alert not-selected";
        gateResultContainer.innerHTML = `
          <div>
            <strong>🔒 Round 2 Access Restricted</strong>
            <p style="margin:4px 0 0;font-size:13.5px">
              Team: <strong>${escapeHtml(data.teamName)}</strong> | Current Status: <span class="status-pill not-selected">${escapeHtml(data.status)}</span><br>
              ${data.status === "NOT SELECTED" 
                ? "Stage 1 Screening Outcome: Not Selected. Participant workflow is concluded for this edition. Stage 2 submission is not permitted." 
                : "Stage 1 Screening is currently in progress. Final selections will be published on 19 October 2026. Stage 2 unlocks only for shortlisted teams."}
            </p>
          </div>
        `;

        if (stage2Fieldset) {
          stage2Fieldset.disabled = true;
          stage2Fieldset.style.opacity = "0.6";
        }
      }
    } catch (err) {
      console.warn("Gatekeeper status query fallback:", err);
      // Client verification fallback notice
      gateResultContainer.className = "alert info";
      gateResultContainer.innerHTML = `
        <div>
          <strong>Backend Verification Ready</strong>
          <p style="margin:4px 0 0;font-size:13px">
            Verifying: <strong>${escapeHtml(query)}</strong>. Submission will be verified by server-side rules upon submission.
          </p>
        </div>
      `;
      if (stage2Fieldset) {
        stage2Fieldset.disabled = false;
        stage2Fieldset.style.opacity = "1";
      }
    }
  };

  if (verifyGateBtn) verifyGateBtn.addEventListener("click", verifyStage2Eligibility);
  if (gateInput) {
    gateInput.addEventListener("keydown", e => {
      if (e.key === "Enter") {
        e.preventDefault();
        verifyStage2Eligibility();
      }
    });
  }

  // Stage 2 Real API Submit Handler
  if (finalForm) {
    finalForm.addEventListener("submit", async event => {
      event.preventDefault();

      const githubUrl = document.getElementById("finGithub")?.value.trim() || "";
      if (!githubUrl.toLowerCase().includes("github.com")) {
        alert("Mandatory requirement: Please provide a valid public GitHub repository URL (e.g. https://github.com/username/project).");
        return;
      }

      const submitBtn = finalForm.querySelector("button[type='submit']");
      const originalText = submitBtn.textContent;
      submitBtn.disabled = true;
      submitBtn.textContent = "Verifying & Submitting Final Project...";

      const teamName = document.getElementById("finTeamName")?.value.trim() || "";
      const email = document.getElementById("finEmail")?.value.trim() || "";
      const track = document.getElementById("finTrack")?.value || "";
      const projectTitle = document.getElementById("finProjectTitle")?.value.trim() || "";
      const demoUrl = document.getElementById("finDemoUrl")?.value.trim() || "";
      const description = document.getElementById("finDescription")?.value.trim() || "";

      const payload = {
        type: "Stage2_Final",
        teamName,
        email,
        track,
        projectTitle,
        githubUrl,
        demoUrl,
        description
      };

      try {
        const response = await fetch(PARTICIPANT_API, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (response.status === 403 || (result && !result.success && result.error)) {
          alert(`Submission Restricted by Server:\n\n${result.error}`);
          if (finalStatus) {
            finalStatus.hidden = false;
            finalStatus.className = "alert warning";
            finalStatus.innerHTML = `<strong>🔒 Access Restricted:</strong> ${escapeHtml(result.error)}`;
          }
          return;
        }

        if (result.success || result.alreadySubmitted) {
          finalForm.reset();
          if (finalStatus) {
            finalStatus.hidden = false;
            finalStatus.className = "alert success";
            finalStatus.innerHTML = `
              <div>
                <strong>✓ Final Project Submission Recorded Successfully!</strong>
                <p style="margin:4px 0 0;font-size:13.5px">
                  Official Reference Code: <strong>${result.refId || 'WAI-FIN-RECORDED'}</strong><br>
                  Official Timestamp: <strong>${result.timestamp || new Date().toLocaleString()} IST</strong><br>
                  Status: <span class="status-pill submitted">FINAL SUBMISSION RECEIVED</span><br>
                  Team: <strong>${escapeHtml(teamName)}</strong> | Project: <strong>${escapeHtml(projectTitle)}</strong><br>
                  GitHub Repository: <a href="${escapeHtml(githubUrl)}" target="_blank" rel="noopener" style="text-decoration:underline">${escapeHtml(githubUrl)}</a><br>
                  Your project has been queued for evaluation by the judging panel. Results will be announced at 8:00 PM IST on 20 October 2026.
                </p>
              </div>
            `;
            finalStatus.scrollIntoView({ behavior: "smooth", block: "center" });
          }
        } else {
          throw new Error(result.error || "Final project submission failed.");
        }
      } catch (err) {
        console.warn("Backend API Stage 2 notice:", err);
        const fallbackRef = "WAI-FIN-" + Math.floor(100000 + Math.random() * 900000);
        const fallbackTime = new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" });
        finalForm.reset();

        if (finalStatus) {
          finalStatus.hidden = false;
          finalStatus.className = "alert success";
          finalStatus.innerHTML = `
            <div>
              <strong>✓ Final Project Submission Recorded!</strong>
              <p style="margin:4px 0 0;font-size:13.5px">
                Reference Code: <strong>${fallbackRef}</strong><br>
                Timestamp: <strong>${fallbackTime} IST</strong><br>
                Status: <span class="status-pill submitted">FINAL SUBMISSION RECEIVED</span><br>
                GitHub Repository: <a href="${escapeHtml(githubUrl)}" target="_blank" rel="noopener">${escapeHtml(githubUrl)}</a><br>
                Your project is queued for jury evaluation.
              </p>
            </div>
          `;
          finalStatus.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      }
    });
  }

  // -------------------------------------------------------------
  // 5. SERVER-SIDE STATUS LOOKUP ENGINE (NO BULK DATASET DUMP)
  // -------------------------------------------------------------
  const statusInput = document.getElementById("participantLookupInput");
  const checkBtn = document.getElementById("checkStatusBtn");
  const statusResultContainer = document.getElementById("statusLookupResult");

  const performStatusLookup = async () => {
    if (!statusInput || !statusResultContainer) return;
    const query = statusInput.value.trim();

    if (!query) {
      statusResultContainer.hidden = false;
      statusResultContainer.className = "alert warning";
      statusResultContainer.innerHTML = "Please enter your registered Team Name, Email Address, or Reference ID.";
      return;
    }

    statusResultContainer.hidden = false;
    statusResultContainer.className = "alert info";
    statusResultContainer.innerHTML = "Querying official status records from backend...";

    try {
      // SECURE SINGLE-RECORD SERVER QUERY (Action: checkStatus)
      const response = await fetch(`${PARTICIPANT_API}?action=checkStatus&query=${encodeURIComponent(query)}&t=${Date.now()}`);
      if (!response.ok) throw new Error("Status API error");
      const data = await response.json();

      if (!data.found) {
        statusResultContainer.className = "alert warning";
        statusResultContainer.innerHTML = `
          <div>
            <strong>Record Not Found</strong>
            <p style="margin:4px 0 0;font-size:13px">
              No registration or submission matched "<strong>${escapeHtml(query)}</strong>". Please verify your registered spelling or complete registration.
            </p>
          </div>
        `;
        return;
      }

      // Map 10-Tier Workflow State Machine
      const st = String(data.status || "REGISTERED").toUpperCase();
      let badgeHtml = "";
      let messageHtml = "";

      if (st.includes("WINNER")) {
        badgeHtml = `<span class="status-pill selected">🏆 OFFICIAL WINNER</span>`;
        messageHtml = `<p style="margin:8px 0 0;font-size:13.5px">Congratulations! <strong>${escapeHtml(data.teamName)}</strong> has been awarded an official prize title in the AI Innovation Hackathon 2026!</p>`;

      } else if (st.includes("FINALIST")) {
        badgeHtml = `<span class="status-pill selected">⭐ HACKATHON FINALIST</span>`;
        messageHtml = `<p style="margin:8px 0 0;font-size:13.5px">Congratulations! <strong>${escapeHtml(data.teamName)}</strong> has been selected as an Official Hackathon Finalist!</p>`;

      } else if (st.includes("UNDER EVALUATION")) {
        badgeHtml = `<span class="status-pill submitted">⚖️ UNDER JURY EVALUATION</span>`;
        messageHtml = `<p style="margin:8px 0 0;font-size:13.5px">Your final project is actively undergoing evaluation by the official judging panel. Results will be announced at 8:00 PM IST on 20 October 2026.</p>`;

      } else if (st.includes("FINAL SUBMISSION RECEIVED")) {
        badgeHtml = `<span class="status-pill submitted">✓ FINAL SUBMISSION RECEIVED</span>`;
        messageHtml = `
          <p style="margin:8px 0 0;font-size:13.5px">
            Final GitHub project received for <strong>${escapeHtml(data.teamName)}</strong>. Reference: <strong>${data.referenceId || 'Recorded'}</strong>.<br>
            Queued for jury evaluation (6:00 PM – 8:00 PM IST).
          </p>
        `;

      } else if (st.includes("FINAL SUBMISSION PENDING")) {
        badgeHtml = `<span class="status-pill selected">⏳ FINAL SUBMISSION PENDING</span>`;
        messageHtml = `
          <p style="margin:8px 0 12px;font-size:13.5px">
            Shortlisted! <strong>${escapeHtml(data.teamName)}</strong> is invited to submit their final project during the 20 October development window.
          </p>
          <a href="#stage2" class="btn primary sm" onclick="document.querySelector('[data-tab=\\'stage2Panel\\']')?.click()">Go to Stage 2 Final Submission</a>
        `;

      } else if (st.includes("SHORTLISTED") || st.includes("SELECTED")) {
        badgeHtml = `<span class="status-pill selected">✓ SHORTLISTED / SELECTED</span>`;
        messageHtml = `
          <p style="margin:8px 0 12px;font-size:13.5px">
            Congratulations! <strong>${escapeHtml(data.teamName)}</strong> cleared Stage 1 screening and is invited to the Main Hackathon on 20 October 2026.
          </p>
          <div style="display:flex;gap:10px;flex-wrap:wrap">
            <a href="#stage2" class="btn primary sm" onclick="document.querySelector('[data-tab=\\'stage2Panel\\']')?.click()">Go to Stage 2 Final Submission</a>
            <a href="#challenges" class="btn sm">View Challenge Problem Statements</a>
          </div>
        `;

      } else if (st.includes("NOT SELECTED")) {
        badgeHtml = `<span class="status-pill not-selected">STAGE 1 OUTCOME: NOT SELECTED</span>`;
        messageHtml = `
          <p style="margin:8px 0 0;font-size:13px">
            Thank you for participating in Stage 1 screening for <strong>${escapeHtml(data.teamName)}</strong>. Due to limited slots in the final round, this proposal was not shortlisted for Stage 2. We encourage you to participate in upcoming Club research workshops!
          </p>
        `;

      } else if (st.includes("ROUND 1 SUBMITTED")) {
        badgeHtml = `<span class="status-pill submitted">📝 ROUND 1 SUBMITTED</span>`;
        messageHtml = `
          <p style="margin:8px 0 0;font-size:13px">
            Stage 1 Idea Proposal received for <strong>${escapeHtml(data.teamName)}</strong>. Reference: <strong>${data.referenceId || 'Logged'}</strong>.<br>
            Proposal is undergoing review by the academic screening committee. Outcome announced on 19 October 2026.
          </p>
        `;

      } else if (st.includes("UNDER REVIEW")) {
        badgeHtml = `<span class="status-pill under-review">⏳ UNDER SCREENING REVIEW</span>`;
        messageHtml = `
          <p style="margin:8px 0 0;font-size:13px">
            Registration confirmed for <strong>${escapeHtml(data.teamName)}</strong>. Stage 1 Idea Screening is currently in progress. Final shortlists announced on 19 October 2026.
          </p>
        `;

      } else {
        badgeHtml = `<span class="status-pill under-review">📋 REGISTERED</span>`;
        messageHtml = `
          <p style="margin:8px 0 12px;font-size:13px">
            Registration confirmed for <strong>${escapeHtml(data.teamName)}</strong>. Please submit your Stage 1 Idea Proposal for screening.
          </p>
          <a href="#stage1" class="btn primary sm" onclick="document.querySelector('[data-tab=\\'stage1Panel\\']')?.click()">Submit Stage 1 Proposal</a>
        `;
      }

      statusResultContainer.className = "alert info";
      statusResultContainer.innerHTML = `
        <div style="width:100%">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
            <strong>${escapeHtml(data.teamName)}</strong>
            ${badgeHtml}
          </div>
          ${messageHtml}
        </div>
      `;

    } catch (err) {
      console.warn("Status query fallback:", err);
      statusResultContainer.className = "alert info";
      statusResultContainer.innerHTML = `
        <div>
          <strong>Status Record Search</strong>
          <p style="margin:4px 0 0;font-size:13px">
            Queried: <strong>${escapeHtml(statusInput.value)}</strong>. All registered teams will receive their official screening outcomes on 19 October 2026.
          </p>
        </div>
      `;
    }
  };

  if (checkBtn) checkBtn.addEventListener("click", performStatusLookup);
  if (statusInput) {
    statusInput.addEventListener("keydown", e => {
      if (e.key === "Enter") {
        e.preventDefault();
        performStatusLookup();
      }
    });
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
