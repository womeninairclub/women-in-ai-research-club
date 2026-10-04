/**
 * AI INNOVATION HACKATHON 2026 — SECURE BACKEND API & WORKFLOW AUTOMATION
 * Women in AI, Research, Innovation & Entrepreneurship Club
 * 
 * Features:
 * 1. doGet:
 *    - ?action=checkStatus&query=... -> Returns ONLY the requested team's status (NO bulk dataset dump).
 *    - Default (Public Roster) -> Sanitized list with ZERO email/phone exposure.
 * 2. doPost:
 *    - Stage1_Screening -> Strict field validation, email validation, duplicate prevention, WAI-SCR-XXXXXX generation, status update.
 *    - Stage2_Final -> Server-side eligibility check (SHORTLISTED/SELECTED only), github.com validation, duplicate prevention, WAI-FIN-XXXXXX generation, status update.
 *    - Safe MailApp wrapper preventing quota crashes from blocking database logging.
 */

const CONFIG = {
  REGISTRATION_SHEET: "Form Responses 1",
  STAGE1_SHEET: "Stage 1 Submissions",
  STAGE2_SHEET: "Final Submissions",
  EVENT_NAME: "AI Innovation Hackathon 2026",
  ORGANIZER_EMAIL: "womeninairclub@gmail.com",
  WEBSITE_URL: "https://womeninairclub.github.io/women-in-ai-research-club/hackathon.html"
};

// =========================================================
// 1. HTTP GET ENDPOINT (Public Directory & Secure Status Lookup)
// =========================================================
function doGet(e) {
  try {
    const params = e ? e.parameter : {};
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // ACTION: SECURE SINGLE PARTICIPANT STATUS LOOKUP
    if (params.action === "checkStatus") {
      const q = String(params.query || "").trim().toLowerCase();
      if (!q) {
        return jsonResponse_({ found: false, error: "Missing query identifier" }, 400);
      }

      // Search Registration Sheet first, then Stage 1, then Stage 2
      const regSheet = ss.getSheetByName(CONFIG.REGISTRATION_SHEET);
      const stage1Sheet = ss.getSheetByName(CONFIG.STAGE1_SHEET);
      const stage2Sheet = ss.getSheetByName(CONFIG.STAGE2_SHEET);

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
            return team === q || leader.toLowerCase() === q || name === q || email === q;
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

      // Check Stage 1 Submissions if stage 1 record exists
      if (stage1Sheet) {
        const data1 = stage1Sheet.getDataRange().getValues();
        if (data1.length > 1) {
          const rows1 = data1.slice(1);
          const match1 = rows1.find(r => {
            const ref = String(r[0] || "").toLowerCase();
            const team = String(r[3] || "").toLowerCase();
            const email = String(r[5] || "").toLowerCase();
            return ref === q || team === q || email === q;
          });

          if (match1) {
            const refId = match1[0];
            if (!foundRecord) {
              foundRecord = {
                teamName: match1[3] || "Participant",
                type: match1[2] || "Team",
                status: "ROUND 1 SUBMITTED",
                referenceId: refId
              };
            } else {
              foundRecord.referenceId = refId;
              if (foundRecord.status === "REGISTERED" || foundRecord.status === "UNDER REVIEW") {
                foundRecord.status = "ROUND 1 SUBMITTED";
              }
            }
          }
        }
      }

      // Check Stage 2 Submissions
      if (stage2Sheet) {
        const data2 = stage2Sheet.getDataRange().getValues();
        if (data2.length > 1) {
          const rows2 = data2.slice(1);
          const match2 = rows2.find(r => {
            const ref = String(r[0] || "").toLowerCase();
            const team = String(r[2] || "").toLowerCase();
            const email = String(r[3] || "").toLowerCase();
            return ref === q || team === q || email === q;
          });

          if (match2) {
            if (foundRecord) {
              foundRecord.status = match2[9] || "FINAL SUBMISSION RECEIVED";
              foundRecord.finalRefId = match2[0];
            } else {
              foundRecord = {
                teamName: match2[2] || "Participant",
                type: "Team",
                status: match2[9] || "FINAL SUBMISSION RECEIVED",
                finalRefId: match2[0]
              };
            }
          }
        }
      }

      if (!foundRecord) {
        return jsonResponse_({ found: false, message: "No record matched your inquiry." });
      }

      // Determine Stage 2 Eligibility
      const normStatus = String(foundRecord.status).toUpperCase();
      const eligibleForStage2 = (
        normStatus.includes("SHORTLISTED") ||
        normStatus.includes("SELECTED") ||
        normStatus.includes("FINAL SUBMISSION PENDING") ||
        normStatus.includes("FINAL SUBMISSION RECEIVED") ||
        normStatus.includes("UNDER EVALUATION") ||
        normStatus.includes("FINALIST") ||
        normStatus.includes("WINNER")
      );

      return jsonResponse_({
        found: true,
        teamName: foundRecord.teamName,
        type: foundRecord.type,
        status: normalizeStatusName_(foundRecord.status),
        eligibleForStage2: eligibleForStage2,
        referenceId: foundRecord.referenceId || foundRecord.finalRefId || null
      });
    }

    // DEFAULT ACTION: RETURN SANITIZED PUBLIC PARTICIPANTS DIRECTORY
    const regSheet = ss.getSheetByName(CONFIG.REGISTRATION_SHEET);
    if (!regSheet) return jsonResponse_([]);

    const data = regSheet.getDataRange().getValues();
    if (data.length < 2) return jsonResponse_([]);

    const headers = data[0].map(h => String(h || "").trim());
    const col = findColumns_(headers);
    const rows = data.slice(1);

    // Filter and sanitize (NO email, phone, or private notes)
    const publicList = rows.map((row, idx) => {
      return {
        id: idx + 1,
        participationType: row[col.participationType] || "Individual",
        teamName: row[col.teamName] || "",
        fullName: row[col.fullName] || "",
        teamLeader: row[col.teamLeader] || "",
        teamMembers: row[col.teamMembers] || "",
        screeningStatus: normalizeStatusName_(row[col.screeningStatus] || "REGISTERED"),
        registeredAt: row[col.timestamp] || ""
      };
    });

    return jsonResponse_(publicList);

  } catch (err) {
    return jsonResponse_({ error: err.toString() }, 500);
  }
}

// =========================================================
// 2. HTTP POST ENDPOINT (Strict Validation & Submissions)
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

    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // ---------------------------------------------------------
    // STAGE 1: IDEA SCREENING SUBMISSION (Round 1)
    // ---------------------------------------------------------
    if (body.type === "Stage1_Screening") {
      const teamName = String(body.teamName || "").trim();
      const leaderName = String(body.leaderName || "").trim();
      const email = String(body.email || "").trim();
      const track = String(body.track || "").trim();
      const statement = String(body.statement || "").trim();
      const solution = String(body.solution || "").trim();
      const approach = String(body.approach || "").trim();
      const phone = String(body.phone || "").trim();
      const pitchLink = String(body.pitchLink || "").trim();

      // Field Validation
      if (!teamName || !leaderName || !email || !track || !statement || !solution || !approach) {
        return jsonResponse_({
          success: false,
          error: "Missing required fields. Please fill in Team Name, Leader Name, Email, Track, Problem Statement, Solution, and Approach."
        }, 400);
      }

      if (!validateEmail_(email)) {
        return jsonResponse_({ success: false, error: "Invalid email address format." }, 400);
      }

      // Check for duplicate submission in Stage 1 Submissions sheet
      let stage1Sheet = ss.getSheetByName(CONFIG.STAGE1_SHEET);
      if (!stage1Sheet) {
        stage1Sheet = ss.insertSheet(CONFIG.STAGE1_SHEET);
        stage1Sheet.appendRow([
          "Reference ID", "Timestamp (IST)", "Participation Type", "Team Name",
          "Team Leader", "Email", "Phone", "Track", "Problem Statement",
          "Proposed Solution", "AI Approach", "Pitch Link", "Status"
        ]);
      } else {
        const s1Data = stage1Sheet.getDataRange().getValues();
        if (s1Data.length > 1) {
          const rows1 = s1Data.slice(1);
          const duplicate = rows1.find(r => {
            const exTeam = String(r[3] || "").toLowerCase().trim();
            const exEmail = String(r[5] || "").toLowerCase().trim();
            return exTeam === teamName.toLowerCase() || exEmail === email.toLowerCase();
          });

          if (duplicate) {
            return jsonResponse_({
              success: false,
              alreadySubmitted: true,
              refId: duplicate[0],
              message: "Stage 1 proposal has already been submitted for this team/email.",
              status: "ROUND 1 SUBMITTED"
            }, 200);
          }
        }
      }

      const timestamp = Utilities.formatDate(new Date(), "Asia/Kolkata", "yyyy-MM-dd HH:mm:ss");
      const refId = "WAI-SCR-" + Math.floor(100000 + Math.random() * 900000);

      stage1Sheet.appendRow([
        refId, timestamp, body.participationType || "Team", teamName,
        leaderName, email, phone, track, statement,
        solution, approach, pitchLink, "ROUND 1 SUBMITTED"
      ]);

      // Update status in Registration sheet if available
      updateRegistrationStatus_(ss, teamName, email, "ROUND 1 SUBMITTED");

      // Transactional email with error guarding
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

    // ---------------------------------------------------------
    // STAGE 2: FINAL PROJECT SUBMISSION (Round 2)
    // ---------------------------------------------------------
    if (body.type === "Stage2_Final") {
      const teamName = String(body.teamName || "").trim();
      const email = String(body.email || "").trim();
      const track = String(body.track || "").trim();
      const projectTitle = String(body.projectTitle || "").trim();
      const githubUrl = String(body.githubUrl || "").trim();
      const demoUrl = String(body.demoUrl || "").trim();
      const description = String(body.description || "").trim();

      // Field Validation
      if (!teamName || !email || !track || !projectTitle || !githubUrl || !description) {
        return jsonResponse_({
          success: false,
          error: "Missing required fields. Please fill in Team Name, Leader Email, Track, Project Title, GitHub Repository, and Description."
        }, 400);
      }

      if (!validateEmail_(email)) {
        return jsonResponse_({ success: false, error: "Invalid team leader email address." }, 400);
      }

      if (!githubUrl.toLowerCase().includes("github.com")) {
        return jsonResponse_({ success: false, error: "Invalid GitHub URL. Must be a valid public github.com repository." }, 400);
      }

      // CRITICAL SERVER-SIDE ELIGIBILITY VERIFICATION
      // Only teams with status SHORTLISTED / SELECTED / FINAL SUBMISSION PENDING can submit Stage 2!
      const eligibility = checkTeamEligibility_(ss, teamName, email);
      if (!eligibility.isEligible) {
        return jsonResponse_({
          success: false,
          error: eligibility.reason || "Round 2 Final Submission is available only to shortlisted/selected teams from Stage 1 Idea Screening.",
          currentStatus: eligibility.currentStatus
        }, 403);
      }

      // Check duplicate Stage 2 submission
      let stage2Sheet = ss.getSheetByName(CONFIG.STAGE2_SHEET);
      if (!stage2Sheet) {
        stage2Sheet = ss.insertSheet(CONFIG.STAGE2_SHEET);
        stage2Sheet.appendRow([
          "Reference ID", "Timestamp (IST)", "Team Name", "Leader Email",
          "Track", "Project Title", "GitHub Repository", "Demo URL",
          "Description", "Evaluation Status"
        ]);
      } else {
        const s2Data = stage2Sheet.getDataRange().getValues();
        if (s2Data.length > 1) {
          const rows2 = s2Data.slice(1);
          const duplicate = rows2.find(r => {
            const exTeam = String(r[2] || "").toLowerCase().trim();
            const exGit = String(r[6] || "").toLowerCase().trim();
            return exTeam === teamName.toLowerCase() || exGit === githubUrl.toLowerCase();
          });

          if (duplicate) {
            return jsonResponse_({
              success: false,
              alreadySubmitted: true,
              refId: duplicate[0],
              message: "Final project has already been submitted for this team.",
              status: "FINAL SUBMISSION RECEIVED"
            }, 200);
          }
        }
      }

      const timestamp = Utilities.formatDate(new Date(), "Asia/Kolkata", "yyyy-MM-dd HH:mm:ss");
      const refId = "WAI-FIN-" + Math.floor(100000 + Math.random() * 900000);

      stage2Sheet.appendRow([
        refId, timestamp, teamName, email, track,
        projectTitle, githubUrl, demoUrl, description, "FINAL SUBMISSION RECEIVED"
      ]);

      // Update status in Registration sheet
      updateRegistrationStatus_(ss, teamName, email, "FINAL SUBMISSION RECEIVED");

      // Transactional confirmation email with exception safety
      let emailSent = false;
      try {
        MailApp.sendEmail({
          to: email,
          subject: `${CONFIG.EVENT_NAME} — Final Project Submission Confirmation [${refId}]`,
          htmlBody: `
            <div style="font-family:Arial,sans-serif;line-height:1.6;color:#222;max-width:600px">
              <h2 style="color:#059669">Final Project Submission Recorded</h2>
              <p>Dear ${escapeHtml_(teamName)},</p>
              <p>Your final hackathon project submission has been officially recorded for evaluation by the judging panel.</p>
              <p><strong>Official Reference Code:</strong> <span style="font-family:monospace;font-weight:bold;color:#059669">${refId}</span><br>
              <strong>Project Title:</strong> ${escapeHtml_(projectTitle)}<br>
              <strong>GitHub Repository:</strong> <a href="${githubUrl}">${githubUrl}</a><br>
              <strong>Official Server Timestamp:</strong> ${timestamp} IST</p>
              <p>Jury evaluation is conducted between 6:00 PM and 8:00 PM IST today. Final results will be published at <strong>8:00 PM IST</strong> on the official hackathon website.</p>
              <p>Best of luck!<br><strong>AI Innovation Hackathon 2026 Jury & Organizing Team</strong><br>Women in AI, Research, Innovation & Entrepreneurship Club</p>
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
        status: "FINAL SUBMISSION RECEIVED",
        emailSent: emailSent
      });
    }

    return jsonResponse_({ success: false, error: "Unsupported submission type." }, 400);

  } catch (err) {
    return jsonResponse_({ success: false, error: err.toString() }, 500);
  }
}

// =========================================================
// 3. SERVER HELPER FUNCTIONS
// =========================================================

function checkTeamEligibility_(ss, teamName, email) {
  const normTeam = String(teamName || "").toLowerCase().trim();
  const normEmail = String(email || "").toLowerCase().trim();

  const regSheet = ss.getSheetByName(CONFIG.REGISTRATION_SHEET);
  if (!regSheet) return { isEligible: false, reason: "Registration sheet unavailable." };

  const data = regSheet.getDataRange().getValues();
  if (data.length < 2) return { isEligible: false, reason: "No registration records found." };

  const headers = data[0].map(h => String(h || "").trim());
  const col = findColumns_(headers);
  const rows = data.slice(1);

  const match = rows.find(r => {
    const t = String(r[col.teamName] || "").toLowerCase().trim();
    const e = String(r[col.email] || "").toLowerCase().trim();
    const l = String(r[col.teamLeader] || "").toLowerCase().trim();
    return t === normTeam || e === normEmail || l === normTeam;
  });

  if (!match) {
    return { isEligible: false, reason: "Team or Leader email not found in official registration records." };
  }

  const status = normalizeStatusName_(match[col.screeningStatus] || "REGISTERED").toUpperCase();

  const isEligible = (
    status.includes("SHORTLISTED") ||
    status.includes("SELECTED") ||
    status.includes("FINAL SUBMISSION PENDING") ||
    status.includes("FINAL SUBMISSION RECEIVED") ||
    status.includes("UNDER EVALUATION") ||
    status.includes("FINALIST") ||
    status.includes("WINNER")
  );

  if (!isEligible) {
    if (status.includes("NOT SELECTED")) {
      return {
        isEligible: false,
        currentStatus: "NOT SELECTED",
        reason: "Stage 1 Screening Outcome: Not Selected. Round 2 submission is not permitted."
      };
    }
    return {
      isEligible: false,
      currentStatus: status,
      reason: `Current status is ${status}. Round 2 submission is permitted only after Stage 1 shortlisting.`
    };
  }

  return { isEligible: true, currentStatus: status };
}

function updateRegistrationStatus_(ss, teamName, email, newStatus) {
  const regSheet = ss.getSheetByName(CONFIG.REGISTRATION_SHEET);
  if (!regSheet) return;

  const data = regSheet.getDataRange().getValues();
  if (data.length < 2) return;

  const headers = data[0].map(h => String(h || "").trim());
  const col = findColumns_(headers);
  if (col.screeningStatus === -1) return;

  const normTeam = String(teamName || "").toLowerCase().trim();
  const normEmail = String(email || "").toLowerCase().trim();

  for (let i = 1; i < data.length; i++) {
    const t = String(data[i][col.teamName] || "").toLowerCase().trim();
    const e = String(data[i][col.email] || "").toLowerCase().trim();
    if (t === normTeam || e === normEmail) {
      regSheet.getRange(i + 1, col.screeningStatus + 1).setValue(newStatus);
      break;
    }
  }
}

function normalizeStatusName_(rawStatus) {
  const st = String(rawStatus || "").trim().toUpperCase();
  if (st.includes("WINNER")) return "WINNER";
  if (st.includes("FINALIST")) return "FINALIST";
  if (st.includes("UNDER EVALUATION")) return "UNDER EVALUATION";
  if (st.includes("FINAL SUBMISSION RECEIVED")) return "FINAL SUBMISSION RECEIVED";
  if (st.includes("FINAL SUBMISSION PENDING")) return "FINAL SUBMISSION PENDING";
  if (st.includes("SHORTLISTED") || st.includes("SELECTED")) return "SHORTLISTED / SELECTED";
  if (st.includes("NOT SELECTED") || st.includes("REJECTED")) return "NOT SELECTED";
  if (st.includes("ROUND 1 SUBMITTED") || st.includes("STAGE 1 SUBMITTED")) return "ROUND 1 SUBMITTED";
  if (st.includes("UNDER REVIEW")) return "UNDER REVIEW";
  return "REGISTERED";
}

function validateEmail_(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(String(email).toLowerCase());
}

function findColumns_(headers) {
  const norm = str => String(str || "").toLowerCase().trim();
  const getCol = (possibleNames) => {
    return headers.findIndex(h => possibleNames.some(p => norm(h).includes(norm(p))));
  };

  return {
    timestamp: getCol(["timestamp", "registered"]),
    fullName: getCol(["full name", "name"]),
    email: getCol(["email address", "email"]),
    participationType: getCol(["participation type", "type"]),
    teamName: getCol(["team name"]),
    teamLeader: getCol(["team leader", "primary contact"]),
    teamMembers: getCol(["team members", "members"]),
    screeningStatus: getCol(["screening status", "status"])
  };
}

function jsonResponse_(data, code = 200) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function escapeHtml_(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
