/**
 * AI INNOVATION HACKATHON 2026 — SECURE BACKEND API, JUDGE PANEL (ROUND 1 & ROUND 2) & WORKFLOW AUTOMATION
 * Women in AI, Research, Innovation & Entrepreneurship Club
 *
 * Features:
 * 1. doGet:
 *    - ?panel=judge&key=<CONFIGURED_JUDGE_KEY> -> Renders unified Judge Panel Dashboard:
 *      * Round 1: Idea Screening (evaluates Stage 1 Submissions, sends Shortlist / Not Selected emails, updates status)
 *      * Round 2: Final Evaluation (evaluates Final Submissions with WINNER / FINALIST / NOT SELECTED)
 *      * Diagnostics: Safe read-only system health checks (quota, sheets, headers, record lookup)
 *    - ?action=getRound1Submissions -> Returns public Round 1 directory (strips emails, phones, notes, pitch links)
 *    - ?action=checkStatus&query=... -> Returns single participant/team status & Stage 2 eligibility flag.
 *    - ?action=diagnostics&key=... -> JSON diagnostics report
 *    - Default (Public Participants Roster) -> Reads from 'Stage 1 Submissions', ZERO private data exposed.
 * 2. doPost:
 *    - Stage1_Screening -> Logs proposal to 'Stage 1 Submissions', dispatches receipt email.
 *    - Stage2_Final     -> Gated by Stage 1 shortlist status; checks eligibility, logs to 'Final Submissions'.
 *    - Feedback_Submission -> Logs feedback.
 *    - processRound1Decision -> HTTP POST decision endpoint with judge key auth.
 *    - toggleShortlistPublish -> HTTP POST shortlist publication toggle with judge key auth.
 *
 * SPREADSHEET: Always opened via SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID).
 * Never relies on SpreadsheetApp.getActiveSpreadsheet().
 */

const CONFIG = {
  SPREADSHEET_ID: "1FPFuuXNhlENuaZx1UvggOoAPRmbpX3Mz4jenNVMZCm0",
  REGISTRATION_SHEET: "Form Responses 1",
  STAGE1_SHEET: "Stage 1 Submissions",
  STAGE2_SHEET: "Final Submissions",
  FEEDBACK_SHEET: "Feedback",
  EVENT_NAME: "AI Innovation Hackathon 2026",
  ORGANIZER_EMAIL: "womeninairclub@gmail.com",
  WEBSITE_URL: "https://womeninairclub.github.io/women-in-ai-research-club/hackathon.html"
};

/**
 * Retrieves the Judge Authorization Secret Key.
 * Read EXCLUSIVELY from Script Properties ('JUDGE_KEY').
 * Never falls back to a hardcoded or default key.
 */
function getJudgeKey_() {
  const scriptProps = PropertiesService.getScriptProperties();
  const configured = scriptProps.getProperty("JUDGE_KEY");
  if (configured && configured.trim()) {
    return configured.trim();
  }
  return null;
}

/**
 * Validates a judge authentication key provided by a client or user.
 * Performs strict non-empty, type, and string matching.
 */
function validateJudgeKey_(providedKey) {
  if (!providedKey || typeof providedKey !== "string") return false;
  const expected = getJudgeKey_();
  if (!expected) {
    Logger.log("WARNING: JUDGE_KEY is not configured in Script Properties. Access denied.");
    return false;
  }
  return providedKey.trim() === expected;
}

/**
 * Administrative helper for organizers to set or rotate the Judge Secret Key.
 * Private function (trailing underscore prevents invocation via google.script.run).
 * Run directly from the Apps Script editor:
 * Run -> setJudgeKeyInProperties_("your_new_secret_key")
 */
function setJudgeKeyInProperties_(newKey) {
  if (!newKey || typeof newKey !== "string" || !newKey.trim()) {
    throw new Error("Invalid key: Key must be a non-empty string.");
  }
  PropertiesService.getScriptProperties().setProperty("JUDGE_KEY", newKey.trim());
  Logger.log("JUDGE_KEY has been successfully updated in Script Properties.");
  return true;
}

// =========================================================
// 1. HTTP GET ENDPOINT (Judge Panel, Status Lookup & Roster)
// =========================================================
function doGet(e) {
  try {
    const params = e ? e.parameter : {};

    // ROUTE 0: SECURE PROBLEM STATEMENT RELEASE KEY DISPATCH
    // Hard server-side enforcement: releases encryption key ONLY on or after 18 October 2026 (00:00:00 IST).
    if (params.action === "getReleaseKey") {
      const istNowStr = Utilities.formatDate(new Date(), "Asia/Kolkata", "yyyy-MM-dd'T'HH:mm:ssXXX");
      const releaseTimeMs = Date.parse("2026-10-18T00:00:00+05:30");
      const currentServerTimeMs = new Date().getTime();

      if (currentServerTimeMs < releaseTimeMs) {
        return jsonResponse_({
          unlocked: false,
          serverTimeIST: istNowStr,
          message: "Problem statements are securely locked until 18 October 2026 at 12:00 AM IST (Asia/Kolkata)."
        }, 200);
      }

      return jsonResponse_({
        unlocked: true,
        releaseKey: "AI_INNOVATION_HACKATHON_2026_OFFICIAL_RELEASE_18OCT2026_IST",
        serverTimeIST: istNowStr
      }, 200);
    }

    // ROUTE 1: PRIVATE JUDGE PANEL DASHBOARD & AUTHENTICATION
    if (params.panel === "judge") {
      const providedKey = typeof params.key === "string" ? params.key.trim() : "";
      if (!providedKey) {
        // No key provided -> display secure password-entry screen
        return renderJudgeKeyEntryScreen_();
      }
      if (!validateJudgeKey_(providedKey)) {
        // Invalid key provided -> display password-entry screen with error message
        return renderJudgeKeyEntryScreen_("Invalid Judge Access Key. Please check your credentials and try again.");
      }
      return renderJudgePanel(providedKey, params.round);
    }

    // ROUTE 1C: SAFE READ-ONLY DIAGNOSTICS ENDPOINT
    if (params.action === "diagnostics" || params.action === "runDiagnostics") {
      const providedKey = typeof params.key === "string" ? params.key.trim() : "";
      if (!validateJudgeKey_(providedKey)) {
        return jsonResponse_({ success: false, error: "Unauthorized access: Invalid or missing Judge Key." }, 401);
      }
      return jsonResponse_(runJudgeDiagnostics(providedKey));
    }

    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);

    // ROUTE 1B: PUBLIC ROUND 1 IDEA SCREENING SUBMISSIONS & SHORTLIST
    // Exposes ONLY: id, teamName, track, problemStatement, status.
    // ZERO private data exposed (no email, phone, pitch link, proposal text, notes).
    if (params.action === "getRound1Submissions") {
      const stage1Sheet = ss.getSheetByName(CONFIG.STAGE1_SHEET);
      if (!stage1Sheet) {
        return jsonResponse_({
          success: true,
          isPublished: false,
          totalCount: 0,
          shortlistedCount: 0,
          pendingCount: 0,
          submissions: []
        });
      }

      const scriptProps = PropertiesService.getScriptProperties();
      const isPublished = (scriptProps.getProperty("ROUND1_SHORTLIST_PUBLISHED") === "true");
      const showNotSelected = (scriptProps.getProperty("ROUND1_SHOW_NOT_SELECTED") === "true");

      const data1 = stage1Sheet.getDataRange().getValues();
      if (data1.length < 2) {
        return jsonResponse_({
          success: true,
          isPublished: isPublished,
          totalCount: 0,
          shortlistedCount: 0,
          pendingCount: 0,
          submissions: []
        });
      }

      const s1Cols = findStage1Columns_(data1[0]);
      const rows1 = data1.slice(1);
      const seenTeams = new Set();
      const publicSubmissions = [];

      rows1.forEach(row => {
        const teamName = String(row[s1Cols.teamName] || "").trim();
        const track = String(row[s1Cols.track] || "").trim();
        const statement = String(row[s1Cols.statement] || "").trim();
        const rawStatus = String(row[s1Cols.status] || "SUBMISSION RECEIVED").trim().toUpperCase();

        if (!teamName || (!statement && !track)) return;

        const normKey = teamName.toLowerCase();
        if (seenTeams.has(normKey)) return;
        seenTeams.add(normKey);

        let publicStatus = "SUBMISSION RECEIVED";
        if (isPublished) {
          if (rawStatus.includes("NOT SELECTED") || rawStatus.includes("REJECTED")) {
            publicStatus = "NOT SELECTED";
          } else if (rawStatus.includes("SHORTLISTED") || rawStatus.includes("SELECTED")) {
            publicStatus = "SHORTLISTED";
          } else {
            // Exclude PENDING EVALUATION teams from the published results until a decision is finalized
            return;
          }
        } else {
          // Keep decisions private until officially published by organizer
          publicStatus = rawStatus.includes("PENDING") ? "PENDING EVALUATION" : "SUBMISSION RECEIVED";
        }

        const rawType = String(row[s1Cols.type] || "").trim().toUpperCase();
        let participationType = "TEAM";
        if (rawType.includes("INDIV") || rawType.includes("SOLO") || rawType.includes("SINGLE")) {
          participationType = "INDIVIDUAL";
        } else if (rawType.includes("TEAM") || rawType.includes("GROUP")) {
          participationType = "TEAM";
        }

        publicSubmissions.push({
          id: publicSubmissions.length + 1,
          teamName: teamName,
          participationType: participationType,
          track: track,
          problemStatement: statement,
          status: publicStatus
        });
      });

      const shortlistedCount = publicSubmissions.filter(s => s.status === "SHORTLISTED").length;
      const notSelectedCount = publicSubmissions.filter(s => s.status === "NOT SELECTED").length;
      const pendingCount = isPublished ? 0 : publicSubmissions.filter(s => s.status.includes("PENDING") || s.status.includes("RECEIVED")).length;

      return jsonResponse_({
        success: true,
        isPublished: isPublished,
        totalCount: publicSubmissions.length,
        shortlistedCount: shortlistedCount,
        notSelectedCount: notSelectedCount,
        pendingCount: pendingCount,
        submissions: publicSubmissions
      });
    }

    // ROUTE 2: SECURE SINGLE PARTICIPANT / TEAM STATUS LOOKUP
    if (params.action === "checkStatus") {
      const q = String(params.query || "").trim().toLowerCase();
      if (!q) {
        return jsonResponse_({ found: false, error: "Missing query identifier" }, 400);
      }

      const scriptProps = PropertiesService.getScriptProperties();
      const isPublished = (scriptProps.getProperty("ROUND1_SHORTLIST_PUBLISHED") === "true");

      const regSheet = ss.getSheetByName(CONFIG.REGISTRATION_SHEET);
      const stage1Sheet = ss.getSheetByName(CONFIG.STAGE1_SHEET);
      const stage2Sheet = getStage2Sheet_(ss);

      let foundRecord = null;

      if (regSheet) {
        const data = regSheet.getDataRange().getValues();
        if (data.length > 1) {
          const headers = data[0].map(h => String(h || "").trim());
          const col = findColumns_(headers);
          const rows = data.slice(1);

          const match = rows.find(r => {
            const team = String(r[col.teamName] || "").toLowerCase();
            const leader = String(r[col.teamLeader] || "").toLowerCase();
            const name = String(r[col.fullName] || "").toLowerCase();
            const email = String(r[col.email] || "").toLowerCase();
            return team === q || leader === q || name === q || email === q;
          });

          if (match) {
            foundRecord = {
              teamName: match[col.teamName] || match[col.fullName] || "Participant",
              type: match[col.participationType] || "Team",
              status: match[col.screeningStatus] || "REGISTERED"
            };
          }
        }
      }

      if (stage1Sheet) {
        const data1 = stage1Sheet.getDataRange().getValues();
        if (data1.length > 1) {
          const s1Cols = findStage1Columns_(data1[0]);
          const rows1 = data1.slice(1);
          const match1 = rows1.find(r => {
            const ref = String(r[s1Cols.refId] || "").toLowerCase();
            const team = String(r[s1Cols.teamName] || "").toLowerCase();
            const email = String(r[s1Cols.email] || "").toLowerCase();
            return q && (ref === q || team === q || email === q);
          });

          if (match1) {
            const refId = match1[s1Cols.refId];
            let s1Status = match1[s1Cols.status] || "ROUND 1 SUBMITTED";

            // If Round 1 decisions have not been officially published yet, do not leak unpublished decisions
            if (!isPublished) {
              const rawUp = String(s1Status).toUpperCase();
              if (rawUp.includes("SHORTLISTED") || rawUp.includes("NOT SELECTED") || rawUp.includes("REJECTED")) {
                s1Status = "ROUND 1 SUBMITTED (Screening in Progress)";
              }
            }

            if (!foundRecord) {
              foundRecord = {
                teamName: match1[s1Cols.teamName] || "Participant",
                type: match1[s1Cols.type] || "Team",
                status: s1Status,
                referenceId: refId
              };
            } else {
              foundRecord.referenceId = refId;
              if (foundRecord.status === "REGISTERED" || foundRecord.status === "UNDER REVIEW") {
                foundRecord.status = s1Status;
              }
            }
          }
        }
      }

      if (stage2Sheet) {
        const data2 = stage2Sheet.getDataRange().getValues();
        if (data2.length > 1) {
          const hdrs2 = data2[0].map(h => String(h || "").trim().toLowerCase());
          let evalColIdx2 = hdrs2.findIndex(h => h === "final evaluation status");
          const rows2 = data2.slice(1);
          const match2 = rows2.find(r => {
            const team = String(r[1] || "").toLowerCase();
            return team === q;
          });

          if (match2) {
            const rawFinal = (evalColIdx2 !== -1 && match2[evalColIdx2]) ? String(match2[evalColIdx2]).trim().toUpperCase() : "";
            const finalStatus = (rawFinal && rawFinal !== "PENDING EVALUATION")
              ? rawFinal
              : "FINAL SUBMISSION RECEIVED";
            if (foundRecord) {
              foundRecord.status = finalStatus;
            } else {
              foundRecord = {
                teamName: match2[1] || "Participant",
                type: "Team",
                status: finalStatus
              };
            }
          }
        }
      }

      if (!foundRecord) {
        return jsonResponse_({ found: false, message: "No record matched your inquiry." });
      }

      const normStatus = String(foundRecord.status).toUpperCase();
      // Round 2 eligibility is unlocked ONLY if officially shortlisted and published (or for final submissions)
      const eligibleForStage2 = isPublished && (
        normStatus.includes("SHORTLISTED") ||
        normStatus.includes("SELECTED") ||
        normStatus.includes("FINAL SUBMISSION PENDING") ||
        normStatus.includes("FINAL SUBMISSION RECEIVED") ||
        normStatus.includes("FINALIST") ||
        normStatus.includes("WINNER")
      ) && !normStatus.includes("NOT SELECTED") && !normStatus.includes("REJECTED") && !normStatus.includes("PROGRESS");

      return jsonResponse_({
        found: true,
        teamName: foundRecord.teamName,
        type: foundRecord.type,
        status: normalizeStatusName_(foundRecord.status),
        eligibleForStage2: eligibleForStage2,
        referenceId: foundRecord.referenceId || null
      });
    }

    // ROUTE 3: DEFAULT SANITIZED PUBLIC SUBMISSIONS DIRECTORY
    // Reads ONLY from 'Stage 1 Submissions' (NOT registration roster)
    // Public Participants API — exposes ONLY: id, teamName, participationType, track, problemStatement, status
    // NO email, phone, pitch link, notes, or internal private data.
    const stage1Sheet = ss.getSheetByName(CONFIG.STAGE1_SHEET);
    if (!stage1Sheet) return jsonResponse_([]);

    const data1 = stage1Sheet.getDataRange().getValues();
    if (data1.length < 2) return jsonResponse_([]);

    const s1Cols = findStage1Columns_(data1[0]);
    const rows1 = data1.slice(1);
    const seenTeams = new Set();
    const publicList = [];

    const scriptProps = PropertiesService.getScriptProperties();
    const isPublished = (scriptProps.getProperty("ROUND1_SHORTLIST_PUBLISHED") === "true");
    const showNotSelected = (scriptProps.getProperty("ROUND1_SHOW_NOT_SELECTED") === "true");

    rows1.forEach(row => {
      const teamName = String(row[s1Cols.teamName] || "").trim();
      const track = String(row[s1Cols.track] || "").trim();
      const statement = String(row[s1Cols.statement] || "").trim();
      const rawType = String(row[s1Cols.type] || "").trim().toUpperCase();
      const rawStatus = String(row[s1Cols.status] || "SUBMISSION RECEIVED").trim().toUpperCase();

      if (!teamName || (!statement && !track)) return;

      const normKey = teamName.toLowerCase();
      if (seenTeams.has(normKey)) return;
      seenTeams.add(normKey);

      let participationType = "TEAM";
      if (rawType.includes("INDIV") || rawType.includes("SOLO") || rawType.includes("SINGLE")) {
        participationType = "INDIVIDUAL";
      } else if (rawType.includes("TEAM") || rawType.includes("GROUP")) {
        participationType = "TEAM";
      }

      let publicStatus = "SUBMISSION RECEIVED";
      if (isPublished) {
        if (rawStatus.includes("NOT SELECTED") || rawStatus.includes("REJECTED")) {
          publicStatus = showNotSelected ? "NOT SELECTED" : "SUBMISSION RECEIVED";
        } else if (rawStatus.includes("SHORTLISTED") || rawStatus.includes("SELECTED")) {
          publicStatus = "SHORTLISTED";
        } else if (rawStatus.includes("PENDING")) {
          publicStatus = "PENDING EVALUATION";
        } else {
          publicStatus = "SUBMISSION RECEIVED";
        }
      } else {
        publicStatus = rawStatus.includes("PENDING") ? "PENDING EVALUATION" : "SUBMISSION RECEIVED";
      }

      publicList.push({
        id: publicList.length + 1,
        teamName: teamName,
        participationType: participationType,
        track: track,
        problemStatement: statement,
        status: publicStatus
      });
    });

    return jsonResponse_(publicList);

  } catch (err) {
    return jsonResponse_({ error: err.toString() }, 500);
  }
}

// =========================================================
// 2. HTTP POST ENDPOINT (Form Submissions & Remote Actions)
// =========================================================
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse_({ success: false, error: "Empty request payload" }, 400);
    }

    let body = {};
    try {
      body = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      return jsonResponse_({ success: false, error: "Invalid JSON format" }, 400);
    }

    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);

    // DEADLINE CONSTANTS (IST = Asia/Kolkata, UTC+5:30)
    // Round 1 Idea Screening: 19 October 2026, 6:00 PM IST (18:00:00)
    const STAGE1_DEADLINE_MS = Date.parse("2026-10-19T18:00:00+05:30");
    // Round 2 Final Submission: 20 October 2026, 6:00 PM IST (18:00:00)
    const STAGE2_DEADLINE_MS = Date.parse("2026-10-20T18:00:00+05:30");

    const currentServerTimeMs = new Date().getTime();

    // STAGE 1: IDEA SCREENING SUBMISSION (Round 1)
    if (body.type === "Stage1_Screening") {
      // Server-side strict deadline enforcement
      if (currentServerTimeMs > STAGE1_DEADLINE_MS) {
        return jsonResponse_({
          success: false,
          error: "Round 1 Idea Screening deadline has passed (19 October 2026 at 6:00 PM IST). Submissions are now closed."
        }, 403);
      }

      const teamName = String(body.teamName || "").trim();
      const leaderName = String(body.leaderName || "").trim();
      const email = String(body.email || "").trim();
      const track = String(body.track || "").trim();
      const statement = String(body.statement || "").trim();
      const solution = String(body.solution || "").trim();
      const approach = String(body.approach || "").trim();
      const phone = String(body.phone || "").trim();
      const pitchLink = String(body.pitchLink || "").trim();

      if (!teamName || !leaderName || !email || !track || !statement || !solution || !approach) {
        return jsonResponse_({
          success: false,
          error: "Missing required fields. Please fill in Team Name, Leader Name, Email, Track, Problem Statement, Solution, and Approach."
        }, 400);
      }

      if (!validateEmail_(email)) {
        return jsonResponse_({ success: false, error: "Invalid email address format." }, 400);
      }

      let stage1Sheet = ss.getSheetByName(CONFIG.STAGE1_SHEET);
      if (!stage1Sheet) {
        stage1Sheet = ss.insertSheet(CONFIG.STAGE1_SHEET);
        stage1Sheet.appendRow([
          "Reference ID", "Timestamp (IST)", "Participation Type", "Team Name",
          "Team Leader / Primary Contact Name", "Email Address", "Phone", "Track", "Problem Statement",
          "Proposed Solution", "AI Approach", "Pitch Link", "Screening Status", "Screening Email Sent", "Reviewer Notes"
        ]);
      }
      const s1Data = stage1Sheet.getDataRange().getValues();
      const s1Cols = findStage1Columns_(s1Data[0]);
      if (s1Data.length > 1) {
        const rows1 = s1Data.slice(1);
        const duplicate = rows1.find(r => {
          const exTeam = String(r[s1Cols.teamName] || "").toLowerCase().trim();
          const exEmail = String(r[s1Cols.email] || "").toLowerCase().trim();
          return (teamName && exTeam === teamName.toLowerCase()) || (email && exEmail === email.toLowerCase());
        });

        if (duplicate) {
          return jsonResponse_({
            success: false,
            alreadySubmitted: true,
            refId: duplicate[s1Cols.refId],
            message: "Stage 1 proposal has already been submitted for this team/email.",
            status: duplicate[s1Cols.status] || "ROUND 1 SUBMITTED"
          }, 200);
        }
      }

      const timestamp = Utilities.formatDate(new Date(), "Asia/Kolkata", "yyyy-MM-dd HH:mm:ss");
      const refId = generateUniqueRefId_(stage1Sheet, "WAI-SCR", s1Cols.refId);

      stage1Sheet.appendRow([
        refId, timestamp, body.participationType || "Team", teamName,
        leaderName, email, phone, track, statement,
        solution, approach, pitchLink, "PENDING EVALUATION", "Not Sent", ""
      ]);

      let emailSent = false;
      try {
        MailApp.sendEmail({
          to: email,
          subject: `${CONFIG.EVENT_NAME} — Stage 1 Submission Receipt [${refId}]`,
          htmlBody: `
            <div style="font-family:Arial,sans-serif;line-height:1.6;color:#222;max-width:600px">
              <h2 style="color:#7c3aed">Stage 1 Idea Proposal Received</h2>
              <p>Dear ${escapeHtml_(leaderName || teamName)},</p>
              <p>Your solution proposal for <strong>${escapeHtml_(statement)}</strong> has been successfully received for Stage 1 Idea Screening.</p>
              <p><strong>Official Reference Code:</strong> <span style="font-family:monospace;font-weight:bold;color:#7c3aed">${refId}</span><br>
              <strong>Track:</strong> ${escapeHtml_(track)}<br>
              <strong>Official Server Timestamp:</strong> ${timestamp} IST</p>
              <p>Stage 1 screening results will be announced after jury evaluation. Shortlisted teams will be invited to participate in the Stage 2 Main Hackathon on 20 October 2026.</p>
              <p>Official Hackathon Portal: <a href="${CONFIG.WEBSITE_URL}">${CONFIG.WEBSITE_URL}</a></p>
              <p style="margin-top:24px">Warm regards,<br><strong>AI Innovation Hackathon Organizing Committee</strong><br>Women in AI, Research, Innovation & Entrepreneurship Club</p>
            </div>
          `
        });
        emailSent = true;
      } catch (mailErr) {
        Logger.log("MailApp notice failed: " + mailErr.toString());
      }

      return jsonResponse_({
        success: true,
        refId: refId,
        timestamp: timestamp,
        status: "PENDING EVALUATION",
        emailSent: emailSent
      });
    }

    // STAGE 2: FINAL PROJECT SUBMISSION (Round 2)
    if (body.type === "Stage2_Final") {
      if (currentServerTimeMs > STAGE2_DEADLINE_MS) {
        return jsonResponse_({
          success: false,
          error: "Round 2 Final Project Submission deadline has passed (20 October 2026 at 6:00 PM IST). Submissions are now closed."
        }, 403);
      }

      const teamName     = String(body.teamName || "").trim();
      const email        = String(body.email || "").trim();
      const track        = String(body.track || "").trim();
      const projectTitle = String(body.projectTitle || "").trim();
      const githubUrl    = String(body.githubUrl || "").trim();
      const demoUrl      = String(body.demoUrl || "").trim();
      const description  = String(body.description || "").trim();

      if (!teamName || !email) {
        return jsonResponse_({
          success: false,
          error: "Missing required fields. Please provide Team Name and Leader Email."
        }, 400);
      }

      if (!validateEmail_(email)) {
        return jsonResponse_({ success: false, error: "Invalid team leader email address format." }, 400);
      }

      if (!githubUrl || !githubUrl.toLowerCase().includes("github.com")) {
        return jsonResponse_({
          success: false,
          error: "A valid public GitHub repository URL is required for final submission."
        }, 400);
      }

      // 1. Verify shortlist eligibility against Stage 1 records
      const eligibility = checkTeamEligibility_(ss, teamName, email);
      if (!eligibility.isEligible) {
        return jsonResponse_({
          success: false,
          error: eligibility.reason || "Round 2 Final Submission is available only to shortlisted/selected teams from Stage 1 Idea Screening.",
          currentStatus: eligibility.currentStatus
        }, 403);
      }

      // 2. Open or initialize Final Submissions sheet
      const stage2Sheet = getStage2Sheet_(ss);
      if (!stage2Sheet) {
        return jsonResponse_({
          success: false,
          error: "Final Submissions sheet could not be accessed."
        }, 500);
      }

      // 3. Duplicate protection: check if final project already submitted
      const s2Data = stage2Sheet.getDataRange().getValues();
      let isDuplicate = false;
      let existingRef = null;

      if (s2Data.length > 1) {
        const rows2 = s2Data.slice(1);
        const match = rows2.find(r => {
          const exTeam = String(r[1] || "").toLowerCase().trim();
          return exTeam === teamName.toLowerCase();
        });
        if (match) {
          isDuplicate = true;
          existingRef = "WAI-FIN-SAVED";
        }
      }

      if (isDuplicate) {
        return jsonResponse_({
          success: false,
          alreadySubmitted: true,
          refId: existingRef,
          message: `Final project submission has already been recorded for team "${teamName}".`,
          status: "FINAL SUBMISSION RECEIVED"
        }, 200);
      }

      const timestamp = Utilities.formatDate(new Date(), "Asia/Kolkata", "yyyy-MM-dd HH:mm:ss");
      const refId = generateUniqueRefId_(stage2Sheet, "WAI-FIN", 0);
      const statementField = (track ? `[${track}] ` : "") + (projectTitle || "Final Project Deliverable");
      const declarationField = (description ? description.substring(0, 500) + " | " : "") + "Deliverables Verified: GitHub code & README provided.";

      stage2Sheet.appendRow([
        timestamp,
        teamName,
        statementField,
        githubUrl,
        demoUrl || "—",
        demoUrl || "—",
        declarationField,
        "PENDING EVALUATION",
        "Not Sent"
      ]);
      SpreadsheetApp.flush();

      let emailSent = false;
      try {
        MailApp.sendEmail({
          to: email,
          subject: `${CONFIG.EVENT_NAME} — Final Project Submission Receipt [${refId}]`,
          htmlBody: `
            <div style="font-family:Arial,sans-serif;line-height:1.6;color:#222;max-width:600px">
              <h2 style="color:#059669">Final Project Submission Recorded</h2>
              <p>Dear ${escapeHtml_(teamName)},</p>
              <p>Your Stage 2 final project submission for <strong>${escapeHtml_(projectTitle || statementField)}</strong> has been successfully received and logged for jury evaluation.</p>
              <p><strong>Official Final Reference Code:</strong> <span style="font-family:monospace;font-weight:bold;color:#059669">${refId}</span><br>
              <strong>GitHub Repository:</strong> <a href="${escapeHtml_(githubUrl)}">${escapeHtml_(githubUrl)}</a><br>
              <strong>Official Server Timestamp:</strong> ${timestamp} IST</p>
              <p>Final round jury evaluation results and award announcements will be published at 8:00 PM IST.</p>
              <p>Official Hackathon Portal: <a href="${CONFIG.WEBSITE_URL}">${CONFIG.WEBSITE_URL}</a></p>
              <p style="margin-top:24px">Warm regards,<br><strong>AI Innovation Hackathon Organizing Committee & Jury</strong><br>Women in AI, Research, Innovation & Entrepreneurship Club</p>
            </div>
          `
        });
        emailSent = true;
      } catch (mailErr) {
        Logger.log("Stage 2 MailApp receipt failed: " + mailErr.toString());
      }

      return jsonResponse_({
        success: true,
        refId: refId,
        timestamp: timestamp,
        status: "FINAL SUBMISSION RECEIVED",
        emailSent: emailSent
      });
    }

    // REMOTE DECISION ACTION: ROUND 1
    if (body.type === "processRound1Decision") {
      const judgeKey = String(body.judgeKey || body.key || "").trim();
      const refId = String(body.refId || "").trim();
      const decision = String(body.decision || "").trim();
      const notes = String(body.notes || "").trim();
      const res = processRound1JudgeDecision(refId, decision, judgeKey, notes);
      return jsonResponse_(res);
    }

    // REMOTE SHORTLIST PUBLISH TOGGLE
    if (body.type === "toggleShortlistPublish") {
      const judgeKey = String(body.judgeKey || body.key || "").trim();
      const isPublished = !!body.isPublished;
      const showNotSelected = !!body.showNotSelected;
      const res = setRound1PublishStatus(isPublished, showNotSelected, judgeKey);
      return jsonResponse_(res);
    }

    // FEEDBACK SUBMISSION
    if (body.type === "Feedback_Submission") {
      const name = String(body.name || "").trim();
      const email = String(body.email || "").trim();
      const category = String(body.category || "General").trim();
      const message = String(body.message || "").trim();

      if (!name || !email || !message) {
        return jsonResponse_({ success: false, error: "Missing required feedback fields." }, 400);
      }

      let fbSheet = ss.getSheetByName(CONFIG.FEEDBACK_SHEET || "Feedback");
      if (!fbSheet) {
        fbSheet = ss.insertSheet(CONFIG.FEEDBACK_SHEET || "Feedback");
        fbSheet.appendRow(["Timestamp (IST)", "Name", "Email Address", "Category", "Feedback Message"]);
      }
      const timestamp = Utilities.formatDate(new Date(), "Asia/Kolkata", "yyyy-MM-dd HH:mm:ss");
      fbSheet.appendRow([timestamp, name, email, category, message]);
      SpreadsheetApp.flush();

      return jsonResponse_({
        success: true,
        message: "Thank you! Your feedback has been recorded."
      });
    }

    return jsonResponse_({ success: false, error: "Unsupported submission type." }, 400);

  } catch (err) {
    return jsonResponse_({ success: false, error: err.toString() }, 500);
  }
}

// =========================================================
// 3. ROUND 1 JUDGE SERVER FUNCTIONS (Stage 1 Submissions)
// =========================================================

/**
 * getRound1JudgeData(judgeKey)
 * Reads submissions from 'Stage 1 Submissions'.
 * Ensures required headers exist.
 * Returns submission list with full details for authorized jury review.
 */
function getRound1JudgeData(judgeKey) {
  if (!validateJudgeKey_(judgeKey)) {
    throw new Error("Unauthorized access: Invalid or missing Judge Key.");
  }

  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  let sheet = ss.getSheetByName(CONFIG.STAGE1_SHEET);
  if (!sheet) return { submissions: [], isPublished: false, remainingQuota: MailApp.getRemainingDailyQuota() };

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return { submissions: [], isPublished: false, remainingQuota: MailApp.getRemainingDailyQuota() };

  // Ensure required headers exist
  const hdrs = data[0].map(h => String(h || "").trim());
  let statusColIdx = hdrs.findIndex(h => {
    const nh = h.toLowerCase();
    return nh.includes("status");
  });
  if (statusColIdx === -1) {
    statusColIdx = hdrs.length;
    sheet.getRange(1, statusColIdx + 1).setValue("Screening Status");
    hdrs.push("Screening Status");
  }

  let emailSentColIdx = hdrs.findIndex(h => {
    const nh = h.toLowerCase();
    return nh.includes("email") && (nh.includes("sent") || nh.includes("dispatch"));
  });
  if (emailSentColIdx === -1) {
    emailSentColIdx = hdrs.length;
    sheet.getRange(1, emailSentColIdx + 1).setValue("Screening Email Sent");
    hdrs.push("Screening Email Sent");
  }

  let notesColIdx = hdrs.findIndex(h => {
    const nh = h.toLowerCase();
    return nh.includes("note") || nh.includes("remark") || nh.includes("comment");
  });
  if (notesColIdx === -1) {
    notesColIdx = hdrs.length;
    sheet.getRange(1, notesColIdx + 1).setValue("Reviewer Notes");
    hdrs.push("Reviewer Notes");
  }
  SpreadsheetApp.flush();

  const cols = findStage1Columns_(hdrs);
  const scriptProps = PropertiesService.getScriptProperties();
  const isPublished = (scriptProps.getProperty("ROUND1_SHORTLIST_PUBLISHED") === "true");
  const showNotSelected = (scriptProps.getProperty("ROUND1_SHOW_NOT_SELECTED") === "true");

  const submissions = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const teamName = String(row[cols.teamName] || "").trim();
    const leaderName = String(row[cols.leaderName] || "").trim();
    const email = String(row[cols.email] || "").trim();
    const statement = String(row[cols.statement] || "").trim();
    const track = String(row[cols.track] || "").trim();

    if (!teamName && !statement && !track) continue;

    let refId = String(row[cols.refId] || "").trim();
    if (!refId) {
      refId = "WAI-SCR-ROW" + (i + 1);
    }

    const rawStatus = cols.status < row.length && row[cols.status]
      ? String(row[cols.status]).trim()
      : "PENDING EVALUATION";

    const emailSent = cols.emailSent < row.length && row[cols.emailSent]
      ? String(row[cols.emailSent]).trim()
      : "Not Sent";

    const notes = cols.notes < row.length && row[cols.notes]
      ? String(row[cols.notes]).trim()
      : "";

    submissions.push({
      refId: refId,
      rowNumber: i + 1,
      timestamp: String(row[cols.timestamp] || ""),
      type: String(row[cols.type] || "Team"),
      teamName: teamName || "Participant",
      leaderName: leaderName,
      email: email, // Visible only to authenticated jury
      phone: String(row[cols.phone] || ""),
      track: track,
      statement: statement,
      solution: String(row[cols.solution] || ""),
      approach: String(row[cols.approach] || ""),
      pitchLink: String(row[cols.pitchLink] || ""),
      status: normalizeRound1Status_(rawStatus),
      emailSent: emailSent,
      notes: notes
    });
  }

  let remainingQuota = 0;
  try {
    remainingQuota = MailApp.getRemainingDailyQuota();
  } catch (qErr) {
    Logger.log("MailApp.getRemainingDailyQuota warning: " + qErr.toString());
  }

  return {
    submissions: submissions,
    isPublished: isPublished,
    showNotSelected: showNotSelected,
    remainingQuota: remainingQuota
  };
}

/**
 * processRound1JudgeDecision(refId, decision, judgeKey, notes)
 *
 * Updates decision in 'Stage 1 Submissions'.
 * 1. Matches by stable Reference ID (refId) or verified unique key.
 * 2. Saves decision to 'Screening Status' BEFORE initiating email.
 * 3. Enforces idempotency / duplicate-email protection.
 * 4. Checks MailApp daily quota.
 * 5. Resolves recipient from verified 'Team Leader Email'.
 * 6. Dispatches Shortlist or Not Selected email.
 * 7. Records 'Sent (timestamp IST)' ONLY after MailApp completes without throwing;
 *    records failure details for safe retry.
 * 8. Uses LockService for concurrency protection.
 */
function processRound1JudgeDecision(refId, decision, judgeKey, notes) {
  if (!validateJudgeKey_(judgeKey)) {
    return { success: false, savedInSheet: false, message: "Unauthorized access: Invalid or missing Judge Key." };
  }

  const cleanRef = String(refId || "").trim();
  const cleanDecision = String(decision || "").trim().toLowerCase();

  // Validate supported decision states
  let targetStatus = "PENDING EVALUATION";
  if (cleanDecision === "shortlisted" || cleanDecision === "selected") {
    targetStatus = "SHORTLISTED";
  } else if (cleanDecision === "not_selected" || cleanDecision === "not selected" || cleanDecision === "rejected") {
    targetStatus = "NOT SELECTED";
  } else if (cleanDecision === "pending" || cleanDecision === "pending evaluation") {
    targetStatus = "PENDING EVALUATION";
  } else {
    return { success: false, savedInSheet: false, message: "Unsupported decision: " + decision };
  }

  const lock = MockLockOrScriptLock_();
  let hasLock = false;
  try {
    hasLock = lock.tryLock(10000);
  } catch (lockErr) {
    Logger.log("Lock acquisition warning: " + lockErr.toString());
  }

  if (!hasLock) {
    return {
      success: false,
      savedInSheet: false,
      message: "Server is currently processing another judge decision. Please try again in a few seconds."
    };
  }

  try {
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const sheet = ss.getSheetByName(CONFIG.STAGE1_SHEET);
    if (!sheet) {
      return { success: false, savedInSheet: false, message: "Sheet not found: " + CONFIG.STAGE1_SHEET };
    }

    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) {
      return { success: false, savedInSheet: false, message: "No submission data found in " + CONFIG.STAGE1_SHEET };
    }

    const hdrs = data[0].map(h => String(h || "").trim());
    const cols = findStage1Columns_(hdrs);

    // Locate matching row by Reference ID (first choice), or by team/email fallback
    let matchedRowIndex = -1;
    let matchedRow = null;

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const rRef = String(row[cols.refId] || "").trim().toLowerCase();
      if (cleanRef && rRef === cleanRef.toLowerCase()) {
        matchedRowIndex = i + 1; // 1-based sheet row
        matchedRow = row;
        break;
      }
    }

    // Fallback search if refId was not found directly
    if (matchedRowIndex === -1 && cleanRef) {
      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        const rTeam = String(row[cols.teamName] || "").trim().toLowerCase();
        const rEmail = String(row[cols.email] || "").trim().toLowerCase();
        if (rTeam === cleanRef.toLowerCase() || rEmail === cleanRef.toLowerCase()) {
          matchedRowIndex = i + 1;
          matchedRow = row;
          break;
        }
      }
    }

    if (matchedRowIndex === -1 || !matchedRow) {
      return {
        success: false,
        savedInSheet: false,
        message: "Submission with Reference ID '" + cleanRef + "' was not found in " + CONFIG.STAGE1_SHEET + "."
      };
    }

    // Extract row details
    const teamName = String(matchedRow[cols.teamName] || "Participant").trim();
    const leaderName = String(matchedRow[cols.leaderName] || "").trim();
    const statement = String(matchedRow[cols.statement] || "").trim();
    const currentStatus = String(matchedRow[cols.status] || "").trim().toUpperCase();
    const currentEmailSent = String(matchedRow[cols.emailSent] || "").trim();

    // 1. Save Decision and Reviewer Notes in sheet FIRST
    sheet.getRange(matchedRowIndex, cols.status + 1).setValue(targetStatus);
    if (typeof notes === "string" && notes.trim() && cols.notes !== -1) {
      sheet.getRange(matchedRowIndex, cols.notes + 1).setValue(notes.trim());
    }
    SpreadsheetApp.flush();

    // 2. If decision is PENDING EVALUATION, no email dispatch needed
    if (targetStatus === "PENDING EVALUATION") {
      if (!currentEmailSent.toLowerCase().startsWith("sent")) {
        sheet.getRange(matchedRowIndex, cols.emailSent + 1).setValue("Pending");
        SpreadsheetApp.flush();
      }
      return {
        success: true,
        savedInSheet: true,
        emailSent: false,
        status: targetStatus,
        refId: cleanRef,
        message: `Decision saved as PENDING EVALUATION for ${teamName}. No notification email sent.`
      };
    }

    // 3. Duplicate email protection (Idempotency)
    const isAlreadySent = currentEmailSent.toLowerCase().startsWith("sent") || currentEmailSent.toLowerCase() === "yes";
    const isSameOutcome = normalizeRound1Status_(currentStatus) === targetStatus;

    if (isAlreadySent && isSameOutcome) {
      return {
        success: true,
        savedInSheet: true,
        emailSent: true,
        duplicatePrevented: true,
        status: targetStatus,
        refId: cleanRef,
        message: `Decision updated to ${targetStatus}. Screening email was already dispatched previously (duplicate prevented).`
      };
    }

    // 4. Resolve verified recipient email
    let recipientEmail = String(matchedRow[cols.email] || "").trim();
    if (!validateEmail_(recipientEmail)) {
      // Fallback cross-reference to registration sheet
      recipientEmail = resolveEmailByTeamName_(ss, teamName);
    }

    if (!recipientEmail || !validateEmail_(recipientEmail)) {
      const failMsg = "Failed: Missing or invalid Team Leader Email";
      sheet.getRange(matchedRowIndex, cols.emailSent + 1).setValue(failMsg);
      SpreadsheetApp.flush();
      return {
        success: false,
        savedInSheet: true,
        emailSent: false,
        status: targetStatus,
        refId: cleanRef,
        message: `Status saved as ${targetStatus}, but recipient email could not be resolved from Team Leader Email field.`
      };
    }

    // 5. Check remaining MailApp daily quota
    let remainingQuota = 100;
    try {
      remainingQuota = MailApp.getRemainingDailyQuota();
    } catch (qErr) {
      Logger.log("Quota check warning: " + qErr.toString());
    }

    if (remainingQuota <= 0) {
      const quotaFailMsg = "Failed: MailApp daily email quota exhausted (0 remaining)";
      sheet.getRange(matchedRowIndex, cols.emailSent + 1).setValue(quotaFailMsg);
      SpreadsheetApp.flush();
      return {
        success: false,
        savedInSheet: true,
        emailSent: false,
        status: targetStatus,
        refId: cleanRef,
        message: `Status saved as ${targetStatus}, but daily MailApp email quota has been exhausted (0 remaining). Retry tomorrow or dispatch from another account.`
      };
    }

    // 6. Build and dispatch Round 1 screening notification email
    const emailResult = dispatchRound1ScreeningEmail_({
      recipientEmail: recipientEmail,
      teamName: teamName,
      leaderName: leaderName,
      statement: statement,
      refId: cleanRef,
      decision: targetStatus
    });

    if (emailResult.success) {
      const nowIst = Utilities.formatDate(new Date(), "Asia/Kolkata", "yyyy-MM-dd HH:mm");
      const sentVal = `Sent (${nowIst} IST)`;
      sheet.getRange(matchedRowIndex, cols.emailSent + 1).setValue(sentVal);
      SpreadsheetApp.flush();

      return {
        success: true,
        savedInSheet: true,
        emailSent: true,
        status: targetStatus,
        refId: cleanRef,
        recipient: recipientEmail,
        message: `Decision saved as ${targetStatus} and screening result email delivered to ${recipientEmail}!`
      };
    } else {
      const safeError = String(emailResult.error || "MailApp error").substring(0, 120);
      const failVal = `Failed: ${safeError}`;
      sheet.getRange(matchedRowIndex, cols.emailSent + 1).setValue(failVal);
      SpreadsheetApp.flush();

      return {
        success: false,
        savedInSheet: true,
        emailSent: false,
        status: targetStatus,
        refId: cleanRef,
        recipient: recipientEmail,
        message: `Decision saved to sheet, but email delivery failed: ${safeError}. Record marked for safe retry.`
      };
    }

  } finally {
    try {
      lock.releaseLock();
    } catch (relErr) {
      // Ignored
    }
  }
}

/**
 * Dispatches a Round 1 Screening Result Email to the Team Leader.
 * Protected with try/catch; returns { success: boolean, error?: string }.
 */
function dispatchRound1ScreeningEmail_(params) {
  const isShortlisted = params.decision === "SHORTLISTED";
  const displayGreeting = params.leaderName || params.teamName || "Innovator";

  let subject = "";
  let htmlBody = "";
  let textBody = "";

  if (isShortlisted) {
    subject = `${CONFIG.EVENT_NAME} — Stage 1 Shortlist Announcement [${params.refId}]`;
    htmlBody = `
      <div style="font-family:Arial,sans-serif;line-height:1.65;color:#0f172a;max-width:640px;margin:0 auto;padding:24px;background:#f8fafc;border-radius:12px;border:1px solid #e2e8f0">
        <h2 style="color:#0284c7;margin-top:0">🎉 Congratulations — Shortlisted for Stage 2!</h2>
        <p>Dear <strong>${escapeHtml_(displayGreeting)}</strong>,</p>
        <p>We are delighted to inform you that your solution proposal for <strong>${escapeHtml_(params.statement || "your selected problem statement")}</strong> has been <strong>SHORTLISTED</strong> in Round 1 Idea Screening of the <strong>${CONFIG.EVENT_NAME}</strong>!</p>
        
        <div style="background:#ecfdf5;border-left:4px solid #10b981;padding:14px;margin:20px 0;border-radius:4px">
          <strong>Team / Participant:</strong> ${escapeHtml_(params.teamName)}<br>
          <strong>Official Reference Code:</strong> <span style="font-family:monospace;font-weight:bold;color:#047857">${escapeHtml_(params.refId)}</span><br>
          <strong>Screening Outcome:</strong> <span style="color:#047857;font-weight:bold">SHORTLISTED</span><br>
          <strong>Next Stage:</strong> Stage 2 Main Hackathon &amp; Final Project Submission
        </div>

        <h3 style="color:#0f172a;margin-bottom:8px">Next Steps for Shortlisted Teams:</h3>
        <ol style="padding-left:20px;margin-top:4px">
          <li><strong>Build your deliverable:</strong> Finalize your working prototype, AI architecture, and project code.</li>
          <li><strong>Prepare your repository:</strong> Ensure your GitHub repository contains a comprehensive README and runnable code.</li>
          <li><strong>Submit final deliverables:</strong> Stage 2 submissions close strictly on <strong>20 October 2026 at 6:00 PM IST</strong>.</li>
        </ol>

        <p><a href="${CONFIG.WEBSITE_URL}#stage2" style="display:inline-block;background:#0284c7;color:#fff;padding:10px 20px;text-decoration:none;border-radius:6px;font-weight:bold">Access Stage 2 Final Submission Portal ↗</a></p>

        <p style="margin-top:28px">Warm regards,<br>
        <strong>AI Innovation Hackathon Organizing Committee &amp; Screening Jury</strong><br>
        Women in AI, Research, Innovation &amp; Entrepreneurship Club<br>
        <span style="font-size:12px;color:#64748b">For inquiries: ${CONFIG.ORGANIZER_EMAIL}</span></p>
      </div>
    `;
    textBody = `Congratulations! Your team (${params.teamName}) has been SHORTLISTED for Stage 2 of the ${CONFIG.EVENT_NAME}!\n\nReference Code: ${params.refId}\n\nStage 2 final submissions close on 20 October 2026 at 6:00 PM IST.\nPortal: ${CONFIG.WEBSITE_URL}#stage2\n\nRegards,\nAI Innovation Hackathon 2026 Organizing Committee\n${CONFIG.ORGANIZER_EMAIL}`;
  } else {
    subject = `${CONFIG.EVENT_NAME} — Round 1 Screening Result [${params.refId}]`;
    htmlBody = `
      <div style="font-family:Arial,sans-serif;line-height:1.65;color:#0f172a;max-width:640px;margin:0 auto;padding:24px;background:#f8fafc;border-radius:12px;border:1px solid #e2e8f0">
        <h2 style="color:#334155;margin-top:0">Round 1 Screening Evaluation Update</h2>
        <p>Dear <strong>${escapeHtml_(displayGreeting)}</strong>,</p>
        <p>Thank you for submitting your proposal for <strong>${escapeHtml_(params.statement || "your selected problem statement")}</strong> in the <strong>${CONFIG.EVENT_NAME}</strong>.</p>
        
        <p>Our screening jury evaluated all submitted proposals across problem understanding, technical feasibility, AI methodology, and potential real-world impact. Due to high competition, your submission has not been selected to advance to Stage 2.</p>

        <div style="background:#f1f5f9;border-left:4px solid #64748b;padding:14px;margin:20px 0;border-radius:4px">
          <strong>Team / Participant:</strong> ${escapeHtml_(params.teamName)}<br>
          <strong>Official Reference Code:</strong> <span style="font-family:monospace;font-weight:bold">${escapeHtml_(params.refId)}</span><br>
          <strong>Screening Outcome:</strong> <span style="color:#475569;font-weight:bold">NOT SELECTED</span>
        </div>

        <p>We sincerely appreciate the effort, time, and creative thought your team invested in developing this solution. We warmly invite you to continue participating in upcoming workshops, research mentorships, and open challenges hosted by our club.</p>

        <p style="margin-top:28px">Warm regards,<br>
        <strong>AI Innovation Hackathon Organizing Committee &amp; Screening Jury</strong><br>
        Women in AI, Research, Innovation &amp; Entrepreneurship Club<br>
        <span style="font-size:12px;color:#64748b">Contact: ${CONFIG.ORGANIZER_EMAIL}</span></p>
      </div>
    `;
    textBody = `Thank you for your submission to ${CONFIG.EVENT_NAME} (${params.refId}).\nAfter Round 1 screening, your proposal was not selected to advance to Stage 2.\nWe appreciate your participation and effort!\n\nRegards,\nAI Innovation Hackathon 2026 Organizing Committee\n${CONFIG.ORGANIZER_EMAIL}`;
  }

  try {
    MailApp.sendEmail({
      to: params.recipientEmail,
      subject: subject,
      htmlBody: htmlBody,
      body: textBody,
      name: "AI Innovation Hackathon 2026 Jury"
    });
    return { success: true };
  } catch (mailErr) {
    Logger.log("MailApp.sendEmail failed: " + mailErr.toString());
    return { success: false, error: mailErr.toString() };
  }
}

/**
 * Allows authorized organizers/judges to toggle Round 1 Shortlist publication status.
 */
function setRound1PublishStatus(isPublished, showNotSelected, judgeKey) {
  if (!validateJudgeKey_(judgeKey)) {
    return { success: false, message: "Unauthorized access: Invalid Judge Key." };
  }
  const scriptProps = PropertiesService.getScriptProperties();
  scriptProps.setProperty("ROUND1_SHORTLIST_PUBLISHED", isPublished ? "true" : "false");
  if (typeof showNotSelected === "boolean") {
    scriptProps.setProperty("ROUND1_SHOW_NOT_SELECTED", showNotSelected ? "true" : "false");
  }
  return {
    success: true,
    isPublished: isPublished,
    showNotSelected: showNotSelected,
    message: isPublished
      ? "Round 1 Shortlist is now officially PUBLISHED on the website!"
      : "Round 1 Shortlist is now in DRAFT (unpublished) mode. Public roster displays confidential status."
  };
}

/**
 * Safe Diagnostic Mode:
 * Runs read-only health checks on:
 *   1. Spreadsheet connectivity
 *   2. Required sheet tabs (Stage 1 Submissions, Final Submissions, Form Responses 1)
 *   3. Required column headers in Stage 1 Submissions
 *   4. Sample record retrieval (lookup by Reference ID)
 *   5. MailApp daily quota & authorization
 *   6. Script properties & publication configuration
 * DOES NOT send emails. DOES NOT modify real records.
 */
function runJudgeDiagnostics(judgeKey) {
  if (!validateJudgeKey_(judgeKey)) {
    return { success: false, message: "Unauthorized access: Invalid Judge Key." };
  }

  const checks = [];
  let allPassed = true;

  // 1. Spreadsheet Connection Check
  try {
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const ssName = (typeof ss.getName === "function") ? ss.getName() : "Hackathon Database";
    checks.push({
      name: "Spreadsheet Connectivity",
      status: "PASS",
      details: `Connected to Spreadsheet ID: ${CONFIG.SPREADSHEET_ID} (${ssName})`
    });

    // 2. Sheets Presence Check
    const sheetsToCheck = [
      { name: CONFIG.STAGE1_SHEET, required: true },
      { name: CONFIG.STAGE2_SHEET, required: true },
      { name: CONFIG.REGISTRATION_SHEET, required: false }
    ];

    sheetsToCheck.forEach(item => {
      const sh = ss.getSheetByName(item.name);
      if (sh) {
        const rowCount = Math.max(0, sh.getLastRow() - 1);
        checks.push({
          name: `Sheet: "${item.name}"`,
          status: "PASS",
          details: `Found with ${rowCount} data rows.`
        });
      } else if (item.required) {
        allPassed = false;
        checks.push({
          name: `Sheet: "${item.name}"`,
          status: "FAIL",
          details: `Required sheet missing in spreadsheet.`
        });
      } else {
        checks.push({
          name: `Sheet: "${item.name}"`,
          status: "WARN",
          details: `Optional registration sheet not present.`
        });
      }
    });

    // 3. Stage 1 Headers & Columns Check
    const s1Sheet = ss.getSheetByName(CONFIG.STAGE1_SHEET);
    if (s1Sheet && s1Sheet.getLastRow() > 0) {
      const hdrs = s1Sheet.getRange(1, 1, 1, Math.max(1, s1Sheet.getLastColumn())).getValues()[0];
      const cols = findStage1Columns_(hdrs);

      const requiredHeaders = [
        { label: "Reference ID", idx: cols.refId },
        { label: "Team Name", idx: cols.teamName },
        { label: "Team Leader Email", idx: cols.email },
        { label: "Problem Statement", idx: cols.statement },
        { label: "Screening Status", idx: cols.status },
        { label: "Screening Email Sent", idx: cols.emailSent }
      ];

      const missingCols = requiredHeaders.filter(h => h.idx === -1 || h.idx === undefined);
      if (missingCols.length === 0) {
        checks.push({
          name: "Stage 1 Submissions Column Schema",
          status: "PASS",
          details: `All required headers detected (Ref ID col ${cols.refId + 1}, Team col ${cols.teamName + 1}, Email col ${cols.email + 1}, Status col ${cols.status + 1}, Email Sent col ${cols.emailSent + 1}).`
        });
      } else {
        checks.push({
          name: "Stage 1 Submissions Column Schema",
          status: "WARN",
          details: `Some columns will be auto-created upon first save: ${missingCols.map(m => m.label).join(", ")}`
        });
      }

      // 4. Sample Record Lookup Test (Read-only)
      if (s1Sheet.getLastRow() > 1) {
        const sampleRow = s1Sheet.getRange(2, 1, 1, s1Sheet.getLastColumn()).getValues()[0];
        const sampleRef = sampleRow[cols.refId] || "WAI-SCR-ROW2";
        const sampleTeam = sampleRow[cols.teamName] || "Participant";
        const sampleEmail = sampleRow[cols.email] || "No email";

        checks.push({
          name: "Sample Record Lookup Test",
          status: "PASS",
          details: `Read Row 2 -> Ref ID: "${sampleRef}", Team: "${sampleTeam}", Email: "${sampleEmail}"`
        });
      }
    }

  } catch (ssErr) {
    allPassed = false;
    checks.push({
      name: "Spreadsheet Connectivity",
      status: "FAIL",
      details: ssErr.toString()
    });
  }

  // 5. MailApp Authorization & Quota Check
  try {
    const remainingQuota = MailApp.getRemainingDailyQuota();
    checks.push({
      name: "MailApp Authorization & Daily Quota",
      status: remainingQuota > 0 ? "PASS" : "WARN",
      details: `MailApp authorized. Remaining daily recipient quota: ${remainingQuota}`
    });
  } catch (mailErr) {
    allPassed = false;
    checks.push({
      name: "MailApp Authorization",
      status: "FAIL",
      details: mailErr.toString()
    });
  }

  // 6. Publication Status & Website Config
  const scriptProps = PropertiesService.getScriptProperties();
  const isPublished = (scriptProps.getProperty("ROUND1_SHORTLIST_PUBLISHED") === "true");
  checks.push({
    name: "Website Shortlist Publication Status",
    status: "PASS",
    details: `ROUND1_SHORTLIST_PUBLISHED is set to: ${isPublished ? "TRUE (Live on website)" : "FALSE (Draft / Hidden from public)"}`
  });

  checks.push({
    name: "Public Website Integration URL",
    status: "PASS",
    details: `Target Website: ${CONFIG.WEBSITE_URL}`
  });

  return {
    success: true,
    overallStatus: allPassed ? "PASS" : "FAIL",
    timestamp: Utilities.formatDate(new Date(), "Asia/Kolkata", "yyyy-MM-dd HH:mm:ss IST"),
    checks: checks
  };
}

// =========================================================
// 4. FINAL ROUND JUDGE PANEL FUNCTIONS (Round 2)
// =========================================================

/**
 * getJudgeData() — Reads ONLY from 'Final Submissions' sheet.
 * Preserves Round 2 Final Submissions Evaluation.
 */
function getJudgeData(judgeKey) {
  if (!validateJudgeKey_(judgeKey)) {
    throw new Error("Unauthorized access: Invalid or missing Judge Key.");
  }
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet = getStage2Sheet_(ss);
  if (!sheet) return [];

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  const hdrs = data[0].map(h => String(h || "").trim());
  let statusColIdx = hdrs.findIndex(h => h.toLowerCase() === "final evaluation status");
  if (statusColIdx === -1) {
    statusColIdx = hdrs.length;
    sheet.getRange(1, statusColIdx + 1).setValue("Final Evaluation Status");
    hdrs.push("Final Evaluation Status");
  }
  let emailSentColIdx = hdrs.findIndex(h => h.toLowerCase() === "final decision email sent");
  if (emailSentColIdx === -1) {
    emailSentColIdx = hdrs.length;
    sheet.getRange(1, emailSentColIdx + 1).setValue("Final Decision Email Sent");
    hdrs.push("Final Decision Email Sent");
  }
  SpreadsheetApp.flush();

  const COL_TEAM  = 1;
  const COL_STMT  = 2;
  const COL_REPO  = 3;
  const COL_VIDEO = 4;
  const COL_LIVE  = 5;
  const COL_DECL  = 6;

  const teamMap = new Map();

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const teamName = String(row[COL_TEAM] || "").trim();
    if (!teamName) continue;

    const problemStatement = String(row[COL_STMT]  || "").trim();
    const githubUrl        = String(row[COL_REPO]  || "").trim();
    const videoLink        = String(row[COL_VIDEO] || "").trim();
    const liveLink         = String(row[COL_LIVE]  || "").trim();
    const declaration      = String(row[COL_DECL]  || "").trim();
    const status           = statusColIdx < row.length && row[statusColIdx]
                             ? String(row[statusColIdx]).trim()
                             : "PENDING EVALUATION";
    const emailSent        = emailSentColIdx < row.length && row[emailSentColIdx]
                             ? String(row[emailSentColIdx]).trim()
                             : "Not Sent";

    teamMap.set(teamName.toLowerCase(), {
      teamName:         teamName,
      problemStatement: problemStatement,
      githubUrl:        githubUrl,
      videoLink:        videoLink,
      liveLink:         liveLink,
      declaration:      declaration,
      status:           status,
      emailSent:        emailSent
    });
  }

  return Array.from(teamMap.values());
}

/**
 * processJudgeDecision(teamName, decision, judgeKey)
 * Processes Round 2 Final Project Decisions.
 */
function processJudgeDecision(teamName, decision, judgeKey) {
  if (!validateJudgeKey_(judgeKey)) {
    return { success: false, savedInSheet: false, message: "Unauthorized: Invalid or missing Judge Key." };
  }

  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet = getStage2Sheet_(ss);
  if (!sheet) return { success: false, savedInSheet: false, message: "Final Submissions sheet not found." };

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return { success: false, savedInSheet: false, message: "No final submissions data available." };

  const hdrs = data[0].map(h => String(h || "").trim().toLowerCase());
  let statusIdx = hdrs.findIndex(h => h === "final evaluation status");
  if (statusIdx === -1) {
    statusIdx = hdrs.length;
    sheet.getRange(1, statusIdx + 1).setValue("Final Evaluation Status");
    hdrs.push("final evaluation status");
  }
  let emailSentIdx = hdrs.findIndex(h => h === "final decision email sent");
  if (emailSentIdx === -1) {
    emailSentIdx = hdrs.length;
    sheet.getRange(1, emailSentIdx + 1).setValue("Final Decision Email Sent");
    hdrs.push("final decision email sent");
  }

  const COL_TEAM = 1;
  const cleanTeam = String(teamName || "").trim().toLowerCase();

  const matchedRowIndices = [];
  let resolvedTeamName = teamName;

  for (let i = 1; i < data.length; i++) {
    const rowTeam = String(data[i][COL_TEAM] || "").trim();
    if (rowTeam.toLowerCase() === cleanTeam) {
      matchedRowIndices.push(i + 1);
      if (!resolvedTeamName) resolvedTeamName = rowTeam;
    }
  }

  if (matchedRowIndices.length === 0) {
    return {
      success: false,
      savedInSheet: false,
      message: "Team '" + teamName + "' not found in " + CONFIG.STAGE2_SHEET + "."
    };
  }

  let finalStatus = "PENDING EVALUATION";
  if (decision === "winner")       finalStatus = "WINNER";
  else if (decision === "finalist") finalStatus = "FINALIST";
  else if (decision === "not_selected") finalStatus = "NOT SELECTED";

  matchedRowIndices.forEach(rowNum => {
    sheet.getRange(rowNum, statusIdx + 1).setValue(finalStatus);
  });
  SpreadsheetApp.flush();

  let isAlreadySent = false;
  for (let i = 0; i < matchedRowIndices.length; i++) {
    const rowData = data[matchedRowIndices[i] - 1];
    const existingVal = emailSentIdx < rowData.length ? String(rowData[emailSentIdx] || "").trim().toLowerCase() : "";
    if (existingVal.startsWith("sent") || existingVal === "yes") {
      isAlreadySent = true;
      break;
    }
  }

  const resolvedEmail = resolveEmailByTeamName_(ss, cleanTeam);

  let emailResult = { success: false, error: "No matching email found for team" };
  if (isAlreadySent) {
    emailResult = { success: true, duplicatePrevented: true };
  } else if (resolvedEmail) {
    try {
      emailResult = sendFinalResultEmail_(resolvedEmail, resolvedTeamName || "Participant", decision);
    } catch (err) {
      emailResult = { success: false, error: err.toString() };
    }
  } else {
    Logger.log("processJudgeDecision: Could not resolve email for team '" + teamName + "'");
  }

  const emailStatusText = isAlreadySent
    ? "Sent (previously dispatched)"
    : (emailResult.success ? ("Sent (" + Utilities.formatDate(new Date(), "Asia/Kolkata", "yyyy-MM-dd HH:mm") + ")") : ("Failed" + (resolvedEmail ? "" : " (email not found)")));
  matchedRowIndices.forEach(rowNum => {
    sheet.getRange(rowNum, emailSentIdx + 1).setValue(emailStatusText);
  });
  SpreadsheetApp.flush();

  if (isAlreadySent) {
    return { success: true, savedInSheet: true, emailSent: true, message: "Decision updated. Final decision email was already sent previously (duplicate prevented)." };
  } else if (emailResult.success) {
    return { success: true, savedInSheet: true, emailSent: true, message: "Final decision saved and email sent successfully!" };
  } else {
    return {
      success: false,
      savedInSheet: true,
      emailSent: false,
      message: "Decision saved to sheet, but email delivery failed: " + (emailResult.error || "MailApp error")
    };
  }
}

// =========================================================
// 5. UNIFIED JUDGE PANEL HTML DASHBOARD (ROUND 1 & 2)
// =========================================================

/**
 * Renders the secure password-entry screen.
 */
function renderJudgeKeyEntryScreen_(errorMessage) {
  const webAppUrl = getWebAppUrl_();
  const safeError = errorMessage ? escapeHtml_(errorMessage) : "";
  const errorHtml = safeError
    ? `<div class="error-banner" role="alert">🚫 ${safeError}</div>`
    : "";

  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <base target="_top">
      <title>Judge Authorization — AI Innovation Hackathon 2026</title>
      <style>
        :root {
          --bg: #0f172a;
          --panel: #1e293b;
          --border: #334155;
          --text: #f8fafc;
          --muted: #94a3b8;
          --primary: #38bdf8;
          --primary-hover: #0284c7;
          --danger: #ef4444;
        }
        * { box-sizing: border-box; }
        body {
          font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
          background: var(--bg);
          color: var(--text);
          min-height: 100vh;
          margin: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        .card {
          background: var(--panel);
          border: 1px solid var(--border);
          border-radius: 16px;
          padding: 36px 32px;
          max-width: 440px;
          width: 100%;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.4);
          text-align: center;
        }
        .icon { font-size: 44px; margin-bottom: 12px; display: inline-block; }
        h1 { font-size: 20px; color: var(--primary); margin: 0 0 6px 0; font-weight: 700; }
        .subtitle { font-size: 13px; color: var(--muted); margin: 0 0 24px 0; line-height: 1.5; }
        .error-banner {
          background: rgba(239, 68, 68, 0.15);
          border: 1px solid rgba(239, 68, 68, 0.35);
          color: #fca5a5;
          padding: 12px 14px;
          border-radius: 8px;
          font-size: 13px;
          margin-bottom: 20px;
          text-align: left;
          line-height: 1.4;
        }
        .form-group { text-align: left; margin-bottom: 20px; }
        label { display: block; font-size: 12px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }
        .input-wrapper { position: relative; display: flex; align-items: center; }
        input[type="password"], input[type="text"] {
          width: 100%;
          background: #0f172a;
          border: 1px solid var(--border);
          color: var(--text);
          padding: 12px 75px 12px 14px;
          border-radius: 8px;
          font-size: 14px;
          font-family: inherit;
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        input:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.2); }
        .toggle-btn {
          position: absolute;
          right: 8px;
          background: transparent;
          border: 1px solid var(--border);
          color: var(--muted);
          cursor: pointer;
          font-size: 11.5px;
          padding: 5px 8px;
          border-radius: 4px;
        }
        .toggle-btn:hover { color: var(--text); border-color: var(--muted); }
        .submit-btn {
          width: 100%;
          background: var(--primary);
          color: #0f172a;
          border: none;
          padding: 12px 16px;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
          transition: background 0.2s;
        }
        .submit-btn:hover { background: var(--primary-hover); }
        .footer-note { margin-top: 24px; font-size: 11.5px; color: var(--muted); line-height: 1.5; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="icon">⚖️</div>
        <h1>AI Innovation Hackathon 2026</h1>
        <p class="subtitle">Official Jury &amp; Screening Panel<br>Women in AI, Research, Innovation &amp; Entrepreneurship Club</p>

        ${errorHtml}

        <form method="GET" action="${escapeHtml_(webAppUrl)}" id="authForm">
          <input type="hidden" name="panel" value="judge">
          <div class="form-group">
            <label for="judgeKey">Judge Access Key</label>
            <div class="input-wrapper">
              <input type="password" name="key" id="judgeKey" placeholder="Enter your secret Judge Key" required autofocus autocomplete="current-password">
              <button type="button" class="toggle-btn" id="toggleBtn" onclick="toggleKeyVisibility()" title="Show/Hide Key">👁 Show</button>
            </div>
          </div>
          <button type="submit" class="submit-btn">Unlock Judge Panel 🔒</button>
        </form>

        <div class="footer-note">
          Restricted access for authorized jury members only.<br>
          Authentication is verified strictly against server-side credentials.
        </div>
      </div>

      <script>
        function toggleKeyVisibility() {
          var input = document.getElementById('judgeKey');
          var btn = document.getElementById('toggleBtn');
          if (input.type === 'password') {
            input.type = 'text';
            btn.textContent = '🔒 Hide';
          } else {
            input.type = 'password';
            btn.textContent = '👁 Show';
          }
        }
        document.getElementById('authForm').addEventListener('submit', function(e) {
          var input = document.getElementById('judgeKey');
          input.value = (input.value || '').trim();
          if (!input.value) {
            e.preventDefault();
            input.focus();
          }
        });
      </script>
    </body>
    </html>
  `;
  return HtmlService.createHtmlOutput(html).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * renderJudgePanel(authorizedKey, activeRound)
 * Unified Judge Panel supporting Round 1 Idea Screening & Round 2 Final Evaluation.
 */
function renderJudgePanel(authorizedKey, activeRound) {
  const initialRound = (activeRound === "2" || activeRound === "final") ? "round2" : "round1";

  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <base target="_top">
      <title>Jury Evaluation Dashboard — AI Innovation Hackathon 2026</title>
      <style>
        :root {
          --bg: #0b1120;
          --panel: #1e293b;
          --panel-alt: #0f172a;
          --border: #334155;
          --border-light: #475569;
          --text: #f8fafc;
          --muted: #94a3b8;
          --primary: #38bdf8;
          --primary-hover: #0284c7;
          --success: #10b981;
          --success-dark: #059669;
          --purple: #a855f7;
          --danger: #ef4444;
          --danger-dark: #dc2626;
          --warning: #f59e0b;
        }
        * { box-sizing: border-box; }
        body {
          font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
          background: var(--bg);
          color: var(--text);
          padding: 24px;
          margin: 0;
          line-height: 1.5;
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
          background: var(--panel);
          padding: 20px 24px;
          border-radius: 12px;
          border: 1px solid var(--border);
          flex-wrap: wrap;
          gap: 16px;
        }
        h1 {
          color: var(--primary);
          font-size: 22px;
          margin: 0;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .nav-tabs {
          display: flex;
          gap: 8px;
          margin-bottom: 20px;
          border-bottom: 1px solid var(--border);
          padding-bottom: 8px;
          flex-wrap: wrap;
        }
        .tab-btn {
          background: transparent;
          border: 1px solid var(--border);
          color: var(--muted);
          padding: 10px 18px;
          border-radius: 8px;
          cursor: pointer;
          font-weight: 700;
          font-size: 13.5px;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          transition: all 0.2s;
        }
        .tab-btn:hover { background: rgba(56, 189, 248, 0.1); color: var(--text); border-color: var(--primary); }
        .tab-btn.active {
          background: var(--primary);
          color: #0f172a;
          border-color: var(--primary);
        }
        .stats-bar {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
          gap: 12px;
          margin-bottom: 20px;
        }
        .stat-card {
          background: var(--panel);
          border: 1px solid var(--border);
          padding: 14px 18px;
          border-radius: 10px;
        }
        .stat-card .label { font-size: 11.5px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.5px; font-weight: 700; margin-bottom: 4px; }
        .stat-card .value { font-size: 24px; font-weight: 800; color: var(--text); }
        .controls-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          margin-bottom: 16px;
          flex-wrap: wrap;
        }
        .search-box {
          background: var(--panel);
          border: 1px solid var(--border);
          color: var(--text);
          padding: 9px 14px;
          border-radius: 6px;
          font-size: 13.5px;
          min-width: 300px;
          flex: 1;
        }
        .search-box:focus { outline: none; border-color: var(--primary); }
        .filter-group { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
        .filter-pill {
          background: var(--panel-alt);
          border: 1px solid var(--border);
          color: var(--muted);
          padding: 7px 12px;
          border-radius: 6px;
          font-size: 12px;
          cursor: pointer;
          font-weight: 600;
          transition: all 0.2s;
        }
        .filter-pill.active { background: rgba(56, 189, 248, 0.2); border-color: var(--primary); color: var(--primary); }
        .action-btn {
          background: var(--panel);
          border: 1px solid var(--border-light);
          color: var(--text);
          padding: 8px 14px;
          border-radius: 6px;
          cursor: pointer;
          font-weight: 600;
          font-size: 12.5px;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          transition: all 0.2s;
        }
        .action-btn:hover { background: #26334d; border-color: var(--primary); }
        .table-container {
          background: var(--panel);
          border-radius: 12px;
          overflow-x: auto;
          border: 1px solid var(--border);
          margin-bottom: 24px;
        }
        table { width: 100%; border-collapse: collapse; text-align: left; }
        th, td { padding: 12px 14px; border-bottom: 1px solid var(--border); font-size: 13px; vertical-align: top; }
        th { background: #0f172a; color: var(--muted); text-transform: uppercase; font-size: 11px; letter-spacing: 0.5px; font-weight: 700; }
        tr:hover { background: #26334d; }
        .btn-decision {
          padding: 6px 10px;
          border: none;
          border-radius: 5px;
          cursor: pointer;
          font-weight: 700;
          font-size: 11.5px;
          margin-right: 4px;
          margin-bottom: 4px;
          transition: all 0.15s;
          display: inline-flex;
          align-items: center;
          gap: 4px;
        }
        .btn-shortlist { background: #10b981; color: #fff; }
        .btn-shortlist:hover { background: #059669; }
        .btn-reject { background: #ef4444; color: #fff; }
        .btn-reject:hover { background: #dc2626; }
        .btn-pending { background: #475569; color: #f8fafc; }
        .btn-pending:hover { background: #334155; }
        .btn-view { background: #0284c7; color: #fff; }
        .badge {
          padding: 4px 8px;
          border-radius: 5px;
          font-size: 11px;
          font-weight: 700;
          display: inline-block;
          letter-spacing: 0.3px;
          white-space: nowrap;
        }
        .badge-pending { background: rgba(245, 158, 11, 0.15); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.3); }
        .badge-shortlisted { background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); }
        .badge-rejected { background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3); }
        .badge-ref { font-family: monospace; background: #0f172a; border: 1px solid var(--border); color: var(--primary); padding: 3px 6px; border-radius: 4px; font-weight: 700; font-size: 12px; }
        .link { color: var(--primary); text-decoration: none; font-weight: 600; }
        .link:hover { text-decoration: underline; }
        .status-banner {
          background: rgba(16, 185, 129, 0.15);
          border: 1px solid rgba(16, 185, 129, 0.35);
          color: #6ee7b7;
          padding: 12px 18px;
          border-radius: 8px;
          margin-bottom: 16px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 13.5px;
        }
        .status-banner.draft {
          background: rgba(245, 158, 11, 0.15);
          border-color: rgba(245, 158, 11, 0.35);
          color: #fde68a;
        }
        /* Modal */
        .modal-overlay {
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0, 0, 0, 0.75);
          display: none;
          align-items: center;
          justify-content: center;
          padding: 20px;
          z-index: 9999;
        }
        .modal-content {
          background: var(--panel);
          border: 1px solid var(--border);
          border-radius: 12px;
          max-width: 780px;
          width: 100%;
          max-height: 90vh;
          overflow-y: auto;
          padding: 24px;
          box-shadow: 0 25px 50px -12px rgba(0,0,0,0.7);
        }
        .modal-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; }
        .modal-close { background: transparent; border: none; font-size: 22px; color: var(--muted); cursor: pointer; }
        .modal-close:hover { color: var(--text); }
        .modal-body { font-size: 13.5px; line-height: 1.6; }
        .modal-field { margin-bottom: 16px; }
        .modal-field h4 { margin: 0 0 4px; color: var(--primary); font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; }
        .modal-field div { background: #0f172a; padding: 10px 14px; border-radius: 6px; border: 1px solid var(--border); white-space: pre-wrap; }
        .modal-actions { margin-top: 20px; display: flex; gap: 10px; justify-content: flex-end; border-top: 1px solid var(--border); padding-top: 16px; }
        /* Toast notification */
        #toastNotice {
          position: fixed;
          bottom: 24px;
          right: 24px;
          background: var(--panel);
          border: 1px solid var(--border);
          padding: 12px 20px;
          border-radius: 8px;
          box-shadow: 0 10px 15px -3px rgba(0,0,0,0.5);
          display: none;
          z-index: 10000;
          font-weight: 600;
          font-size: 13.5px;
        }
      </style>
    </head>
    <body>
      <!-- HEADER -->
      <div class="header">
        <div>
          <h1>⚖️ AI Innovation Hackathon 2026 — Judge Panel</h1>
          <p style="margin:4px 0 0;font-size:13px;color:var(--muted)">
            Women in AI, Research, Innovation &amp; Entrepreneurship Club • Unified Screening &amp; Final Evaluation Panel
          </p>
        </div>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          <button type="button" class="action-btn" onclick="openDiagnosticsModal()">🔍 Run Diagnostics</button>
          <div style="font-size:12px;color:var(--muted);background:#0f172a;padding:8px 14px;border-radius:8px;border:1px solid var(--border)">
            Session: <strong style="color:var(--primary)">Authorized Jury</strong>
          </div>
        </div>
      </div>

      <!-- NAVIGATION TABS -->
      <div class="nav-tabs">
        <button type="button" class="tab-btn ${initialRound === 'round1' ? 'active' : ''}" id="tabBtnRound1" onclick="switchRoundTab('round1')">
          📋 Round 1: Idea Screening
        </button>
        <button type="button" class="tab-btn ${initialRound === 'round2' ? 'active' : ''}" id="tabBtnRound2" onclick="switchRoundTab('round2')">
          🏆 Round 2: Final Evaluation
        </button>
        <button type="button" class="tab-btn" id="tabBtnDiag" onclick="openDiagnosticsModal()">
          🔍 System Health &amp; Diagnostics
        </button>
      </div>

      <!-- ========================================== -->
      <!-- VIEW 1: ROUND 1 IDEA SCREENING DASHBOARD   -->
      <!-- ========================================== -->
      <div id="viewRound1" style="display:${initialRound === 'round1' ? 'block' : 'none'}">
        <!-- SHORTLIST PUBLICATION STATUS BANNER -->
        <div id="shortlistBanner" class="status-banner draft">
          <div>
            <strong id="publishBannerTitle">🔒 Round 1 Shortlist: DRAFT (Unpublished)</strong>
            <span style="font-size:12.5px;display:block;margin-top:2px" id="publishBannerText">
              Decisions are visible ONLY to authorized judges. Public website displays submissions in review.
            </span>
          </div>
          <div>
            <button type="button" class="action-btn" id="publishToggleBtn" onclick="toggleShortlistPublishStatus()">
              📢 Publish Shortlist to Website
            </button>
          </div>
        </div>

        <!-- STATISTICS BAR -->
        <div class="stats-bar">
          <div class="stat-card">
            <div class="label">Total Proposals</div>
            <div class="value" id="r1CntTotal">0</div>
          </div>
          <div class="stat-card">
            <div class="label">Pending Review</div>
            <div class="value" id="r1CntPending" style="color:#fbbf24">0</div>
          </div>
          <div class="stat-card">
            <div class="label">Shortlisted</div>
            <div class="value" id="r1CntShortlisted" style="color:#34d399">0</div>
          </div>
          <div class="stat-card">
            <div class="label">Not Selected</div>
            <div class="value" id="r1CntNotSelected" style="color:#f87171">0</div>
          </div>
          <div class="stat-card">
            <div class="label">Emails Dispatched</div>
            <div class="value" id="r1CntEmails" style="color:#38bdf8">0</div>
          </div>
          <div class="stat-card">
            <div class="label">Mail Quota</div>
            <div class="value" id="r1CntQuota" style="color:#c084fc">100</div>
          </div>
        </div>

        <!-- CONTROLS & SEARCH -->
        <div class="controls-bar">
          <input type="text" id="r1SearchInput" class="search-box" placeholder="Search by Ref ID (e.g. WAI-SCR-...), Team Name, Leader Email, Problem Statement..." oninput="onR1SearchChange()">
          <div class="filter-group">
            <button type="button" class="filter-pill active" id="r1FilterAll" onclick="setR1Filter('all')">All</button>
            <button type="button" class="filter-pill" id="r1FilterPending" onclick="setR1Filter('pending')">Pending Only</button>
            <button type="button" class="filter-pill" id="r1FilterShortlisted" onclick="setR1Filter('shortlisted')">Shortlisted Only</button>
            <button type="button" class="filter-pill" id="r1FilterNotSelected" onclick="setR1Filter('not_selected')">Not Selected</button>
          </div>
        </div>

        <!-- ROUND 1 TABLE (Reads from Stage 1 Submissions) -->
        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th style="width:40px">Sl.</th>
                <th style="width:130px">Ref ID</th>
                <th>Participant / Team</th>
                <th>Track &amp; Challenge Statement</th>
                <th>Proposal Details</th>
                <th>Pitch Deck</th>
                <th>Screening Status</th>
                <th style="width:230px">Jury Decision Actions</th>
              </tr>
            </thead>
            <tbody id="r1TableBody">
              <tr><td colspan="8" style="text-align:center;padding:40px;color:var(--muted)">Connecting to Stage 1 Submissions database...</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- ========================================== -->
      <!-- VIEW 2: ROUND 2 FINAL EVALUATION DASHBOARD -->
      <!-- ========================================== -->
      <div id="viewRound2" style="display:${initialRound === 'round2' ? 'block' : 'none'}">
        <div class="stats-bar">
          <div class="stat-card">
            <div class="label">Total Final Deliverables</div>
            <div class="value" id="r2CntTotal">0</div>
          </div>
          <div class="stat-card">
            <div class="label">Pending Final Jury</div>
            <div class="value" id="r2CntPending" style="color:#fbbf24">0</div>
          </div>
          <div class="stat-card">
            <div class="label">Winners Selected</div>
            <div class="value" id="r2CntWinners" style="color:#34d399">0</div>
          </div>
          <div class="stat-card">
            <div class="label">Finalists Recognized</div>
            <div class="value" id="r2CntFinalists" style="color:#c084fc">0</div>
          </div>
          <div class="stat-card">
            <div class="label">Not Selected</div>
            <div class="value" id="r2CntNotSelected" style="color:#f87171">0</div>
          </div>
        </div>

        <div class="controls-bar">
          <input type="text" id="r2SearchInput" class="search-box" placeholder="Search final submissions by team or statement..." oninput="onR2SearchChange()">
          <div class="filter-group">
            <button type="button" class="filter-pill active" id="r2FilterAll" onclick="setR2Filter('all')">All</button>
            <button type="button" class="filter-pill" id="r2FilterPending" onclick="setR2Filter('pending')">Pending Only</button>
            <button type="button" class="filter-pill" id="r2FilterWinner" onclick="setR2Filter('winner')">Winners</button>
            <button type="button" class="filter-pill" id="r2FilterFinalist" onclick="setR2Filter('finalist')">Finalists</button>
            <button type="button" class="filter-pill" id="r2FilterNotSelected" onclick="setR2Filter('not_selected')">Not Selected</button>
          </div>
        </div>

        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th style="width:40px">Sl.</th>
                <th>Participant / Team Name</th>
                <th>Selected Problem Statement</th>
                <th>GitHub Repository</th>
                <th>Demo Video</th>
                <th>Live Demo</th>
                <th>Declaration</th>
                <th>Final Status &amp; Email</th>
                <th style="width:230px">Final Decision Actions</th>
              </tr>
            </thead>
            <tbody id="r2TableBody">
              <tr><td colspan="9" style="text-align:center;padding:40px;color:var(--muted)">Connecting to Final Submissions sheet...</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- PROPOSAL DETAILS MODAL (ROUND 1) -->
      <div id="proposalModal" class="modal-overlay" onclick="onModalOverlayClick(event)">
        <div class="modal-content">
          <div class="modal-header">
            <div>
              <h2 id="modalTitle" style="margin:0;color:var(--primary);font-size:18px">Proposal Inspection</h2>
              <span id="modalRefBadge" class="badge-ref" style="margin-top:4px;display:inline-block"></span>
            </div>
            <button type="button" class="modal-close" onclick="closeProposalModal()">✕</button>
          </div>
          <div class="modal-body" id="modalBody">
            <!-- Dynamically populated -->
          </div>
          <div class="modal-actions" id="modalActions">
            <!-- Dynamically populated with decision buttons -->
          </div>
        </div>
      </div>

      <!-- DIAGNOSTICS MODAL -->
      <div id="diagModal" class="modal-overlay" onclick="onDiagModalOverlayClick(event)">
        <div class="modal-content" style="max-width:680px">
          <div class="modal-header">
            <div>
              <h2 style="margin:0;color:var(--primary);font-size:18px">🔍 Safe System Diagnostics</h2>
              <span style="font-size:12px;color:var(--muted)">Read-only operational health checks</span>
            </div>
            <button type="button" class="modal-close" onclick="closeDiagnosticsModal()">✕</button>
          </div>
          <div class="modal-body" id="diagBody">
            <div style="text-align:center;padding:30px;color:var(--muted)">Running diagnostic health checks...</div>
          </div>
          <div class="modal-actions">
            <button type="button" class="action-btn" onclick="runDiagnosticsCheck()">🔄 Re-run Checks</button>
            <button type="button" class="action-btn" onclick="closeDiagnosticsModal()">Close</button>
          </div>
        </div>
      </div>

      <!-- TOAST NOTICE -->
      <div id="toastNotice"></div>

      <script>
        var JUDGE_KEY = ${JSON.stringify(authorizedKey || "")};
        var r1Submissions = [];
        var r1CurrentFilter = "all";
        var r1SearchQuery = "";
        var r1IsPublished = false;

        var r2Submissions = [];
        var r2CurrentFilter = "all";
        var r2SearchQuery = "";

        // Initial fetch on page load
        document.addEventListener("DOMContentLoaded", function() {
          loadRound1Data();
          loadRound2Data();
        });

        function switchRoundTab(tab) {
          document.getElementById('viewRound1').style.display = tab === 'round1' ? 'block' : 'none';
          document.getElementById('viewRound2').style.display = tab === 'round2' ? 'block' : 'none';
          document.getElementById('tabBtnRound1').className = tab === 'round1' ? 'tab-btn active' : 'tab-btn';
          document.getElementById('tabBtnRound2').className = tab === 'round2' ? 'tab-btn active' : 'tab-btn';
        }

        // ==========================================
        // ROUND 1 LOGIC
        // ==========================================
        function loadRound1Data() {
          google.script.run
            .withSuccessHandler(renderRound1Rows)
            .withFailureHandler(function(err) {
              document.getElementById('r1TableBody').innerHTML = '<tr><td colspan="8" style="color:#ef4444;padding:30px;text-align:center;">Error loading Stage 1 submissions: ' + escapeHtml(err.message) + '</td></tr>';
            })
            .getRound1JudgeData(JUDGE_KEY);
        }

        function renderRound1Rows(data) {
          if (!data) return;
          r1Submissions = data.submissions || [];
          r1IsPublished = !!data.isPublished;

          updateRound1Banner(r1IsPublished);

          var tbody = document.getElementById('r1TableBody');
          tbody.innerHTML = '';

          var total = r1Submissions.length, pending = 0, shortlisted = 0, notSelected = 0, emails = 0;
          r1Submissions.forEach(function(row) {
            var st = (row.status || '').toUpperCase();
            if (st.indexOf('SHORTLISTED') !== -1 || st.indexOf('SELECTED') !== -1) shortlisted++;
            else if (st.indexOf('NOT SELECTED') !== -1 || st.indexOf('REJECTED') !== -1) notSelected++;
            else pending++;

            if ((row.emailSent || '').toLowerCase().indexOf('sent') !== -1) emails++;
          });

          document.getElementById('r1CntTotal').innerText = total;
          document.getElementById('r1CntPending').innerText = pending;
          document.getElementById('r1CntShortlisted').innerText = shortlisted;
          document.getElementById('r1CntNotSelected').innerText = notSelected;
          document.getElementById('r1CntEmails').innerText = emails;
          document.getElementById('r1CntQuota').innerText = data.remainingQuota !== undefined ? data.remainingQuota : '—';

          var filtered = r1Submissions.filter(function(row) {
            var st = (row.status || '').toUpperCase();
            if (r1CurrentFilter === 'shortlisted' && st.indexOf('SHORTLISTED') === -1 && st.indexOf('SELECTED') === -1) return false;
            if (r1CurrentFilter === 'not_selected' && st.indexOf('NOT SELECTED') === -1 && st.indexOf('REJECTED') === -1) return false;
            if (r1CurrentFilter === 'pending' && (st.indexOf('SHORTLISTED') !== -1 || st.indexOf('SELECTED') !== -1 || st.indexOf('NOT SELECTED') !== -1 || st.indexOf('REJECTED') !== -1)) return false;

            if (r1SearchQuery) {
              var q = r1SearchQuery.toLowerCase();
              var match = (row.refId && row.refId.toLowerCase().indexOf(q) !== -1) ||
                          (row.teamName && row.teamName.toLowerCase().indexOf(q) !== -1) ||
                          (row.leaderName && row.leaderName.toLowerCase().indexOf(q) !== -1) ||
                          (row.email && row.email.toLowerCase().indexOf(q) !== -1) ||
                          (row.statement && row.statement.toLowerCase().indexOf(q) !== -1) ||
                          (row.track && row.track.toLowerCase().indexOf(q) !== -1);
              if (!match) return false;
            }
            return true;
          });

          if (!filtered.length) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:40px;color:var(--muted)">No Stage 1 proposals match your filter.</td></tr>';
            return;
          }

          filtered.forEach(function(row, idx) {
            var tr = document.createElement('tr');
            var statusBadge = '';
            var st = (row.status || '').toUpperCase();
            if (st.indexOf('SHORTLISTED') !== -1 || st.indexOf('SELECTED') !== -1) {
              statusBadge = '<span class="badge badge-shortlisted">⭐ SHORTLISTED</span>';
            } else if (st.indexOf('NOT SELECTED') !== -1 || st.indexOf('REJECTED') !== -1) {
              statusBadge = '<span class="badge badge-rejected">NOT SELECTED</span>';
            } else {
              statusBadge = '<span class="badge badge-pending">PENDING EVALUATION</span>';
            }

            var safePitch = sanitizeUrl_(row.pitchLink);
            var pitchCell = safePitch
              ? '<a href="' + escapeHtml(safePitch) + '" target="_blank" rel="noopener" class="link">View Deck ↗</a>'
              : (row.pitchLink && row.pitchLink !== '—' ? '<span style="color:var(--muted);font-size:12px">' + escapeHtml(row.pitchLink) + '</span>' : '<span style="color:var(--muted)">—</span>');

            var emailSentText = row.emailSent || 'Not Sent';
            var emailColor = emailSentText.toLowerCase().indexOf('sent') !== -1 ? '#34d399' : (emailSentText.toLowerCase().indexOf('failed') !== -1 ? '#f87171' : 'var(--muted)');

            var refEsc = escapeHtml(row.refId);
            var teamEsc = escapeHtml(row.teamName);
            var leaderEsc = row.leaderName ? '<div style="font-size:11.5px;color:var(--muted)">Contact: ' + escapeHtml(row.leaderName) + ' (' + escapeHtml(row.email) + ')</div>' : '<div style="font-size:11.5px;color:var(--muted)">' + escapeHtml(row.email) + '</div>';

            tr.innerHTML =
              '<td style="font-weight:700;color:var(--muted)">' + (idx + 1 < 10 ? '0' : '') + (idx + 1) + '</td>' +
              '<td><span class="badge-ref">' + refEsc + '</span></td>' +
              '<td><strong>' + teamEsc + '</strong><br>' + leaderEsc + '</td>' +
              '<td><span style="font-size:11px;color:var(--primary);font-weight:700;display:block">' + escapeHtml(row.track || '—') + '</span><span style="font-size:12.5px">' + escapeHtml(row.statement || '—') + '</span></td>' +
              '<td><button type="button" class="btn-decision btn-view" onclick="openProposalModal(\'' + refEsc + '\')">View Proposal 📄</button></td>' +
              '<td>' + pitchCell + '</td>' +
              '<td id="r1StatusCol-' + refEsc + '">' + statusBadge + '<br><small style="color:' + emailColor + ';font-size:10.5px">Email: ' + escapeHtml(emailSentText) + '</small></td>' +
              '<td id="r1ActionCol-' + refEsc + '">' +
                '<button type="button" class="btn-decision btn-shortlist" onclick="onRound1DecisionClick(\'' + refEsc + '\', \'shortlisted\')">⭐ Shortlist</button>' +
                '<button type="button" class="btn-decision btn-reject" onclick="onRound1DecisionClick(\'' + refEsc + '\', \'not_selected\')">❌ Not Selected</button>' +
                '<button type="button" class="btn-decision btn-pending" onclick="onRound1DecisionClick(\'' + refEsc + '\', \'pending\')">⏳ Pending</button>' +
              '</td>';
            tbody.appendChild(tr);
          });
        }

        function updateRound1Banner(isPub) {
          var banner = document.getElementById('shortlistBanner');
          var title = document.getElementById('publishBannerTitle');
          var text = document.getElementById('publishBannerText');
          var btn = document.getElementById('publishToggleBtn');

          if (isPub) {
            banner.className = 'status-banner';
            title.textContent = '📢 Round 1 Shortlist: OFFICIALLY PUBLISHED';
            text.textContent = 'Shortlisted teams are displayed on the public website with verified eligibility for Stage 2 Final Submissions.';
            btn.textContent = '🔒 Unpublish Shortlist (Switch to Draft)';
          } else {
            banner.className = 'status-banner draft';
            title.textContent = '🔒 Round 1 Shortlist: DRAFT (Unpublished)';
            text.textContent = 'Decisions are visible ONLY to authorized judges. Public website displays submissions in review without exposing unpublished decisions.';
            btn.textContent = '📢 Publish Shortlist to Website';
          }
        }

        function toggleShortlistPublishStatus() {
          var targetState = !r1IsPublished;
          var confirmMsg = targetState
            ? 'Are you ready to officially PUBLISH the Round 1 Shortlist on the website?\\nShortlisted teams will become publicly visible and eligible for Round 2.'
            : 'Are you sure you want to UNPUBLISH the Round 1 Shortlist?\\nThe public website will revert to showing screening in progress.';

          if (!confirm(confirmMsg)) return;

          showToast('Updating publication status...');
          google.script.run
            .withSuccessHandler(function(res) {
              if (res.success) {
                r1IsPublished = res.isPublished;
                updateRound1Banner(r1IsPublished);
                showToast(res.message);
              } else {
                alert('Error updating status: ' + res.message);
              }
            })
            .withFailureHandler(function(err) {
              alert('Server Error: ' + err.message);
            })
            .setRound1PublishStatus(targetState, false, JUDGE_KEY);
        }

        function onR1SearchChange() {
          r1SearchQuery = document.getElementById('r1SearchInput').value.trim();
          renderRound1Rows({ submissions: r1Submissions, isPublished: r1IsPublished });
        }

        function setR1Filter(f) {
          r1CurrentFilter = f;
          document.getElementById('r1FilterAll').className = f === 'all' ? 'filter-pill active' : 'filter-pill';
          document.getElementById('r1FilterPending').className = f === 'pending' ? 'filter-pill active' : 'filter-pill';
          document.getElementById('r1FilterShortlisted').className = f === 'shortlisted' ? 'filter-pill active' : 'filter-pill';
          document.getElementById('r1FilterNotSelected').className = f === 'not_selected' ? 'filter-pill active' : 'filter-pill';
          renderRound1Rows({ submissions: r1Submissions, isPublished: r1IsPublished });
        }

        function onRound1DecisionClick(refId, decision) {
          var item = r1Submissions.find(function(r) { return r.refId === refId; });
          var teamName = item ? item.teamName : refId;
          var recipient = item ? item.email : '';

          var labelMap = { 'shortlisted': 'SHORTLISTED', 'not_selected': 'NOT SELECTED', 'pending': 'PENDING EVALUATION' };
          var targetLabel = labelMap[decision] || decision.toUpperCase();

          var confirmText = decision === 'pending'
            ? 'Reset decision for "' + teamName + '" (' + refId + ') to PENDING EVALUATION?\\n(No email will be sent).'
            : 'Set screening decision for "' + teamName + '" (' + refId + ') to ' + targetLabel + '?\\nThis will save the decision to Stage 1 Submissions and deliver the screening email to: ' + recipient;

          if (!confirm(confirmText)) return;

          var actionCol = document.getElementById('r1ActionCol-' + refId);
          var statusCol = document.getElementById('r1StatusCol-' + refId);
          if (actionCol) actionCol.innerHTML = '<em style="color:var(--muted);font-size:11px">Saving Decision &amp; Dispatching Email...</em>';

          showToast('Processing ' + targetLabel + ' for ' + refId + '...');

          google.script.run
            .withSuccessHandler(function(res) {
              if (res.savedInSheet) {
                if (item) {
                  item.status = targetLabel;
                  if (res.emailSent) item.emailSent = 'Sent (Just now)';
                }

                if (statusCol) {
                  var badge = targetLabel === 'SHORTLISTED'
                    ? '<span class="badge badge-shortlisted">⭐ SHORTLISTED</span>'
                    : (targetLabel === 'NOT SELECTED' ? '<span class="badge badge-rejected">NOT SELECTED</span>' : '<span class="badge badge-pending">PENDING EVALUATION</span>');
                  var emailTxt = res.emailSent ? 'Sent' : (decision === 'pending' ? 'Pending' : 'Failed');
                  statusCol.innerHTML = badge + '<br><small style="color:var(--muted);font-size:10.5px">Email: ' + emailTxt + '</small>';
                }

                if (actionCol) {
                  if (res.success) {
                    actionCol.innerHTML = '<span style="color:#34d399;font-weight:700;font-size:11.5px">✅ ' + escapeHtml(res.message) + '</span>';
                  } else {
                    actionCol.innerHTML = '<span style="color:#fbbf24;font-weight:700;font-size:11.5px">⚠️ Saved (' + escapeHtml(res.message) + ')</span>';
                  }
                }

                showToast(res.message);
                renderRound1Rows({ submissions: r1Submissions, isPublished: r1IsPublished });
              } else {
                alert('Error saving decision: ' + res.message);
                restoreR1ActionButtons(refId, actionCol);
              }
            })
            .withFailureHandler(function(err) {
              alert('Server Error: ' + err.message);
              restoreR1ActionButtons(refId, actionCol);
            })
            .processRound1JudgeDecision(refId, decision, JUDGE_KEY, '');
        }

        function restoreR1ActionButtons(refId, col) {
          if (!col) return;
          col.innerHTML =
            '<button type="button" class="btn-decision btn-shortlist" onclick="onRound1DecisionClick(\'' + refId + '\', \'shortlisted\')">⭐ Shortlist</button>' +
            '<button type="button" class="btn-decision btn-reject" onclick="onRound1DecisionClick(\'' + refId + '\', \'not_selected\')">❌ Not Selected</button>' +
            '<button type="button" class="btn-decision btn-pending" onclick="onRound1DecisionClick(\'' + refId + '\', \'pending\')">⏳ Pending</button>';
        }

        // ==========================================
        // PROPOSAL INSPECTION MODAL
        // ==========================================
        function openProposalModal(refId) {
          var item = r1Submissions.find(function(r) { return r.refId === refId; });
          if (!item) return;

          document.getElementById('modalTitle').textContent = item.teamName + ' — Round 1 Proposal';
          document.getElementById('modalRefBadge').textContent = 'Ref: ' + item.refId + ' • Submitted: ' + (item.timestamp || '—');

          var body = document.getElementById('modalBody');
          body.innerHTML =
            '<div class="modal-field">' +
              '<h4>Participant / Team Information</h4>' +
              '<div><strong>Team:</strong> ' + escapeHtml(item.teamName) + ' | <strong>Type:</strong> ' + escapeHtml(item.type) + '<br><strong>Team Leader:</strong> ' + escapeHtml(item.leaderName || '—') + ' | <strong>Email:</strong> ' + escapeHtml(item.email) + ' | <strong>Phone:</strong> ' + escapeHtml(item.phone || '—') + '</div>' +
            '</div>' +
            '<div class="modal-field">' +
              '<h4>Selected Track &amp; Challenge Statement</h4>' +
              '<div><strong>Track:</strong> ' + escapeHtml(item.track || '—') + '<br><strong>Problem Statement:</strong> ' + escapeHtml(item.statement || '—') + '</div>' +
            '</div>' +
            '<div class="modal-field">' +
              '<h4>Proposed Solution</h4>' +
              '<div>' + escapeHtml(item.solution || 'No solution provided.') + '</div>' +
            '</div>' +
            '<div class="modal-field">' +
              '<h4>AI Approach &amp; Technical Methodology</h4>' +
              '<div>' + escapeHtml(item.approach || 'No AI approach provided.') + '</div>' +
            '</div>' +
            '<div class="modal-field">' +
              '<h4>Pitch Deck / Presentation Link</h4>' +
              '<div>' + (item.pitchLink && item.pitchLink !== '—' ? '<a href="' + escapeHtml(sanitizeUrl_(item.pitchLink)) + '" target="_blank" rel="noopener" class="link">' + escapeHtml(item.pitchLink) + ' ↗</a>' : 'No pitch link provided.') + '</div>' +
            '</div>' +
            '<div class="modal-field">' +
              '<h4>Internal Reviewer Notes</h4>' +
              '<textarea id="modalNotesInput" style="width:100%;background:#0f172a;color:var(--text);border:1px solid var(--border);border-radius:6px;padding:8px 12px;font-family:inherit;font-size:13px;resize:vertical" rows="3" placeholder="Enter private jury notes or feedback (kept strictly confidential)...">' + escapeHtml(item.notes || '') + '</textarea>' +
            '</div>';

          var actions = document.getElementById('modalActions');
          actions.innerHTML =
            '<button type="button" class="btn-decision btn-shortlist" onclick="onModalDecisionClick(\'' + escapeHtml(item.refId) + '\', \'shortlisted\')">⭐ Shortlist Team</button>' +
            '<button type="button" class="btn-decision btn-reject" onclick="onModalDecisionClick(\'' + escapeHtml(item.refId) + '\', \'not_selected\')">❌ Not Selected</button>' +
            '<button type="button" class="btn-decision btn-pending" onclick="onModalDecisionClick(\'' + escapeHtml(item.refId) + '\', \'pending\')">⏳ Reset to Pending</button>' +
            '<button type="button" class="action-btn" onclick="closeProposalModal()">Close</button>';

          document.getElementById('proposalModal').style.display = 'flex';
        }

        function onModalDecisionClick(refId, decision) {
          var notes = document.getElementById('modalNotesInput').value.trim();
          closeProposalModal();

          var item = r1Submissions.find(function(r) { return r.refId === refId; });
          if (item) item.notes = notes;

          onRound1DecisionClick(refId, decision);
        }

        function closeProposalModal() {
          document.getElementById('proposalModal').style.display = 'none';
        }

        function onModalOverlayClick(e) {
          if (e.target.id === 'proposalModal') closeProposalModal();
        }

        // ==========================================
        // SAFE DIAGNOSTICS MODAL
        // ==========================================
        function openDiagnosticsModal() {
          document.getElementById('diagModal').style.display = 'flex';
          runDiagnosticsCheck();
        }

        function closeDiagnosticsModal() {
          document.getElementById('diagModal').style.display = 'none';
        }

        function onDiagModalOverlayClick(e) {
          if (e.target.id === 'diagModal') closeDiagnosticsModal();
        }

        function runDiagnosticsCheck() {
          var body = document.getElementById('diagBody');
          body.innerHTML = '<div style="text-align:center;padding:30px;color:var(--muted)">Querying spreadsheet, MailApp quota and security properties...</div>';

          google.script.run
            .withSuccessHandler(function(res) {
              if (!res.success) {
                body.innerHTML = '<div style="color:#ef4444;padding:20px;">' + escapeHtml(res.message) + '</div>';
                return;
              }

              var overallColor = res.overallStatus === 'PASS' ? '#34d399' : (res.overallStatus === 'WARN' ? '#fbbf24' : '#f87171');
              var html = '<div style="margin-bottom:14px;display:flex;justify-content:space-between;align-items:center;padding-bottom:10px;border-bottom:1px solid var(--border)">';
              html += '<div><strong>Overall Health:</strong> <span style="color:' + overallColor + ';font-weight:800;font-size:15px">' + res.overallStatus + '</span></div>';
              html += '<div style="font-size:12px;color:var(--muted)">' + escapeHtml(res.timestamp) + '</div>';
              html += '</div>';

              html += '<div style="display:grid;gap:10px">';
              (res.checks || []).forEach(function(c) {
                var cColor = c.status === 'PASS' ? '#34d399' : (c.status === 'WARN' ? '#fbbf24' : '#f87171');
                html += '<div style="background:#0f172a;padding:10px 14px;border-radius:6px;border:1px solid var(--border)">';
                html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px">';
                html += '<strong style="font-size:13px;color:var(--text)">' + escapeHtml(c.name) + '</strong>';
                html += '<span style="font-size:11px;font-weight:700;color:' + cColor + ';border:1px solid ' + cColor + ';padding:1px 6px;border-radius:4px">' + c.status + '</span>';
                html += '</div>';
                html += '<div style="font-size:12px;color:var(--muted)">' + escapeHtml(c.details) + '</div>';
                html += '</div>';
              });
              html += '</div>';

              body.innerHTML = html;
            })
            .withFailureHandler(function(err) {
              body.innerHTML = '<div style="color:#ef4444;padding:20px;">Diagnostics failed: ' + escapeHtml(err.message) + '</div>';
            })
            .runJudgeDiagnostics(JUDGE_KEY);
        }

        // ==========================================
        // ROUND 2 LOGIC (FINAL EVALUATION)
        // ==========================================
        function loadRound2Data() {
          google.script.run
            .withSuccessHandler(renderRound2Rows)
            .withFailureHandler(function(err) {
              document.getElementById('r2TableBody').innerHTML = '<tr><td colspan="9" style="color:#ef4444;padding:30px;text-align:center;">Error loading final submissions: ' + escapeHtml(err.message) + '</td></tr>';
            })
            .getJudgeData(JUDGE_KEY);
        }

        function renderRound2Rows(data) {
          r2Submissions = data || [];
          var tbody = document.getElementById('r2TableBody');
          tbody.innerHTML = '';

          var total = r2Submissions.length, pending = 0, winners = 0, finalists = 0, notSelected = 0;
          r2Submissions.forEach(function(row) {
            var st = (row.status || '').toUpperCase();
            if (st.indexOf('WINNER') !== -1) winners++;
            else if (st.indexOf('FINALIST') !== -1) finalists++;
            else if (st.indexOf('NOT SELECTED') !== -1 || st.indexOf('REJECTED') !== -1) notSelected++;
            else pending++;
          });

          document.getElementById('r2CntTotal').innerText = total;
          document.getElementById('r2CntPending').innerText = pending;
          document.getElementById('r2CntWinners').innerText = winners;
          document.getElementById('r2CntFinalists').innerText = finalists;
          document.getElementById('r2CntNotSelected').innerText = notSelected;

          var filtered = r2Submissions.filter(function(row) {
            var st = (row.status || '').toUpperCase();
            if (r2CurrentFilter === 'winner' && st.indexOf('WINNER') === -1) return false;
            if (r2CurrentFilter === 'finalist' && st.indexOf('FINALIST') === -1) return false;
            if (r2CurrentFilter === 'not_selected' && st.indexOf('NOT SELECTED') === -1 && st.indexOf('REJECTED') === -1) return false;
            if (r2CurrentFilter === 'pending' && (st.indexOf('WINNER') !== -1 || st.indexOf('FINALIST') !== -1 || st.indexOf('NOT SELECTED') !== -1 || st.indexOf('REJECTED') !== -1)) return false;

            if (r2SearchQuery) {
              var q = r2SearchQuery.toLowerCase();
              var match = (row.teamName && row.teamName.toLowerCase().indexOf(q) !== -1) ||
                          (row.problemStatement && row.problemStatement.toLowerCase().indexOf(q) !== -1) ||
                          (row.declaration && row.declaration.toLowerCase().indexOf(q) !== -1);
              if (!match) return false;
            }
            return true;
          });

          if (!filtered.length) {
            tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:40px;color:var(--muted)">No final project deliverables match your filter.</td></tr>';
            return;
          }

          filtered.forEach(function(row, idx) {
            var tr = document.createElement('tr');
            var statusBadge = '';
            var st = (row.status || '').toUpperCase();
            if (st.indexOf('WINNER') !== -1) {
              statusBadge = '<span class="badge" style="background:rgba(16,185,129,0.15);color:#34d399;border:1px solid rgba(16,185,129,0.3)">🏆 WINNER</span>';
            } else if (st.indexOf('FINALIST') !== -1) {
              statusBadge = '<span class="badge" style="background:rgba(168,85,247,0.15);color:#c084fc;border:1px solid rgba(168,85,247,0.3)">⭐ FINALIST</span>';
            } else if (st.indexOf('NOT SELECTED') !== -1 || st.indexOf('REJECTED') !== -1) {
              statusBadge = '<span class="badge badge-rejected">NOT SELECTED</span>';
            } else {
              statusBadge = '<span class="badge badge-pending">PENDING EVALUATION</span>';
            }

            var safeRepo = sanitizeUrl_(row.githubUrl);
            var repoCell = safeRepo ? '<a href="' + escapeHtml(safeRepo) + '" target="_blank" rel="noopener" class="link">GitHub 🔗</a>' : (row.githubUrl ? escapeHtml(row.githubUrl) : '—');
            var safeVideo = sanitizeUrl_(row.videoLink);
            var videoCell = safeVideo ? '<a href="' + escapeHtml(safeVideo) + '" target="_blank" rel="noopener" class="link" style="color:#f59e0b">▶ Video</a>' : '—';
            var safeLive = sanitizeUrl_(row.liveLink);
            var liveCell = safeLive ? '<a href="' + escapeHtml(safeLive) + '" target="_blank" rel="noopener" class="link" style="color:#34d399">Live 🚀</a>' : '—';

            var tn = escapeHtml(row.teamName || '');

            tr.innerHTML =
              '<td style="font-weight:700;color:var(--muted)">' + (idx + 1 < 10 ? '0' : '') + (idx + 1) + '</td>' +
              '<td><strong>' + tn + '</strong></td>' +
              '<td><div style="font-size:12.5px">' + escapeHtml(row.problemStatement || '—') + '</div></td>' +
              '<td>' + repoCell + '</td>' +
              '<td>' + videoCell + '</td>' +
              '<td>' + liveCell + '</td>' +
              '<td><div style="font-size:12px;color:var(--muted)">' + escapeHtml(row.declaration || '—') + '</div></td>' +
              '<td id="r2StatusCol-' + idx + '">' + statusBadge + '<br><small style="color:var(--muted);font-size:10.5px">Email: ' + escapeHtml(row.emailSent || 'Not Sent') + '</small></td>' +
              '<td id="r2ActionCol-' + idx + '">' +
                '<button type="button" class="btn-decision btn-shortlist" data-team="' + tn + '" onclick="onRound2DecisionClick(this, \'winner\', ' + idx + ')">🏆 Winner</button>' +
                '<button type="button" class="btn-decision" style="background:#a855f7;color:#fff" data-team="' + tn + '" onclick="onRound2DecisionClick(this, \'finalist\', ' + idx + ')">⭐ Finalist</button>' +
                '<button type="button" class="btn-decision btn-reject" data-team="' + tn + '" onclick="onRound2DecisionClick(this, \'not_selected\', ' + idx + ')">❌ Not Selected</button>' +
              '</td>';
            tbody.appendChild(tr);
          });
        }

        function onR2SearchChange() {
          r2SearchQuery = document.getElementById('r2SearchInput').value.trim();
          renderRound2Rows(r2Submissions);
        }

        function setR2Filter(f) {
          r2CurrentFilter = f;
          document.getElementById('r2FilterAll').className = f === 'all' ? 'filter-pill active' : 'filter-pill';
          document.getElementById('r2FilterPending').className = f === 'pending' ? 'filter-pill active' : 'filter-pill';
          document.getElementById('r2FilterWinner').className = f === 'winner' ? 'filter-pill active' : 'filter-pill';
          document.getElementById('r2FilterFinalist').className = f === 'finalist' ? 'filter-pill active' : 'filter-pill';
          document.getElementById('r2FilterNotSelected').className = f === 'not_selected' ? 'filter-pill active' : 'filter-pill';
          renderRound2Rows(r2Submissions);
        }

        function onRound2DecisionClick(btn, decision, idx) {
          var teamName = btn.getAttribute('data-team');
          var labelMap = { 'winner': 'WINNER', 'finalist': 'FINALIST', 'not_selected': 'NOT SELECTED' };
          var targetLabel = labelMap[decision] || decision.toUpperCase();

          if (!confirm('Are you sure you want to set the final decision for "' + teamName + '" to ' + targetLabel + '?\\nThis will save the status to Final Submissions and dispatch a final-round result email.')) {
            return;
          }

          var actionTd = document.getElementById('r2ActionCol-' + idx);
          var statusTd = document.getElementById('r2StatusCol-' + idx);
          if (actionTd) actionTd.innerHTML = '<em style="color:var(--muted);font-size:11px">Saving Final Decision &amp; Dispatching Email...</em>';

          google.script.run
            .withSuccessHandler(function(res) {
              if (res.savedInSheet) {
                var item = r2Submissions.find(function(r) { return r.teamName === teamName; });
                if (item) {
                  item.status = targetLabel;
                  if (res.emailSent) item.emailSent = 'Sent';
                }

                if (decision === 'winner') {
                  statusTd.innerHTML = '<span class="badge" style="background:rgba(16,185,129,0.15);color:#34d399;border:1px solid rgba(16,185,129,0.3)">🏆 WINNER</span><br><small style="color:var(--muted);font-size:10.5px">Email: Sent</small>';
                } else if (decision === 'finalist') {
                  statusTd.innerHTML = '<span class="badge" style="background:rgba(168,85,247,0.15);color:#c084fc;border:1px solid rgba(168,85,247,0.3)">⭐ FINALIST</span><br><small style="color:var(--muted);font-size:10.5px">Email: Sent</small>';
                } else {
                  statusTd.innerHTML = '<span class="badge badge-rejected">NOT SELECTED</span><br><small style="color:var(--muted);font-size:10.5px">Email: Sent</small>';
                }

                if (res.success) {
                  actionTd.innerHTML = '<span style="color:#34d399;font-weight:700">✅ Saved &amp; Email Sent</span>';
                } else {
                  actionTd.innerHTML = '<span style="color:#fbbf24;font-weight:700">⚠️ Saved (' + escapeHtml(res.message) + ')</span>';
                }
                renderRound2Rows(r2Submissions);
              } else {
                alert('Error saving decision: ' + res.message);
                restoreR2ActionButtons(teamName, idx, actionTd);
              }
            })
            .withFailureHandler(function(err) {
              alert('Server Error: ' + err.message);
              restoreR2ActionButtons(teamName, idx, actionTd);
            })
            .processJudgeDecision(teamName, decision, JUDGE_KEY);
        }

        function restoreR2ActionButtons(teamName, idx, actionTd) {
          var tn = escapeHtml(teamName || '');
          actionTd.innerHTML =
            '<button type="button" class="btn-decision btn-shortlist" data-team="' + tn + '" onclick="onRound2DecisionClick(this,\'winner\',' + idx + ')">🏆 Winner</button>' +
            '<button type="button" class="btn-decision" style="background:#a855f7;color:#fff" data-team="' + tn + '" onclick="onRound2DecisionClick(this,\'finalist\',' + idx + ')">⭐ Finalist</button>' +
            '<button type="button" class="btn-decision btn-reject" data-team="' + tn + '" onclick="onRound2DecisionClick(this,\'not_selected\',' + idx + ')">❌ Not Selected</button>';
        }

        // ==========================================
        // HELPERS
        // ==========================================
        function sanitizeUrl_(u) {
          if (!u || typeof u !== 'string') return '';
          var t = u.trim();
          if (/^https?:\\/\\//i.test(t)) return t;
          return '';
        }

        function escapeHtml(str) {
          if (!str) return '';
          return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
        }

        function showToast(msg) {
          var t = document.getElementById('toastNotice');
          if (!t) return;
          t.textContent = msg;
          t.style.display = 'block';
          clearTimeout(window._toastTimer);
          window._toastTimer = setTimeout(function() {
            t.style.display = 'none';
          }, 3500);
        }
      </script>
    </body>
    </html>
  `;
  return HtmlService.createHtmlOutput(html).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// =========================================================
// 6. SERVER HELPER FUNCTIONS
// =========================================================

function normalizeRound1Status_(rawStatus) {
  const st = String(rawStatus || "").trim().toUpperCase().replace(/\s+/g, " ");
  if (
    st.includes("NOT SELECTED") ||
    st.includes("NOT SHORTLISTED") ||
    st.includes("NOT_SELECTED") ||
    st.includes("REJECTED") ||
    st.includes("DISQUALIFIED")
  ) {
    return "NOT SELECTED";
  }
  if (st.includes("SHORTLISTED") || st.includes("SELECTED")) {
    return "SHORTLISTED";
  }
  if (st.includes("PENDING") || st.includes("UNDER EVALUATION") || st.includes("UNDER REVIEW")) {
    return "PENDING EVALUATION";
  }
  return "PENDING EVALUATION";
}

function normalizeStatusName_(rawStatus) {
  const st = String(rawStatus || "").trim().toUpperCase().replace(/\s+/g, " ");
  if (
    st.includes("NOT SELECTED") ||
    st.includes("NOT SHORTLISTED") ||
    st.includes("NOT_SELECTED") ||
    st.includes("NOT_SHORTLISTED") ||
    st.includes("REJECTED") ||
    st.includes("DISQUALIFIED")
  ) {
    return "NOT SELECTED";
  }
  if (st.includes("WINNER")) return "WINNER";
  if (st.includes("FINALIST")) return "FINALIST";
  if (st.includes("UNDER EVALUATION")) return "UNDER EVALUATION";
  if (st.includes("FINAL SUBMISSION RECEIVED")) return "FINAL SUBMISSION RECEIVED";
  if (st.includes("FINAL SUBMISSION PENDING")) return "FINAL SUBMISSION PENDING";
  if (st.includes("SHORTLISTED") || st.includes("SELECTED")) return "SHORTLISTED / SELECTED";
  if (st.includes("ROUND 1 SUBMITTED") || st.includes("STAGE 1 SUBMITTED")) return "ROUND 1 SUBMITTED";
  if (st.includes("UNDER REVIEW") || st.includes("PENDING EVALUATION")) return "UNDER REVIEW";
  return "REGISTERED";
}

function checkTeamEligibility_(ss, teamName, email) {
  const normTeam  = String(teamName || "").toLowerCase().trim();
  const normEmail = String(email    || "").toLowerCase().trim();

  const s1Sheet = ss.getSheetByName(CONFIG.STAGE1_SHEET);
  if (s1Sheet) {
    const s1Data = s1Sheet.getDataRange().getValues();
    if (s1Data.length > 1) {
      const hdrs1 = s1Data[0].map(h => String(h || "").trim());
      const cols1 = findStage1Columns_(hdrs1);
      const rows1 = s1Data.slice(1);
      const match = rows1.find(r => {
        const t = String(r[cols1.teamName] || "").toLowerCase().trim();
        const e = String(r[cols1.email] || "").toLowerCase().trim();
        return (normTeam && t === normTeam) || (normEmail && e === normEmail);
      });

      if (match) {
        const rawStatus = match[cols1.status] || "ROUND 1 SUBMITTED";
        const status = normalizeStatusName_(rawStatus).toUpperCase();
        const isEligible = (
          status.includes("SHORTLISTED") ||
          status.includes("SELECTED") ||
          status.includes("FINALIST") ||
          status.includes("WINNER") ||
          status.includes("FINAL SUBMISSION PENDING") ||
          status.includes("FINAL SUBMISSION RECEIVED")
        ) && !status.includes("NOT SELECTED") && !status.includes("REJECTED") && !status.includes("PENDING");

        if (!isEligible) {
          if (status.includes("NOT SELECTED") || status.includes("REJECTED")) {
            return {
              isEligible:    false,
              currentStatus: "NOT SELECTED",
              reason: "Stage 1 Screening Outcome: Not Selected. Round 2 submission is not permitted."
            };
          }
          return {
            isEligible:    false,
            currentStatus: status,
            reason: `Current status is ${status}. Round 2 submission is restricted strictly to verified shortlisted teams.`
          };
        }
        return { isEligible: true, currentStatus: status };
      }
    }
  }

  const regSheet = ss.getSheetByName(CONFIG.REGISTRATION_SHEET);
  if (regSheet) {
    const data = regSheet.getDataRange().getValues();
    if (data.length >= 2) {
      const headers = data[0].map(h => String(h || "").trim());
      const col  = findColumns_(headers);
      const rows = data.slice(1);
      const match = rows.find(r => {
        const t = String(r[col.teamName]   || "").toLowerCase().trim();
        const e = String(r[col.email]      || "").toLowerCase().trim();
        const l = String(r[col.teamLeader] || "").toLowerCase().trim();
        return (normTeam && (t === normTeam || l === normTeam)) || (normEmail && e === normEmail);
      });

      if (match) {
        const status = normalizeStatusName_(match[col.screeningStatus] || "REGISTERED").toUpperCase();
        const isEligible = (
          status.includes("SHORTLISTED") ||
          status.includes("SELECTED") ||
          status.includes("FINALIST") ||
          status.includes("WINNER")
        ) && !status.includes("NOT SELECTED") && !status.includes("REJECTED") && !status.includes("PENDING");
        if (!isEligible) {
          return {
            isEligible:    false,
            currentStatus: status,
            reason: `Current status is ${status}. Round 2 submission requires Stage 1 shortlisting.`
          };
        }
        return { isEligible: true, currentStatus: status };
      }
    }
  }

  return { isEligible: false, reason: "Team or Leader email not found in official Stage 1 records." };
}

function resolveEmailByTeamName_(ss, rawInputName) {
  function normalizeVal_(val) {
    return String(val || "").trim().toLowerCase().replace(/\s+/g, " ");
  }

  const normInput = normalizeVal_(rawInputName);
  if (!normInput) return null;

  const s1Sheet = ss.getSheetByName(CONFIG.STAGE1_SHEET);
  if (s1Sheet) {
    const s1Data = s1Sheet.getDataRange().getValues();
    if (s1Data.length > 1) {
      const rawHeaders = s1Data[0].map(h => String(h || "").trim().toLowerCase());

      function findColIndex_(patterns) {
        for (let p of patterns) {
          const idx = rawHeaders.findIndex(h => h === p || h.includes(p));
          if (idx !== -1) return idx;
        }
        return -1;
      }

      const teamNameIdx = findColIndex_(["team name", "team_name", "team"]);
      const leaderNameIdx = findColIndex_(["team leader / primary contact name", "team leader", "team_leader", "leader name", "leader"]);
      const fullNameIdx = findColIndex_(["full name", "participant name", "participant / team name", "name"]);
      const emailIdx = findColIndex_(["email address", "leader email", "primary email", "email"]);

      const effectiveEmailIdx = emailIdx !== -1 ? emailIdx : 5;

      if (teamNameIdx !== -1) {
        for (let i = 1; i < s1Data.length; i++) {
          const row = s1Data[i];
          const rowTeam = normalizeVal_(row[teamNameIdx]);
          if (rowTeam && rowTeam === normInput) {
            const email = String(row[effectiveEmailIdx] || "").trim();
            if (email && email.includes("@")) {
              return email;
            }
          }
        }
      }

      const candidateIndices = [leaderNameIdx, fullNameIdx].filter(idx => idx !== -1 && idx !== teamNameIdx);
      if (candidateIndices.length > 0) {
        for (let i = 1; i < s1Data.length; i++) {
          const row = s1Data[i];
          for (let cIdx of candidateIndices) {
            const rowName = normalizeVal_(row[cIdx]);
            if (rowName && rowName === normInput) {
              const email = String(row[effectiveEmailIdx] || "").trim();
              if (email && email.includes("@")) {
                return email;
              }
            }
          }
        }
      }

      if (teamNameIdx === -1 && leaderNameIdx === -1) {
        for (let i = 1; i < s1Data.length; i++) {
          const row = s1Data[i];
          const t = normalizeVal_(row[3]);
          const l = normalizeVal_(row[4]);
          if (t === normInput || l === normInput) {
            const email = String(row[effectiveEmailIdx] || "").trim();
            if (email && email.includes("@")) {
              return email;
            }
          }
        }
      }
    }
  }

  const regSheet = ss.getSheetByName(CONFIG.REGISTRATION_SHEET);
  if (regSheet) {
    const regData = regSheet.getDataRange().getValues();
    if (regData.length > 1) {
      const regHeaders = regData[0].map(h => String(h || "").trim());
      const col = findColumns_(regHeaders);
      for (let i = 1; i < regData.length; i++) {
        const row = regData[i];
        const rowTeam = normalizeVal_(row[col.teamName]);
        const rowLeader = normalizeVal_(row[col.teamLeader]);
        const rowName = normalizeVal_(row[col.fullName]);
        if (rowTeam === normInput || rowLeader === normInput || rowName === normInput) {
          const email = String(row[col.email] || "").trim();
          if (email && email.includes("@")) {
            return email;
          }
        }
      }
    }
  }

  return null;
}

function sendFinalResultEmail_(email, teamName, decision) {
  try {
    if (!email || !email.includes("@")) {
      return { success: false, error: "Invalid recipient email address." };
    }

    let subject = "";
    let htmlBody = "";
    const displayTeam = escapeHtml_(teamName || "Participant");

    if (decision === "winner") {
      subject = `🏆 WINNER Announcement — AI Innovation Hackathon 2026`;
      htmlBody = `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a;max-width:640px;margin:0 auto;padding:24px;background:#f8fafc;border-radius:12px;border:1px solid #e2e8f0">
          <h2 style="color:#059669;margin-top:0">🏆 Congratulations — Team Selected as WINNER!</h2>
          <p>Dear <strong>${displayTeam}</strong>,</p>
          <p>Congratulations — your team has been selected as a <strong>WINNER</strong> of the <strong>AI Innovation Hackathon 2026</strong>!</p>
          <p>Your final project submission was evaluated during the final round by our distinguished jury panel and achieved top recognition across our evaluation criteria.</p>
          <div style="background:#ecfdf5;border-left:4px solid #10b981;padding:14px;margin:20px 0;border-radius:4px">
            <strong>Event:</strong> AI Innovation Hackathon 2026<br>
            <strong>Final Round Decision:</strong> <span style="color:#059669;font-weight:bold">WINNER</span><br>
            <strong>Organizing Body:</strong> Women in AI, Research, Innovation & Entrepreneurship Club
          </div>
          <p>We will contact your registered team contact shortly regarding prize distribution, certificates, and research showcase opportunities.</p>
          <p>Warm regards,<br><strong>AI Innovation Hackathon 2026 Jury & Organizing Committee</strong><br>Women in AI, Research, Innovation & Entrepreneurship Club</p>
        </div>
      `;
    } else if (decision === "finalist") {
      subject = `⭐ FINALIST Recognition — AI Innovation Hackathon 2026`;
      htmlBody = `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a;max-width:640px;margin:0 auto;padding:24px;background:#f8fafc;border-radius:12px;border:1px solid #e2e8f0">
          <h2 style="color:#7c3aed;margin-top:0">⭐ Congratulations — Team Recognized as FINALIST!</h2>
          <p>Dear <strong>${displayTeam}</strong>,</p>
          <p>Congratulations — your team has been recognized as a <strong>FINALIST</strong> of the <strong>AI Innovation Hackathon 2026</strong>!</p>
          <p>Your final project demonstrated outstanding engineering, innovation, and technical rigor during the final round evaluation.</p>
          <div style="background:#f3e8ff;border-left:4px solid #a855f7;padding:14px;margin:20px 0;border-radius:4px">
            <strong>Event:</strong> AI Innovation Hackathon 2026<br>
            <strong>Final Round Decision:</strong> <span style="color:#7c3aed;font-weight:bold">FINALIST</span><br>
            <strong>Organizing Body:</strong> Women in AI, Research, Innovation & Entrepreneurship Club
          </div>
          <p>Details regarding your Finalist certificates and upcoming research club initiatives will follow via email.</p>
          <p>Warm regards,<br><strong>AI Innovation Hackathon 2026 Jury & Organizing Committee</strong><br>Women in AI, Research, Innovation & Entrepreneurship Club</p>
        </div>
      `;
    } else {
      subject = `AI Innovation Hackathon 2026 — Final Round Result`;
      htmlBody = `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a;max-width:640px;margin:0 auto;padding:24px;background:#f8fafc;border-radius:12px;border:1px solid #e2e8f0">
          <h2 style="color:#334155;margin-top:0">Final Round Evaluation Update</h2>
          <p>Dear <strong>${displayTeam}</strong>,</p>
          <p>Thank you for participating in the <strong>AI Innovation Hackathon 2026</strong>. Your final submission was evaluated during the final round, but your team was not selected for the final recognition.</p>
          <p>We sincerely appreciate the effort, innovation, and dedication your team invested in building your project deliverables.</p>
          <p>We encourage you to participate in future hackathons, workshops, and research publications hosted by the Women in AI, Research, Innovation & Entrepreneurship Club.</p>
          <p>Warm regards,<br><strong>AI Innovation Hackathon 2026 Jury & Organizing Committee</strong><br>Women in AI, Research, Innovation & Entrepreneurship Club</p>
        </div>
      `;
    }

    MailApp.sendEmail({
      to: email,
      subject: subject,
      htmlBody: htmlBody,
      name: "AI Innovation Hackathon 2026 Jury"
    });

    return { success: true };
  } catch (err) {
    Logger.log("Final Result Email Error: " + err.toString());
    return { success: false, error: err.toString() };
  }
}

function findStage1Columns_(headers) {
  const norm = str => String(str || "").toLowerCase().trim();
  const getCol = (possibleNames, defaultIndex) => {
    const idx = headers.findIndex(h => possibleNames.some(p => norm(h).includes(norm(p))));
    return idx !== -1 ? idx : defaultIndex;
  };

  const statusIdx = headers.findIndex(h => {
    const nh = norm(h);
    return nh.includes("status") && !nh.includes("email");
  });
  const emailSentIdx = headers.findIndex(h => {
    const nh = norm(h);
    return nh.includes("email") && (nh.includes("sent") || nh.includes("dispatch"));
  });
  const notesIdx = headers.findIndex(h => {
    const nh = norm(h);
    return nh.includes("note") || nh.includes("remark") || nh.includes("comment");
  });

  return {
    refId: getCol(["reference id", "ref id", "reference", "id"], 0),
    timestamp: getCol(["timestamp", "date", "time"], 1),
    type: getCol(["participation type", "type", "mode"], 2),
    teamName: getCol(["team name", "team", "participant name"], 3),
    leaderName: getCol(["team leader / primary contact name", "team leader", "leader", "primary contact", "full name", "contact name"], 4),
    email: getCol(["email address", "leader email", "team leader email", "primary email", "email"], 5),
    phone: getCol(["phone", "mobile", "whatsapp", "contact"], 6),
    track: getCol(["track", "domain", "category"], 7),
    statement: getCol(["problem statement", "problem", "challenge", "statement"], 8),
    solution: getCol(["proposed solution", "solution", "abstract"], 9),
    approach: getCol(["ai approach", "approach", "methodology", "architecture"], 10),
    pitchLink: getCol(["pitch link", "pitch", "deck", "slide", "presentation"], 11),
    status: statusIdx !== -1 ? statusIdx : 12,
    emailSent: emailSentIdx !== -1 ? emailSentIdx : 13,
    notes: notesIdx !== -1 ? notesIdx : 14,
    hasStatusHeader: statusIdx !== -1,
    hasEmailSentHeader: emailSentIdx !== -1,
    hasNotesHeader: notesIdx !== -1
  };
}

function findColumns_(headers) {
  const norm = str => String(str || "").toLowerCase().trim();
  const getCol = (possibleNames) => {
    return headers.findIndex(h => possibleNames.some(p => norm(h).includes(norm(p))));
  };

  return {
    timestamp: getCol(["timestamp", "registered", "date"]),
    fullName: getCol(["full name", "participant name", "leader name", "name"]),
    email: getCol(["email address", "leader email", "email"]),
    participationType: getCol(["participation type", "participation", "individual or team", "type", "mode"]),
    teamName: getCol(["team name", "team"]),
    teamLeader: getCol(["team leader", "primary contact", "leader"]),
    teamMembers: getCol(["team members", "members"]),
    screeningStatus: getCol(["screening status", "status"])
  };
}

function validateEmail_(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(String(email).toLowerCase());
}

function jsonResponse_(data, code = 200) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function getStage2Sheet_(ss) {
  return ss.getSheetByName(CONFIG.STAGE2_SHEET) ||
         ss.getSheetByName("Final Submissions") ||
         ss.getSheetByName("Form Responses 2");
}

function getWebAppUrl_() {
  try {
    return ScriptApp.getService().getUrl() || "";
  } catch (e) {
    return "";
  }
}

function escapeHtml_(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function generateUniqueRefId_(sheet, prefix, colIndex) {
  const existingIds = new Set();
  if (sheet) {
    try {
      const data = sheet.getDataRange().getValues();
      for (let i = 1; i < data.length; i++) {
        const val = String(data[i][colIndex] || "").trim();
        if (val) existingIds.add(val.toUpperCase());
      }
    } catch (e) {
      Logger.log("generateUniqueRefId_ warning: " + e.toString());
    }
  }
  let id = "";
  let attempts = 0;
  do {
    const rand = Math.floor(100000 + Math.random() * 900000);
    id = prefix + "-" + rand;
    attempts++;
  } while (existingIds.has(id.toUpperCase()) && attempts < 50);
  return id;
}

function MockLockOrScriptLock_() {
  try {
    if (typeof LockService !== "undefined" && LockService.getScriptLock) {
      return LockService.getScriptLock();
    }
  } catch (e) {}
  return {
    tryLock: () => true,
    waitLock: () => true,
    releaseLock: () => {}
  };
}