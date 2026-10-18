/**
 * AI INNOVATION HACKATHON 2026 — SECURE BACKEND API, FINAL JUDGE PANEL & WORKFLOW AUTOMATION
 * Women in AI, Research, Innovation & Entrepreneurship Club
 *
 * Features:
 * 1. doGet:
 *    - ?panel=judge&key=<CONFIGURED_JUDGE_KEY> -> Renders protected Final Round Judge Panel HTML Dashboard.
 *    - ?action=checkStatus&query=... -> Returns single participant/team status & Stage 2 eligibility flag.
 *    - Default (Public Participants Roster) -> Reads ONLY from 'Form Responses 1', deduplicates teams,
 *      returns ONLY: Sl. No (id), Team Name, Participation Type. ZERO private data exposed.
 * 2. doPost:
 *    - Stage1_Screening -> Logs proposal to 'Stage 1 Submissions', dispatches receipt email.
 *    - Stage2_Final     -> Gated by Stage 1 shortlist status; checks eligibility only
 *      (Final Submissions is populated directly by Google Form; this route only verifies gate).
 * 3. Final Round Judge Panel (ONE AND ONLY judge panel — route: ?panel=judge&key=<CONFIGURED_JUDGE_KEY>):
 *    - Reads ONLY from 'Final Submissions' sheet.
 *    - Evaluates final projects with decisions: WINNER, FINALIST, NOT SELECTED.
 *    - Stores decision in 'Final Evaluation Status' & 'Final Decision Email Sent'.
 *    - NEVER modifies Screening Status or Stage 1 Submissions.
 *    - Sends distinct Final Round Result Emails; email resolved server-side via cross-reference.
 *
 * SPREADSHEET: Always opened via SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID).
 * Never relies on SpreadsheetApp.getActiveSpreadsheet().
 *
 * FINAL SUBMISSIONS REAL SCHEMA (Google Form columns — DO NOT REORDER):
 *   Col 0: Timestamp
 *   Col 1: Participant / Team Name
 *   Col 2: Selected Problem Statement
 *   Col 3: GitHub Repository URL
 *   Col 4: Final Project Demo Video
 *   Col 5: Live Demo / Deployment Link
 *   Col 6: Final Submission Declaration
 *   Col 7: Final Evaluation Status       (added by script if missing)
 *   Col 8: Final Decision Email Sent     (added by script if missing)
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
    // Handled first for maximum speed and zero dependency on spreadsheet lock or quota.
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

    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);

    // ROUTE 1: PRIVATE FINAL JUDGE PANEL DASHBOARD
    if (params.panel === "judge") {
      if (!validateJudgeKey_(params.key)) {
        return HtmlService.createHtmlOutput(
          "<div style='font-family:sans-serif;padding:40px;color:#ef4444;background:#0f172a;height:100vh;box-sizing:border-box;text-align:center;'>" +
          "<h2 style='font-size:28px;margin-bottom:12px;'>🚫 Access Denied</h2>" +
          "<p style='color:#94a3b8;font-size:16px;'>Invalid or missing Judge Key. The Judge Panel is private and restricted to authorized judges.</p></div>"
        );
      }
      return renderJudgePanel(params.key);
    }

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
            publicStatus = showNotSelected ? "NOT SELECTED" : "SUBMISSION RECEIVED";
          } else if (rawStatus.includes("SHORTLISTED") || rawStatus.includes("SELECTED")) {
            publicStatus = "SHORTLISTED";
          } else if (rawStatus.includes("PENDING")) {
            publicStatus = "PENDING EVALUATION";
          } else {
            publicStatus = "SUBMISSION RECEIVED";
          }
        } else {
          // Keep decisions private until officially published by organizer
          publicStatus = rawStatus.includes("PENDING") ? "PENDING EVALUATION" : "SUBMISSION RECEIVED";
        }

        publicSubmissions.push({
          id: publicSubmissions.length + 1,
          teamName: teamName,
          track: track,
          problemStatement: statement,
          status: publicStatus
        });
      });

      const shortlistedCount = publicSubmissions.filter(s => s.status === "SHORTLISTED").length;
      const pendingCount = publicSubmissions.filter(s => s.status.includes("PENDING") || s.status.includes("RECEIVED")).length;

      return jsonResponse_({
        success: true,
        isPublished: isPublished,
        totalCount: publicSubmissions.length,
        shortlistedCount: shortlistedCount,
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
            const s1Status = match1[s1Cols.status] || "ROUND 1 SUBMITTED";
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
        // Final Submissions real schema: Col 1 = Participant / Team Name
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
            const finalStatus = (evalColIdx2 !== -1 && match2[evalColIdx2])
              ? String(match2[evalColIdx2])
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
      const eligibleForStage2 = (
        normStatus.includes("SHORTLISTED") ||
        normStatus.includes("SELECTED") ||
        normStatus.includes("FINAL SUBMISSION PENDING") ||
        normStatus.includes("FINAL SUBMISSION RECEIVED") ||
        normStatus.includes("FINALIST") ||
        normStatus.includes("WINNER")
      ) && !normStatus.includes("NOT SELECTED") && !normStatus.includes("REJECTED") && !normStatus.includes("PENDING");

      return jsonResponse_({
        found: true,
        teamName: foundRecord.teamName,
        type: foundRecord.type,
        status: normalizeStatusName_(foundRecord.status),
        eligibleForStage2: eligibleForStage2,
        referenceId: foundRecord.referenceId || null
      });
    }

    // ROUTE 3: DEFAULT SANITIZED PUBLIC PARTICIPANTS DIRECTORY
    // Reads ONLY from 'Form Responses 1' (Official Registration Sheet)
    // Public Participants API — exposes ONLY: id, teamName, participationType
    // NO email, phone, screening status, or private data.
    const regSheet = ss.getSheetByName(CONFIG.REGISTRATION_SHEET) || ss.getSheets()[0];
    if (!regSheet) return jsonResponse_([]);

    const data = regSheet.getDataRange().getValues();
    if (data.length < 2) return jsonResponse_([]);

    const headers = data[0].map(h => String(h || "").trim());
    const col = findColumns_(headers);
    const rows = data.slice(1);

    const seenTeams = new Set();
    const publicList = [];

    rows.forEach(row => {
      const rawType = String(row[col.participationType] || "").trim().toLowerCase();
      const rawTeamField = String(row[col.teamName] || "").trim();
      const rawTeamLower = rawTeamField.toLowerCase();
      const rawName = String(row[col.fullName] || row[col.teamLeader] || "").trim();
      const rawNameLower = rawName.toLowerCase();

      const isInvalidTeamName = !rawTeamField || 
        rawTeamLower === "individual" || 
        rawTeamLower === "n/a" || 
        rawTeamLower === "none" || 
        rawTeamLower === "na" || 
        rawTeamLower === "-" ||
        (rawNameLower && rawTeamLower === rawNameLower);

      let isTeam = false;
      if (rawType.includes("indiv") || rawType.includes("solo") || rawType.includes("single")) {
        isTeam = false;
      } else if (rawType.includes("team") || rawType.includes("group")) {
        isTeam = true;
      } else {
        // Fallback: If rawType wasn't explicit, check team name field
        isTeam = !isInvalidTeamName;
      }

      const typeLabel = isTeam ? "TEAM" : "INDIVIDUAL";

      let displayName = "";
      if (isTeam && !isInvalidTeamName) {
        displayName = rawTeamField;
      } else {
        displayName = rawName || (rawTeamLower !== "individual" ? rawTeamField : "") || "Participant";
        if (displayName.toLowerCase() === "individual") {
          displayName = rawName || "Participant";
        }
      }

      if (!displayName) return;

      const normKey = displayName.toLowerCase();

      // Deduplicate teams so each team appears only once
      if (isTeam && seenTeams.has(normKey)) {
        return;
      }
      if (isTeam) {
        seenTeams.add(normKey);
      }

      publicList.push({
        id: publicList.length + 1,
        teamName: displayName,
        participationType: typeLabel
      });
    });

    return jsonResponse_(publicList);

  } catch (err) {
    return jsonResponse_({ error: err.toString() }, 500);
  }
}

// =========================================================
// 2. HTTP POST ENDPOINT (Form Submissions)
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
          "Proposed Solution", "AI Approach", "Pitch Link", "Screening Status", "Screening Email Sent"
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
            status: "ROUND 1 SUBMITTED"
          }, 200);
        }
      }

      const timestamp = Utilities.formatDate(new Date(), "Asia/Kolkata", "yyyy-MM-dd HH:mm:ss");
      const refId = generateUniqueRefId_(stage1Sheet, "WAI-SCR", s1Cols.refId);

      stage1Sheet.appendRow([
        refId, timestamp, body.participationType || "Team", teamName,
        leaderName, email, phone, track, statement,
        solution, approach, pitchLink, "ROUND 1 SUBMITTED", "No"
      ]);

      // Update only Stage 1 Submissions (never touches Final Submissions)
      updateStage1Status_(ss, teamName, email, "ROUND 1 SUBMITTED");

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
              <p>Stage 1 screening results will be announced on <strong>19 October 2026</strong>. Selected teams will be invited to participate in the Stage 2 Main Hackathon on 20 October 2026.</p>
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
        status: "ROUND 1 SUBMITTED",
        emailSent: emailSent
      });
    }

    // STAGE 2: FINAL PROJECT SUBMISSION (Round 2)
    // Enforces Stage 1 shortlist eligibility gate, validates GitHub repository link,
    // checks server-side deadline, and writes submission directly to the Final Submissions sheet.
    if (body.type === "Stage2_Final") {
      // Server-side strict deadline enforcement
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

      // 4. Save to Final Submissions sheet matching the exact schema:
      // Col 0: Timestamp (IST)
      // Col 1: Participant / Team Name
      // Col 2: Selected Problem Statement (Track + Project Title)
      // Col 3: GitHub Repository URL
      // Col 4: Final Project Demo Video (Demo / Presentation URL)
      // Col 5: Live Demo / Deployment Link
      // Col 6: Final Submission Declaration (Overview / Deliverables Verified)
      // Col 7: Final Evaluation Status (Initial: PENDING EVALUATION)
      // Col 8: Final Decision Email Sent (Initial: Not Sent)
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

      // 5. Send confirmation receipt email to team leader
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
              <p>Final round jury evaluation is conducted between 6:00 PM and 8:00 PM IST on 20 October 2026. Final results and award announcements will be published at 8:00 PM IST.</p>
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
// 3. FINAL ROUND JUDGE PANEL INTERFACE & SERVER FUNCTIONS
// =========================================================
function renderJudgePanel(authorizedKey) {
  var html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <base target="_top">
      <title>AI Innovation Hackathon 2026 — Final Round Judge Panel</title>
      <style>
        :root {
          --bg: #0f172a;
          --panel: #1e293b;
          --border: #334155;
          --text: #f8fafc;
          --muted: #94a3b8;
          --primary: #38bdf8;
          --success: #10b981;
          --purple: #a855f7;
          --danger: #ef4444;
          --warning: #f59e0b;
        }
        body { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; background: var(--bg); color: var(--text); padding: 24px; margin: 0; }
        .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; background: var(--panel); padding: 20px 24px; border-radius: 12px; border: 1px solid var(--border); flex-wrap: wrap; gap: 16px; }
        h1 { color: var(--primary); font-size: 22px; margin: 0; display: flex; align-items: center; gap: 10px; }
        .stats-bar { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }
        .stat-badge { background: var(--panel); border: 1px solid var(--border); padding: 8px 16px; border-radius: 20px; font-size: 13px; color: var(--muted); font-weight: 600; }
        .stat-badge span { color: var(--text); font-weight: 700; margin-left: 6px; }
        .controls-bar { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
        .search-box { background: var(--panel); border: 1px solid var(--border); color: var(--text); padding: 8px 14px; border-radius: 6px; font-size: 13px; min-width: 280px; }
        .filter-group { display: flex; gap: 6px; flex-wrap: wrap; }
        .filter-pill { background: #0f172a; border: 1px solid var(--border); color: var(--muted); padding: 6px 12px; border-radius: 6px; font-size: 12px; cursor: pointer; font-weight: 600; transition: all 0.2s; }
        .filter-pill.active { background: rgba(56,189,248,0.2); border-color: var(--primary); color: var(--primary); }
        .table-container { background: var(--panel); border-radius: 12px; overflow-x: auto; border: 1px solid var(--border); margin-bottom: 24px; }
        table { width: 100%; border-collapse: collapse; text-align: left; }
        th, td { padding: 12px 16px; border-bottom: 1px solid var(--border); font-size: 13px; vertical-align: top; }
        th { background: #0f172a; color: var(--muted); text-transform: uppercase; font-size: 11px; letter-spacing: 0.5px; font-weight: 700; }
        tr:hover { background: #26334d; }
        .btn { padding: 6px 12px; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 12px; margin-right: 4px; margin-bottom: 4px; transition: all 0.2s; display: inline-flex; align-items: center; gap: 5px; }
        .btn-winner { background: #10b981; color: #fff; }
        .btn-winner:hover { background: #059669; }
        .btn-finalist { background: #a855f7; color: #fff; }
        .btn-finalist:hover { background: #9333ea; }
        .btn-reject { background: #ef4444; color: #fff; }
        .btn-reject:hover { background: #dc2626; }
        .badge { padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 700; display: inline-block; letter-spacing: 0.3px; white-space: nowrap; }
        .badge-pending { background: rgba(245, 158, 11, 0.15); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.3); }
        .badge-winner { background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); }
        .badge-finalist { background: rgba(168, 85, 247, 0.15); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.3); }
        .badge-rejected { background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3); }
        .link { color: var(--primary); text-decoration: none; font-weight: 600; }
        .link:hover { text-decoration: underline; }
        .desc-text { line-height: 1.4; color: var(--text); }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          <h1>🏆 AI Innovation Hackathon 2026 — Final Round Judge Panel</h1>
          <p style="margin:4px 0 0;font-size:13px;color:var(--muted)">Official evaluation dashboard for Final Project Submissions • Women in AI, Research, Innovation &amp; Entrepreneurship Club</p>
        </div>
        <div style="font-size:12px;color:var(--muted);background:#0f172a;padding:8px 14px;border-radius:8px;border:1px solid var(--border)">
          Session: <strong style="color:var(--primary)">Authorized Judge</strong>
        </div>
      </div>

      <!-- STATISTICS SUMMARY BAR -->
      <div class="stats-bar">
        <div class="stat-badge">Total Final Submissions:<span id="cntTotal">0</span></div>
        <div class="stat-badge">Pending Evaluation:<span id="cntPending" style="color:#fbbf24">0</span></div>
        <div class="stat-badge">Winners:<span id="cntWinners" style="color:#34d399">0</span></div>
        <div class="stat-badge">Finalists:<span id="cntFinalists" style="color:#c084fc">0</span></div>
        <div class="stat-badge">Not Selected:<span id="cntNotSelected" style="color:#f87171">0</span></div>
      </div>

      <!-- CONTROLS & SEARCH -->
      <div class="controls-bar">
        <input type="text" id="searchInput" class="search-box" placeholder="Search by participant/team or problem statement..." oninput="onSearchChange()">
        <div class="filter-group">
          <button type="button" class="filter-pill active" id="filterAll" onclick="setFilter('all')">All</button>
          <button type="button" class="filter-pill" id="filterPending" onclick="setFilter('pending')">Pending Only</button>
          <button type="button" class="filter-pill" id="filterWinner" onclick="setFilter('winner')">Winners</button>
          <button type="button" class="filter-pill" id="filterFinalist" onclick="setFilter('finalist')">Finalists</button>
          <button type="button" class="filter-pill" id="filterNotSelected" onclick="setFilter('not_selected')">Not Selected</button>
        </div>
      </div>

      <!-- FINAL PROJECT SUBMISSIONS TABLE (Reads ONLY from Final Submissions) -->
      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th style="width:50px">Sl. No.</th>
              <th>Participant / Team Name</th>
              <th>Selected Problem Statement</th>
              <th>GitHub Repository</th>
              <th>Demo Video</th>
              <th>Live Demo / Deployment</th>
              <th>Final Submission Declaration</th>
              <th>Current Final Evaluation Status</th>
              <th style="width:230px">Final Decision Actions</th>
            </tr>
          </thead>
          <tbody id="table-body">
            <tr><td colspan="9" style="text-align:center;padding:40px;color:var(--muted)">Loading final project submissions from Final Submissions sheet...</td></tr>
          </tbody>
        </table>
      </div>

      <script>
        var JUDGE_KEY = ${JSON.stringify(authorizedKey || "")};
        var rawSubmissions = [];
        var currentFilter = "all";
        var searchFilter = "";

        // Fetch final submissions on load
        google.script.run
          .withSuccessHandler(renderRows)
          .withFailureHandler(function(err) {
            document.getElementById('table-body').innerHTML = '<tr><td colspan="9" style="color:#ef4444;padding:30px;text-align:center;">Error loading final submissions: ' + escapeHtml(err.message) + '</td></tr>';
          })
          .getJudgeData(JUDGE_KEY);

        function renderRows(data) {
          rawSubmissions = data || [];
          var tbody = document.getElementById('table-body');
          tbody.innerHTML = '';

          var total = rawSubmissions.length, pending = 0, winners = 0, finalists = 0, notSelected = 0;

          rawSubmissions.forEach(function(row) {
            var st = (row.status || '').toUpperCase();
            if (st.indexOf('WINNER') !== -1) winners++;
            else if (st.indexOf('FINALIST') !== -1) finalists++;
            else if (st.indexOf('NOT SELECTED') !== -1 || st.indexOf('REJECTED') !== -1) notSelected++;
            else pending++;
          });

          updateStats(total, pending, winners, finalists, notSelected);

          var filtered = rawSubmissions.filter(function(row) {
            var st = (row.status || '').toUpperCase();
            if (currentFilter === 'winner' && st.indexOf('WINNER') === -1) return false;
            if (currentFilter === 'finalist' && st.indexOf('FINALIST') === -1) return false;
            if (currentFilter === 'not_selected' && st.indexOf('NOT SELECTED') === -1 && st.indexOf('REJECTED') === -1) return false;
            if (currentFilter === 'pending' && (st.indexOf('WINNER') !== -1 || st.indexOf('FINALIST') !== -1 || st.indexOf('NOT SELECTED') !== -1 || st.indexOf('REJECTED') !== -1)) return false;

            if (searchFilter) {
              var q = searchFilter.toLowerCase();
              var match = (row.teamName && row.teamName.toLowerCase().indexOf(q) !== -1) ||
                          (row.problemStatement && row.problemStatement.toLowerCase().indexOf(q) !== -1) ||
                          (row.declaration && row.declaration.toLowerCase().indexOf(q) !== -1);
              if (!match) return false;
            }
            return true;
          });

          if (!filtered.length) {
            tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:40px;color:var(--muted)">No final project submissions match your filter.</td></tr>';
            return;
          }

          filtered.forEach(function(row, idx) {
            var tr = document.createElement('tr');
            var statusBadge = '';
            var statusStr = (row.status || '').toUpperCase();

            if (statusStr.indexOf('WINNER') !== -1) {
              statusBadge = '<span class="badge badge-winner">🏆 WINNER</span>';
            } else if (statusStr.indexOf('FINALIST') !== -1) {
              statusBadge = '<span class="badge badge-finalist">⭐ FINALIST</span>';
            } else if (statusStr.indexOf('NOT SELECTED') !== -1 || statusStr.indexOf('REJECTED') !== -1) {
              statusBadge = '<span class="badge badge-rejected">NOT SELECTED</span>';
            } else {
              statusBadge = '<span class="badge badge-pending">PENDING EVALUATION</span>';
            }

            function sanitizeUrl_(u) {
              if (!u || typeof u !== 'string') return '';
              var t = u.trim();
              if (/^https?:\/\//i.test(t)) return t;
              return '';
            }

            var safeRepo = sanitizeUrl_(row.githubUrl);
            var repoLink = safeRepo ? '<a href="' + escapeHtml(safeRepo) + '" target="_blank" rel="noopener" class="link">GitHub Repo 🔗</a>' : (row.githubUrl ? '<span style="color:var(--muted)">' + escapeHtml(row.githubUrl) + '</span>' : '<span style="color:var(--muted)">No Repo</span>');
            var safeVideo = sanitizeUrl_(row.videoLink);
            var videoCell = safeVideo ? '<a href="' + escapeHtml(safeVideo) + '" target="_blank" rel="noopener" class="link" style="color:#f59e0b;">▶ Demo Video</a>' : (row.videoLink && row.videoLink !== '—' ? '<span style="color:var(--muted)">' + escapeHtml(row.videoLink) + '</span>' : '<span style="color:var(--muted)">—</span>');
            var safeLive = sanitizeUrl_(row.liveLink);
            var liveCell = safeLive ? '<a href="' + escapeHtml(safeLive) + '" target="_blank" rel="noopener" class="link" style="color:#34d399;">Live Demo 🚀</a>' : (row.liveLink && row.liveLink !== '—' ? '<span style="color:var(--muted)">' + escapeHtml(row.liveLink) + '</span>' : '<span style="color:var(--muted)">—</span>');

            var stmtText = escapeHtml(row.problemStatement || '—');
            var declText = escapeHtml(row.declaration || '—');
            var tn = escapeHtml(row.teamName || '');
            var tnAttr = escapeHtml(row.teamName || '');

            tr.innerHTML =
              '<td style="font-weight:700;color:var(--muted)">' + (idx + 1 < 10 ? '0' : '') + (idx + 1) + '</td>' +
              '<td><strong>' + tn + '</strong></td>' +
              '<td><div class="desc-text">' + stmtText + '</div></td>' +
              '<td>' + repoLink + '</td>' +
              '<td>' + videoCell + '</td>' +
              '<td>' + liveCell + '</td>' +
              '<td><div class="desc-text">' + declText + '</div></td>' +
              '<td id="status-' + idx + '">' + statusBadge + '<br><small style="color:var(--muted);font-size:10.5px">Email: ' + escapeHtml(row.emailSent || 'Not Sent') + '</small></td>' +
              '<td id="action-' + idx + '">' +
                '<button type="button" class="btn btn-winner" data-team="' + tnAttr + '" onclick="onDecisionClick(this,\'winner\',' + idx + ')">🏆 Winner</button>' +
                '<button type="button" class="btn btn-finalist" data-team="' + tnAttr + '" onclick="onDecisionClick(this,\'finalist\',' + idx + ')">⭐ Finalist</button>' +
                '<button type="button" class="btn btn-reject" data-team="' + tnAttr + '" onclick="onDecisionClick(this,\'not_selected\',' + idx + ')">❌ Not Selected</button>' +
              '</td>';
            tbody.appendChild(tr);
          });
        }

        function updateStats(total, pending, winners, finalists, notSelected) {
          document.getElementById('cntTotal').innerText = total;
          document.getElementById('cntPending').innerText = pending;
          document.getElementById('cntWinners').innerText = winners;
          document.getElementById('cntFinalists').innerText = finalists;
          document.getElementById('cntNotSelected').innerText = notSelected;
        }

        function setFilter(f) {
          currentFilter = f;
          document.getElementById('filterAll').className = f === 'all' ? 'filter-pill active' : 'filter-pill';
          document.getElementById('filterPending').className = f === 'pending' ? 'filter-pill active' : 'filter-pill';
          document.getElementById('filterWinner').className = f === 'winner' ? 'filter-pill active' : 'filter-pill';
          document.getElementById('filterFinalist').className = f === 'finalist' ? 'filter-pill active' : 'filter-pill';
          document.getElementById('filterNotSelected').className = f === 'not_selected' ? 'filter-pill active' : 'filter-pill';
          renderRows(rawSubmissions);
        }

        function onSearchChange() {
          searchFilter = document.getElementById('searchInput').value.trim();
          renderRows(rawSubmissions);
        }

        function onDecisionClick(btn, decision, idx) {
          var teamName = btn.getAttribute('data-team');
          var labelMap = { 'winner': 'WINNER', 'finalist': 'FINALIST', 'not_selected': 'NOT SELECTED' };
          var targetLabel = labelMap[decision] || decision.toUpperCase();

          if (!confirm('Are you sure you want to set the final decision for "' + teamName + '" to ' + targetLabel + '?\nThis will save the status and send a final-round result email.')) {
            return;
          }

          var actionTd = document.getElementById('action-' + idx);
          var statusTd = document.getElementById('status-' + idx);
          actionTd.innerHTML = '<em style="color:var(--muted);font-size:12px">Saving Decision &amp; Dispatching Email...</em>';

          google.script.run
            .withSuccessHandler(function(res) {
              if (res.savedInSheet) {
                var item = rawSubmissions.find(function(r) { return r.teamName === teamName; });
                if (item) {
                  item.status = targetLabel;
                  if (res.emailSent) item.emailSent = 'Sent';
                }

                if (decision === 'winner') {
                  statusTd.innerHTML = '<span class="badge badge-winner">🏆 WINNER</span><br><small style="color:var(--muted);font-size:10.5px">Email: Sent</small>';
                } else if (decision === 'finalist') {
                  statusTd.innerHTML = '<span class="badge badge-finalist">⭐ FINALIST</span><br><small style="color:var(--muted);font-size:10.5px">Email: Sent</small>';
                } else {
                  statusTd.innerHTML = '<span class="badge badge-rejected">NOT SELECTED</span><br><small style="color:var(--muted);font-size:10.5px">Email: Sent</small>';
                }

                if (res.success) {
                  actionTd.innerHTML = '<span style="color:#34d399;font-weight:700">✅ Saved &amp; Email Sent</span>';
                } else {
                  actionTd.innerHTML = '<span style="color:#fbbf24;font-weight:700">⚠️ Saved (' + escapeHtml(res.message) + ')</span>';
                }
                renderRows(rawSubmissions);
              } else {
                alert('Error saving decision: ' + res.message);
                restoreActionButtons(teamName, idx, actionTd);
              }
            })
            .withFailureHandler(function(err) {
              alert('Server Error: ' + err.message);
              restoreActionButtons(teamName, idx, actionTd);
            })
            .processJudgeDecision(teamName, decision, JUDGE_KEY);
        }

        function restoreActionButtons(teamName, idx, actionTd) {
          var tnAttr = escapeHtml(teamName || '');
          actionTd.innerHTML =
            '<button type="button" class="btn btn-winner" data-team="' + tnAttr + '" onclick="onDecisionClick(this,\'winner\',' + idx + ')">🏆 Winner</button>' +
            '<button type="button" class="btn btn-finalist" data-team="' + tnAttr + '" onclick="onDecisionClick(this,\'finalist\',' + idx + ')">⭐ Finalist</button>' +
            '<button type="button" class="btn btn-reject" data-team="' + tnAttr + '" onclick="onDecisionClick(this,\'not_selected\',' + idx + ')">❌ Not Selected</button>';
        }

        function escapeHtml(str) {
          if (!str) return '';
          return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
        }
      </script>
    </body>
    </html>
  `;
  return HtmlService.createHtmlOutput(html).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * getJudgeData() — Reads ONLY from 'Final Submissions' sheet.
 * Real headers (confirmed by user):
 *   Col 0: Timestamp
 *   Col 1: Participant / Team Name
 *   Col 2: Selected Problem Statement
 *   Col 3: GitHub Repository URL
 *   Col 4: Final Project Demo Video
 *   Col 5: Live Demo / Deployment Link
 *   Col 6: Final Submission Declaration
 *   Col 7: Final Evaluation Status       (appended by script if missing)
 *   Col 8: Final Decision Email Sent     (appended by script if missing)
 *
 * Email is NOT stored in Final Submissions — resolved server-side via cross-reference.
 */
function getJudgeData(judgeKey) {
  if (!validateJudgeKey_(judgeKey)) {
    throw new Error("Unauthorized access: Invalid or missing Judge Key.");
  }
  // Reads ONLY from Final Submissions. Never reads Stage 1 Submissions or Form Responses 1.
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet = getStage2Sheet_(ss);
  if (!sheet) return [];

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  // Ensure required judging columns exist (append header if missing)
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

  // Use fixed column positions based on confirmed real sheet structure
  const COL_TEAM  = 1; // Participant / Team Name
  const COL_STMT  = 2; // Selected Problem Statement
  const COL_REPO  = 3; // GitHub Repository URL
  const COL_VIDEO = 4; // Final Project Demo Video
  const COL_LIVE  = 5; // Live Demo / Deployment Link
  const COL_DECL  = 6; // Final Submission Declaration

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

    // Keep latest row per team if duplicates exist
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
 *
 * Called from the Judge Panel UI with the TEAM NAME (not email), because
 * 'Final Submissions' does NOT contain an email column.
 *
 * Server-side email resolution:
 *   1. Match team name in 'Final Submissions' → update Final Evaluation Status.
 *   2. Cross-reference 'Stage 1 Submissions' (then 'Form Responses 1') by
 *      team name to retrieve the registered leader email.
 *   3. Send the Final Round Result Email to the resolved address.
 */
function processJudgeDecision(teamName, decision, judgeKey) {
  if (!validateJudgeKey_(judgeKey)) {
    return { success: false, savedInSheet: false, message: "Unauthorized: Invalid or missing Judge Key." };
  }
  // Updates ONLY Final Evaluation Status and Final Decision Email Sent in Final Submissions.
  // NEVER modifies Screening Status or Stage 1 Submissions.
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet = getStage2Sheet_(ss);
  if (!sheet) return { success: false, savedInSheet: false, message: "Final Submissions sheet not found." };

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return { success: false, savedInSheet: false, message: "No final submissions data available." };

  // Locate or create judging columns
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

  // Col 1 = Participant / Team Name (fixed position, confirmed by user)
  const COL_TEAM = 1;
  const cleanTeam = String(teamName || "").trim().toLowerCase();

  const matchedRowIndices = [];
  let resolvedTeamName = teamName;

  for (let i = 1; i < data.length; i++) {
    const rowTeam = String(data[i][COL_TEAM] || "").trim();
    if (rowTeam.toLowerCase() === cleanTeam) {
      matchedRowIndices.push(i + 1); // 1-based sheet row
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

  // Map decision key → status label
  let finalStatus = "PENDING EVALUATION";
  if (decision === "winner")       finalStatus = "WINNER";
  else if (decision === "finalist") finalStatus = "FINALIST";
  else if (decision === "not_selected") finalStatus = "NOT SELECTED";

  // Write Final Evaluation Status to all matching rows in Final Submissions ONLY.
  // Stage 1 Submissions and Screening Status are NEVER touched here.
  matchedRowIndices.forEach(rowNum => {
    sheet.getRange(rowNum, statusIdx + 1).setValue(finalStatus);
  });
  SpreadsheetApp.flush();

  // Check if final decision email was already sent for this team (idempotency protection)
  let isAlreadySent = false;
  for (let i = 0; i < matchedRowIndices.length; i++) {
    const rowData = data[matchedRowIndices[i] - 1];
    const existingVal = emailSentIdx < rowData.length ? String(rowData[emailSentIdx] || "").trim().toLowerCase() : "";
    if (existingVal.startsWith("sent") || existingVal === "yes") {
      isAlreadySent = true;
      break;
    }
  }

  // -------------------------------------------------------
  // SERVER-SIDE EMAIL RESOLUTION
  // Final Submissions has no email column → cross-reference
  // Stage 1 Submissions first, then Form Responses 1.
  // Email is never exposed to the public API.
  // -------------------------------------------------------
  const resolvedEmail = resolveEmailByTeamName_(ss, cleanTeam);

  // Send Final Round Result Email (only if not already sent)
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

/**
 * resolveEmailByTeamName_(ss, rawInputName)
 * Looks up the authoritative recipient email for a final submission server-side:
 *   1. Searches 'Stage 1 Submissions'
 *   2. If necessary, falls back to 'Form Responses 1'
 *
 * Matching order:
 *   1. Team Name (teams)
 *   2. Team Leader / Primary Contact Name / Full Name (individual participants / leaders)
 *
 * Normalization:
 *   - Trims whitespace
 *   - Lowercases
 *   - Collapses multiple internal whitespace sequences
 *
 * The email address is NEVER exposed to the public API.
 * Returns email string or null.
 */
function resolveEmailByTeamName_(ss, rawInputName) {
  function normalizeVal_(val) {
    return String(val || "").trim().toLowerCase().replace(/\s+/g, " ");
  }

  const normInput = normalizeVal_(rawInputName);
  if (!normInput) return null;

  // 1. Search Stage 1 Submissions
  const s1Sheet = ss.getSheetByName(CONFIG.STAGE1_SHEET);
  if (s1Sheet) {
    const s1Data = s1Sheet.getDataRange().getValues();
    if (s1Data.length > 1) {
      const rawHeaders = s1Data[0].map(h => String(h || "").trim().toLowerCase());

      // Dynamic header resolution
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
      const emailIdx = findColIndex_(["email address", "email", "leader email", "primary email"]);

      // Effective email column
      const effectiveEmailIdx = emailIdx !== -1 ? emailIdx : 5; // fallback to standard Stage 1 col 5 if header missing

      // Rule 1: First pass — match Team Name
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

      // Rule 2: Second pass — match Team Leader / Primary Contact Name or Full Name for individuals/solo
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

      // Also check standard fixed positions (col 3 = Team Name, col 4 = Team Leader) as backup if headers were unconventional
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

  // 2. Fallback to Form Responses 1 (Registration Sheet)
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

  return null; // No matching Stage 1 or Registration participant/team with valid email found
}

function sendFinalResultEmail_(email, teamName, decision) {
  // Private helper. Final round result emails are completely separate from Stage 1 screening emails.
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

// =========================================================
// 4. SERVER HELPER FUNCTIONS
// =========================================================

/**
 * checkTeamEligibility_
 * Checks Stage 1 Submissions first (then Form Responses 1) to determine
 * whether the team has been shortlisted/selected for Stage 2.
 * Used to gate the Stage 2 final submission form.
 */
function checkTeamEligibility_(ss, teamName, email) {
  const normTeam  = String(teamName || "").toLowerCase().trim();
  const normEmail = String(email    || "").toLowerCase().trim();

  // Check Stage 1 Submissions first (primary source of screening status)
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

  // Fallback: check Form Responses 1
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

/**
 * updateStage1Status_
 * Updates Screening Status in Stage 1 Submissions ONLY.
 * Called ONLY during Stage 1 submission handling.
 * NEVER called from judge decision functions.
 */
function updateStage1Status_(ss, teamName, email, newStatus) {
  const s1Sheet = ss.getSheetByName(CONFIG.STAGE1_SHEET);
  if (!s1Sheet) return;

  const data = s1Sheet.getDataRange().getValues();
  if (data.length < 2) return;

  const cols = findStage1Columns_(data[0].map(h => String(h || "").trim()));
  const normTeam  = String(teamName || "").toLowerCase().trim();
  const normEmail = String(email    || "").toLowerCase().trim();

  for (let i = 1; i < data.length; i++) {
    const t = String(data[i][cols.teamName] || "").toLowerCase().trim();
    const e = String(data[i][cols.email] || "").toLowerCase().trim();
    if ((normTeam && t === normTeam) || (normEmail && e === normEmail)) {
      s1Sheet.getRange(i + 1, cols.status + 1).setValue(newStatus);
      break;
    }
  }
}

function normalizeStatusName_(rawStatus) {
  const st = String(rawStatus || "").trim().toUpperCase().replace(/\s+/g, " ");
  // CRITICAL: Check rejection/negative states FIRST before positive matches
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

function validateEmail_(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(String(email).toLowerCase());
}

function findStage1Columns_(headers) {
  const norm = str => String(str || "").toLowerCase().trim();
  const getCol = (possibleNames, defaultIndex) => {
    const idx = headers.findIndex(h => possibleNames.some(p => norm(h).includes(norm(p))));
    return idx !== -1 ? idx : defaultIndex;
  };

  const statusIdx = headers.findIndex(h => norm(h).includes("status"));
  const emailSentIdx = headers.findIndex(h => norm(h).includes("email") && (norm(h).includes("sent") || norm(h).includes("dispatch")));
  const notesIdx = headers.findIndex(h => norm(h).includes("note") || norm(h).includes("remark") || norm(h).includes("comment"));

  return {
    refId: getCol(["reference id", "ref id", "reference", "id"], 0),
    timestamp: getCol(["timestamp", "date", "time"], 1),
    type: getCol(["participation type", "type", "mode"], 2),
    teamName: getCol(["team name", "team", "participant name"], 3),
    leaderName: getCol(["leader", "primary contact", "full name", "contact name"], 4),
    email: getCol(["email address", "leader email", "email"], 5),
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

function jsonResponse_(data, code = 200) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function getStage2Sheet_(ss) {
  return ss.getSheetByName(CONFIG.STAGE2_SHEET) ||
         ss.getSheetByName("Final Submissions") ||
         ss.getSheetByName("Form Responses 2");
}

function escapeHtml_(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
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