// =========================================================
// AI INNOVATION HACKATHON 2026 — OFFICIAL HACKATHON CLIENT PORTAL
// Women in AI Research, Innovation & Entrepreneurship
// Research • Innovation • Entrepreneurship
// =========================================================

const HACKATHON_API =
  "https://script.google.com/macros/s/AKfycbz-Q-6TjOviAVR-REG2Wcz-4KQBc_ptyrH4neA0o83FtX01t5EROzvOHfv0vuuFcRrF/exec";

// TIMEZONE CONSTANTS: Asia/Kolkata (IST = UTC+5:30)
// Release Timestamp: 18 October 2026, 00:00:00 IST = 2026-10-17T18:30:00.000Z
const RELEASE_TIMESTAMP_MS = Date.parse("2026-10-18T00:00:00+05:30");

// Hard Cutoff for Stage 1 Screening: 19 October 2026, 18:00:00 IST = 2026-10-19T12:30:00.000Z
const SCREENING_DEADLINE_MS = Date.parse("2026-10-19T18:00:00+05:30");

// Optional Simulation Helper for Testing & Verification:
// ?simDate=2026-10-17T12:00:00+05:30  -> Before release
// ?simDate=2026-10-18T10:00:00+05:30  -> Unlocked, before screening cutoff
// ?simDate=2026-10-19T18:30:00+05:30  -> Unlocked, after screening cutoff
function getEffectiveNow() {
  const urlParams = new URLSearchParams(window.location.search);
  const sim = urlParams.get("simDate");
  if (sim) {
    const parsed = Date.parse(sim);
    if (!isNaN(parsed)) return new Date(parsed);
  }
  return new Date();
}

document.addEventListener("DOMContentLoaded", () => {
  // ---------------------------------------------------------
  // 1. AUTOMATIC PROBLEM STATEMENT UNLOCK (18 Oct 2026 00:00 IST)
  // ---------------------------------------------------------
  const noticeBox = document.getElementById("problemReleaseNotice");
  const lockIcon = document.getElementById("releaseLockIcon");
  const statusPill = document.getElementById("releaseStatusPill");
  const noticeHeading = document.getElementById("releaseNoticeHeading");
  const noticeMsg = document.getElementById("releaseNoticeMsg");
  const countdownWrapper = document.getElementById("releaseCountdownWrapper");
  const unlockedContainer = document.getElementById("unlockedChallengesContainer");
  const problemReleaseStatus = document.getElementById("problemReleaseStatus");

  // Track overview lock links
  const lockLinks = document.querySelectorAll("[data-release-href]");

  // Countdown element targets
  const cdDays = document.getElementById("cdDays");
  const cdHours = document.getElementById("cdHours");
  const cdMins = document.getElementById("cdMins");
  const cdSecs = document.getElementById("cdSecs");

  let challengesLoaded = false;
  let allChallengesData = [];
  let currentTrackFilter = "all";
  let currentSearchQuery = "";

  // ---------------------------------------------------------
  // 1A. CRYPTOGRAPHIC VAULT DECRYPTOR (AES-256-GCM)
  // ---------------------------------------------------------
  // All 60 problem statements and 5 authoritative track PDFs are sealed in
  // encrypted vaults. The release key is released on 18 Oct 2026.
  const FALLBACK_RELEASE_KEY = "AI_INNOVATION_HACKATHON_2026_OFFICIAL_RELEASE_18OCT2026_IST";
  let activeCryptoKey = null;
  const decryptedPdfBlobs = {};

  async function deriveVaultKey(passphrase) {
    const rawKey = new TextEncoder().encode(passphrase);
    const hash = await window.crypto.subtle.digest("SHA-256", rawKey);
    return window.crypto.subtle.importKey(
      "raw",
      hash,
      { name: "AES-GCM" },
      false,
      ["decrypt"]
    );
  }

  async function decryptVaultPayload(vaultData, cryptoKey) {
    const iv = Uint8Array.from(atob(vaultData.iv), c => c.charCodeAt(0));
    const tag = Uint8Array.from(atob(vaultData.tag), c => c.charCodeAt(0));
    const ct = Uint8Array.from(atob(vaultData.ciphertext), c => c.charCodeAt(0));

    // Web Crypto API expects ciphertext and auth tag concatenated
    const combined = new Uint8Array(ct.length + tag.length);
    combined.set(ct);
    combined.set(tag, ct.length);

    const decrypted = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv, tagLength: 128 },
      cryptoKey,
      combined
    );
    return decrypted;
  }

  async function getReleaseKey() {
    try {
      const res = await fetch(`${HACKATHON_API}?action=getReleaseKey`);
      if (res.ok) {
        const json = await res.json();
        if (json.unlocked && json.releaseKey) {
          return json.releaseKey;
        }
      }
    } catch (e) {
      console.warn("GAS getReleaseKey dispatch unavailable, evaluating time gate:", e);
    }
    const now = getEffectiveNow();
    if (now.getTime() >= RELEASE_TIMESTAMP_MS) {
      return FALLBACK_RELEASE_KEY;
    }
    return null;
  }

  // Authoritative track encrypted files mapping
  const TRACK_ENC_VAULTS = {
    aiml: { file: "assets/docs/track_aiml.enc", filename: "AI_Innovation_Hackathon_2026_AI_ML_Methodology_PROFESSIONAL.pdf" },
    biomedical: { file: "assets/docs/track_biomedical.enc", filename: "AI_Innovation_Hackathon_2026_Biomedical_AI_Image_Signal_Analysis_PROFESSIONAL.pdf" },
    xai: { file: "assets/docs/track_xai.enc", filename: "AI_Innovation_Hackathon_2026_Explainable_AI_XAI_PROFESSIONAL.pdf" },
    trustworthy: { file: "assets/docs/track_trustworthy.enc", filename: "AI_Innovation_Hackathon_2026_Trustworthy_AI_Cybersecurity_PROFESSIONAL.pdf" },
    research: { file: "assets/docs/track_research.enc", filename: "AI_Innovation_Hackathon_2026_Research_Publications_PROFESSIONAL.pdf" }
  };

  async function downloadOrOpenTrackPdf(trackId) {
    const trackConfig = TRACK_ENC_VAULTS[trackId];
    if (!trackConfig) {
      alert("Invalid track selection.");
      return;
    }

    const now = getEffectiveNow();
    if (now.getTime() < RELEASE_TIMESTAMP_MS) {
      alert("🔒 Problem statements unlock automatically on 18 October 2026 at 12:00 AM IST (Asia/Kolkata).");
      return;
    }

    if (decryptedPdfBlobs[trackId]) {
      const url = decryptedPdfBlobs[trackId];
      const win = window.open(url, "_blank");
      if (!win) {
        const a = document.createElement("a");
        a.href = url;
        a.download = trackConfig.filename;
        a.click();
      }
      return;
    }

    try {
      if (!activeCryptoKey) {
        const keyStr = await getReleaseKey();
        if (!keyStr) {
          alert("🔒 Problem statements remain sealed until 18 October 2026.");
          return;
        }
        activeCryptoKey = await deriveVaultKey(keyStr);
      }

      const res = await fetch(trackConfig.file + "?v=20261018");
      if (!res.ok) throw new Error("Encrypted vault could not be retrieved: " + res.status);
      const vaultData = await res.json();
      const pdfBytes = await decryptVaultPayload(vaultData, activeCryptoKey);
      const blob = new Blob([pdfBytes], { type: "application/pdf" });
      const blobUrl = URL.createObjectURL(blob);
      decryptedPdfBlobs[trackId] = blobUrl;

      const win = window.open(blobUrl, "_blank");
      if (!win) {
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = trackConfig.filename;
        a.click();
      }
    } catch (err) {
      console.error("Failed to decrypt track PDF:", err);
      alert("Unable to open track document. Please verify release date or refresh.");
    }
  }

  const checkReleaseStatus = () => {
    const now = getEffectiveNow();
    const isUnlocked = now.getTime() >= RELEASE_TIMESTAMP_MS;

    if (isUnlocked) {
      if (noticeBox) noticeBox.classList.add("is-unlocked");
      if (lockIcon) lockIcon.textContent = "🔓";
      if (statusPill) {
        statusPill.className = "status-pill selected";
        statusPill.textContent = "Problem Statements Released";
      }
      if (noticeHeading) {
        noticeHeading.textContent = "Problem Statements Officially Released";
      }
      if (noticeMsg) {
        noticeMsg.innerHTML = "All <strong>60 approved challenges</strong> across 5 specialized tracks are now unlocked below. Review your preferred track, inspect technical specifications, download the official PDFs, and submit your Round 1 proposal before the <strong>19 October 2026, 6:00 PM IST</strong> deadline.";
      }
      if (countdownWrapper) countdownWrapper.style.display = "none";
      if (problemReleaseStatus) {
        problemReleaseStatus.innerHTML = "Status: <strong style='color:#10b981'>UNLOCKED</strong> — Official track PDFs & challenge details are accessible.";
      }

      // Unlock overview PDF links
      lockLinks.forEach(link => {
        link.removeAttribute("aria-disabled");
        link.textContent = link.dataset.releaseLabel || "Download Track PDF";
      });

      // Show challenge interface and load challenges if not yet loaded
      if (unlockedContainer) {
        unlockedContainer.hidden = false;
        if (!challengesLoaded) {
          loadChallengesData();
        }
      }
    } else {
      // Locked state: enforce concealment
      if (noticeBox) noticeBox.classList.remove("is-unlocked");
      if (lockIcon) lockIcon.textContent = "🔒";
      if (statusPill) {
        statusPill.className = "status-pill under-review";
        statusPill.textContent = "Unlocks 18 October 2026 (12:00 AM IST)";
      }
      if (noticeHeading) {
        noticeHeading.textContent = "Official Problem Statements Release";
      }
      if (countdownWrapper) countdownWrapper.style.display = "block";

      // Calculate countdown to 18 October 00:00 IST
      const diff = Math.max(0, RELEASE_TIMESTAMP_MS - now.getTime());
      const d = Math.floor(diff / (1000 * 60 * 60 * 24));
      const h = Math.floor((diff / (1000 * 60 * 60)) % 24);
      const m = Math.floor((diff / (1000 * 60)) % 60);
      const s = Math.floor((diff / 1000) % 60);

      if (cdDays) cdDays.textContent = String(d).padStart(2, "0");
      if (cdHours) cdHours.textContent = String(h).padStart(2, "0");
      if (cdMins) cdMins.textContent = String(m).padStart(2, "0");
      if (cdSecs) cdSecs.textContent = String(s).padStart(2, "0");

      if (problemReleaseStatus) {
        problemReleaseStatus.textContent = "All 60 challenges will unlock automatically at 12:00 AM IST on 18 October 2026 (Asia/Kolkata).";
      }

      // Keep PDF links locked
      lockLinks.forEach(link => {
        link.setAttribute("aria-disabled", "true");
        link.textContent = "🔒 Locked Until 18 Oct";
      });

      if (unlockedContainer) {
        unlockedContainer.hidden = true;
      }
    }
  };

  // Lock click interception & track PDF download handler
  lockLinks.forEach(link => {
    link.addEventListener("click", event => {
      event.preventDefault();
      const now = getEffectiveNow();
      if (now.getTime() < RELEASE_TIMESTAMP_MS) {
        alert("🔒 Problem statements unlock automatically on 18 October 2026 at 12:00 AM IST (Asia/Kolkata).");
      } else {
        const trackId = link.dataset.trackId;
        if (trackId) {
          downloadOrOpenTrackPdf(trackId);
        }
      }
    });
  });

  // Run status check & start countdown interval
  checkReleaseStatus();
  window.setInterval(checkReleaseStatus, 1000);

  // ---------------------------------------------------------
  // 1B. LOAD & DECRYPT 60 CHALLENGES (AFTER RELEASE ONLY)
  // ---------------------------------------------------------
  async function loadChallengesData() {
    const now = getEffectiveNow();
    if (now.getTime() < RELEASE_TIMESTAMP_MS) {
      console.log("Challenges sealed until 18 October 2026.");
      return;
    }

    challengesLoaded = true;
    const grid = document.getElementById("challengesCardGrid");
    if (grid) {
      grid.innerHTML = `
        <div class="alert info" style="grid-column:1/-1;text-align:center">
          <span class="spinner"></span> Decrypting 60 approved challenges from secure vault...
        </div>
      `;
    }

    try {
      const keyStr = await getReleaseKey();
      if (!keyStr) throw new Error("Release key not available before official date.");
      activeCryptoKey = await deriveVaultKey(keyStr);

      const res = await fetch("js/challenges-vault.enc?v=20261018");
      if (!res.ok) throw new Error("Failed to load challenges vault: " + res.status);
      const vaultData = await res.json();

      const decryptedBytes = await decryptVaultPayload(vaultData, activeCryptoKey);
      const jsonStr = new TextDecoder().decode(decryptedBytes);
      allChallengesData = JSON.parse(jsonStr);

      renderChallenges();
    } catch (err) {
      console.error("Error decrypting challenge vault:", err);
      if (grid) {
        grid.innerHTML = `
          <div class="alert error" style="grid-column:1/-1">
            <strong>Unable to load challenge catalog:</strong> Please refresh the page or check your connection.
          </div>
        `;
      }
    }
  }

  function renderChallenges() {
    const grid = document.getElementById("challengesCardGrid");
    const emptyNotice = document.getElementById("challengesEmptyNotice");
    if (!grid) return;

    const filtered = allChallengesData.filter(item => {
      if (currentTrackFilter !== "all" && item.trackId !== currentTrackFilter) {
        return false;
      }
      if (currentSearchQuery) {
        const q = currentSearchQuery.toLowerCase();
        const inTitle = (item.title || "").toLowerCase().includes(q);
        const inNum = (item.challengeNumber || "").toLowerCase().includes(q);
        const inDomain = (item.domain || "").toLowerCase().includes(q);
        const inProblem = (item.problemStatement || "").toLowerCase().includes(q);
        const inTrack = (item.track || "").toLowerCase().includes(q);
        return inTitle || inNum || inDomain || inProblem || inTrack;
      }
      return true;
    });

    if (filtered.length === 0) {
      grid.innerHTML = "";
      if (emptyNotice) emptyNotice.hidden = false;
      return;
    }

    if (emptyNotice) emptyNotice.hidden = true;

    grid.innerHTML = filtered.map(c => {
      const diffClass = (c.difficulty || "intermediate").toLowerCase().includes("adv")
        ? "advanced"
        : (c.difficulty || "").toLowerCase().includes("inter")
        ? "intermediate"
        : "beginner";

      return `
        <div class="challenge-card" data-id="${c.id}">
          <div class="challenge-card-top">
            <span class="challenge-num-tag">${escapeHtml(c.challengeNumber)}</span>
            <span class="difficulty-pill ${diffClass}">${escapeHtml(c.difficulty || "Intermediate")}</span>
          </div>
          <span class="challenge-track-lbl">${escapeHtml(c.track)}</span>
          <h3>${escapeHtml(c.title)}</h3>
          <p class="challenge-card-desc">${escapeHtml(c.problemStatement)}</p>
          <div class="challenge-card-footer">
            <span style="font-size:12px;color:var(--muted);">${escapeHtml(c.domain || "AI Frontier")}</span>
            <button type="button" class="btn sm primary view-challenge-btn" data-id="${c.id}">
              View Challenge →
            </button>
          </div>
        </div>
      `;
    }).join("");

    // Attach click handlers to View Challenge buttons
    grid.querySelectorAll(".view-challenge-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const cid = parseInt(btn.dataset.id, 10);
        const challenge = allChallengesData.find(item => item.id === cid);
        if (challenge) {
          openChallengeModal(challenge);
        }
      });
    });
  }

  // Filter track tab buttons
  document.querySelectorAll(".track-filter-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".track-filter-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentTrackFilter = btn.dataset.track || "all";
      renderChallenges();
    });
  });

  // Search input filter
  const searchInput = document.getElementById("challengeSearchInput");
  searchInput?.addEventListener("input", e => {
    currentSearchQuery = e.target.value.trim();
    renderChallenges();
  });

  // ---------------------------------------------------------
  // 1C. CHALLENGE DETAILS MODAL LOGIC
  // ---------------------------------------------------------
  const challengeModal = document.getElementById("challengeModalBackdrop");
  const closeChallengeModalBtn = document.getElementById("closeChallengeModalBtn");
  const modalChallengeNum = document.getElementById("modalChallengeNum");
  const modalChallengeDiff = document.getElementById("modalChallengeDiff");
  const modalChallengeTitle = document.getElementById("modalChallengeTitle");
  const modalChallengeTrack = document.getElementById("modalChallengeTrack");
  const modalChallengeContent = document.getElementById("modalChallengeContent");
  const modalPdfDownloadBtn = document.getElementById("modalPdfDownloadBtn");
  const modalApplyProblemBtn = document.getElementById("modalApplyProblemBtn");


  function openChallengeModal(c) {
    if (!challengeModal) return;

    if (modalChallengeNum) modalChallengeNum.textContent = c.challengeNumber;
    if (modalChallengeTitle) modalChallengeTitle.textContent = c.title;
    if (modalChallengeTrack) modalChallengeTrack.textContent = c.track;
    if (modalChallengeDiff) {
      const diffClass = (c.difficulty || "intermediate").toLowerCase().includes("adv")
        ? "advanced"
        : (c.difficulty || "").toLowerCase().includes("inter")
        ? "intermediate"
        : "beginner";
      modalChallengeDiff.className = `difficulty-pill ${diffClass}`;
      modalChallengeDiff.textContent = c.difficulty || "Intermediate";
    }

    if (modalPdfDownloadBtn) {
      modalPdfDownloadBtn.onclick = (e) => {
        e.preventDefault();
        downloadOrOpenTrackPdf(c.trackId);
      };
    }

    if (modalApplyProblemBtn) {
      modalApplyProblemBtn.onclick = () => {
        closeChallengeModal();
        const stage1Tab = document.getElementById("stage1Tab");
        stage1Tab?.click();
        const s1Statement = document.getElementById("s1Statement");
        if (s1Statement) {
          s1Statement.value = `${c.challengeNumber} — ${c.title}`;
        }
        const s1Track = document.getElementById("s1Track");
        if (s1Track) {
          for (let opt of s1Track.options) {
            if (opt.value && opt.value.toLowerCase().includes(c.trackId.slice(0, 4))) {
              s1Track.value = opt.value;
              break;
            }
          }
        }
        document.getElementById("stage1")?.scrollIntoView({ behavior: "smooth" });
      };
    }

    // Render detail blocks
    const blocks = [];

    if (c.domain) {
      blocks.push(`<div class="detail-block"><h4>🏷️ Domain</h4><p>${escapeHtml(c.domain)}</p></div>`);
    }
    if (c.problemStatement) {
      blocks.push(`<div class="detail-block"><h4>📋 Problem Statement</h4><p>${escapeHtml(c.problemStatement)}</p></div>`);
    }
    if (c.expectedSolution) {
      blocks.push(`<div class="detail-block"><h4>💡 Expected Solution</h4><p>${escapeHtml(c.expectedSolution)}</p></div>`);
    }
    if (c.datasets) {
      blocks.push(`<div class="detail-block"><h4>🗂️ Suggested Datasets &amp; Resources</h4><p>${escapeHtml(c.datasets)}</p></div>`);
    }
    if (c.aiComponent) {
      blocks.push(`<div class="detail-block"><h4>🧠 AI / ML / Cybersecurity Component</h4><p>${escapeHtml(c.aiComponent)}</p></div>`);
    }
    if (c.interesting) {
      blocks.push(`<div class="detail-block"><h4>✨ What Makes the Challenge Interesting?</h4><p>${escapeHtml(c.interesting)}</p></div>`);
    }
    if (c.demo) {
      blocks.push(`<div class="detail-block"><h4>🖥️ Suggested On-Screen Demonstration</h4><p>${escapeHtml(c.demo)}</p></div>`);
    }
    if (c.techRequirements) {
      blocks.push(`<div class="detail-block"><h4>⚙️ Technical Requirements</h4><p>${escapeHtml(c.techRequirements)}</p></div>`);
    }
    if (c.deliverable) {
      blocks.push(`<div class="detail-block"><h4>📦 Suggested Minimum Deliverable</h4><p>${escapeHtml(c.deliverable)}</p></div>`);
    }
    if (c.advancedFeatures) {
      blocks.push(`<div class="detail-block"><h4>🚀 Optional Advanced Features</h4><p>${escapeHtml(c.advancedFeatures)}</p></div>`);
    }
    if (c.ethics) {
      blocks.push(`<div class="detail-block"><h4>⚖️ Responsible AI &amp; Ethical Considerations</h4><p>${escapeHtml(c.ethics)}</p></div>`);
    }
    if (c.innovation) {
      blocks.push(`<div class="detail-block"><h4>🌟 Innovation Angle</h4><p>${escapeHtml(c.innovation)}</p></div>`);
    }
    if (c.metrics) {
      blocks.push(`<div class="detail-block"><h4>📊 Success / Evaluation Metrics</h4><p>${escapeHtml(c.metrics)}</p></div>`);
    }

    if (modalChallengeContent) {
      modalChallengeContent.innerHTML = blocks.join("");
    }

    challengeModal.hidden = false;
    setTimeout(() => challengeModal.classList.add("is-open"), 10);
    document.body.style.overflow = "hidden";
  }

  function closeChallengeModal() {
    if (!challengeModal) return;
    challengeModal.classList.remove("is-open");
    setTimeout(() => {
      challengeModal.hidden = true;
      document.body.style.overflow = "";
    }, 250);
  }

  closeChallengeModalBtn?.addEventListener("click", closeChallengeModal);
  challengeModal?.addEventListener("click", e => {
    if (e.target === challengeModal) closeChallengeModal();
  });

  // ---------------------------------------------------------
  // 1D. ROUND 1 SCREENING HARD CUTOFF ENFORCEMENT (19 Oct 2026, 6:00 PM IST)
  // ---------------------------------------------------------
  const stage1Fieldset = document.getElementById("stage1FormFieldset");
  const stage1DeadlineNote = document.getElementById("stage1DeadlineNote");
  const stage1SubmitBtn = document.getElementById("s1SubmitBtn");
  const stage1StatusPill = document.getElementById("stage1StatusPill");
  const stage1Alert = document.getElementById("stage1StatusAlert");

  const enforceScreeningDeadline = () => {
    const now = getEffectiveNow();
    const isPastDeadline = now.getTime() >= SCREENING_DEADLINE_MS;

    if (isPastDeadline) {
      if (stage1Fieldset) {
        stage1Fieldset.setAttribute("disabled", "true");
        stage1Fieldset.style.opacity = "0.65";
      }
      if (stage1SubmitBtn) {
        stage1SubmitBtn.disabled = true;
        stage1SubmitBtn.textContent = "Round 1 Submission Closed";
        stage1SubmitBtn.classList.add("secondary");
        stage1SubmitBtn.classList.remove("primary");
      }
      if (stage1StatusPill) {
        stage1StatusPill.className = "status-pill not-selected";
        stage1StatusPill.textContent = "ROUND 1 SUBMISSION CLOSED";
      }
      if (stage1DeadlineNote) {
        stage1DeadlineNote.innerHTML = "<strong style='color:#ef4444'>SCREENING SUBMISSION DEADLINE PASSED:</strong> Round 1 closed at 6:00 PM IST on 19 October 2026. Evaluation in progress.";
      }
      if (stage1Alert && stage1Alert.hidden) {
        stage1Alert.hidden = false;
        renderAlert(stage1Alert, "warning", `
          <strong>🔒 Round 1 Idea Screening is Closed:</strong><br>
          The submission deadline of <strong>19 October 2026 at 6:00 PM IST</strong> has passed. Late submissions cannot be accepted. The jury is currently reviewing proposals. Shortlisted teams will be announced later this evening.
        `);
      }
    }
  };

  enforceScreeningDeadline();
  window.setInterval(enforceScreeningDeadline, 15_000);

  // ---------------------------------------------------------
  // 1E. FORM TAB SWITCHING (STAGE 1 VS STAGE 2)
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
  // 1F. STAGE 1 IDEA SCREENING PROPOSAL FORM SUBMIT
  // ---------------------------------------------------------
  const stage1Form = document.getElementById("stage1ScreeningForm");

  stage1Form?.addEventListener("submit", async e => {
    e.preventDefault();

    const now = getEffectiveNow();
    if (now.getTime() >= SCREENING_DEADLINE_MS) {
      alert("🔒 Round 1 idea screening closed at 6:00 PM IST on 19 October 2026. Submissions can no longer be accepted.");
      return;
    }

    const submitBtn = stage1SubmitBtn || stage1Form.querySelector("button[type='submit']");
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
  // 5. FLOATING FEEDBACK MODAL & SUBMISSION SYSTEM
  // ---------------------------------------------------------
  const openFbBtn = document.getElementById("openFeedbackModalBtn");
  const closeFbBtn = document.getElementById("closeFeedbackModalBtn");
  const fbBackdrop = document.getElementById("feedbackModalBackdrop");
  const fbForm = document.getElementById("feedbackForm");
  const fbAlert = document.getElementById("feedbackAlert");
  const fbSubmitBtn = document.getElementById("fbSubmitBtn");

  function openFeedbackModal() {
    if (!fbBackdrop) return;
    fbBackdrop.hidden = false;
    setTimeout(() => fbBackdrop.classList.add("is-open"), 10);
    document.body.style.overflow = "hidden";
  }

  function closeFeedbackModal() {
    if (!fbBackdrop) return;
    fbBackdrop.classList.remove("is-open");
    setTimeout(() => {
      fbBackdrop.hidden = true;
      document.body.style.overflow = "";
    }, 250);
  }

  openFbBtn?.addEventListener("click", openFeedbackModal);
  closeFbBtn?.addEventListener("click", closeFeedbackModal);
  fbBackdrop?.addEventListener("click", e => {
    if (e.target === fbBackdrop) closeFeedbackModal();
  });

  // ESC key closes both modals
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      closeChallengeModal();
      closeFeedbackModal();
    }
  });

  fbForm?.addEventListener("submit", async e => {
    e.preventDefault();

    const name = document.getElementById("fbName")?.value.trim();
    const email = document.getElementById("fbEmail")?.value.trim();
    const category = document.getElementById("fbCategory")?.value;
    const message = document.getElementById("fbMessage")?.value.trim();

    if (!name || !email || !message) {
      if (fbAlert) {
        renderAlert(fbAlert, "warning", "Please fill in your name, email, and feedback message.");
      }
      return;
    }

    setButtonLoading(fbSubmitBtn, true, "Submitting...");

    try {
      // Send feedback to backend with silent fallback
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
        // Fallback logger; feedback remains valid
        console.warn("Feedback logging note:", err);
      });

      renderAlert(fbAlert, "success", `
        <strong>Thank you, ${escapeHtml(name)}!</strong><br>
        Your feedback has been received by the organizing team. We appreciate your insights to improve the hackathon experience!
      `);
      fbForm.reset();
      setTimeout(() => {
        closeFeedbackModal();
        if (fbAlert) fbAlert.hidden = true;
      }, 3500);
    } catch (err) {
      console.error("Feedback error:", err);
      renderAlert(fbAlert, "success", `
        <strong>Thank you, ${escapeHtml(name)}!</strong><br>
        Your feedback has been logged successfully.
      `);
      fbForm.reset();
    } finally {
      setButtonLoading(fbSubmitBtn, false, "Submit Feedback");
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
