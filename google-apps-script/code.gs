/**
 * AI INNOVATION HACKATHON 2026 — SECURE BACKEND API, FINAL JUDGE PANEL & WORKFLOW AUTOMATION
 * Women in AI, Research, Innovation & Entrepreneurship Club
 * 
 * Features:
 * 1. doGet:
 *    - ?panel=judge&key=WAI_JUDGE_2026 -> Renders protected Final Round Judge Panel HTML Dashboard.
 *    - ?action=checkStatus&query=... -> Returns single participant/team status & Stage 2 eligibility flag.
 *    - Default (Public Participants Roster) -> Reads ONLY from 'Form Responses 1', deduplicates teams, returns ONLY: Sl. No (id), Team Name, Participation Type. ZERO private data exposed.
 * 2. doPost:
 *    - Stage1_Screening -> Logs proposal to 'Stage 1 Submissions', dispatches receipt email.
 *    - Stage2_Final -> Gated by Stage 1 shortlist status, logs final project (GitHub repo, demo URL, title, description) to 'Final Submissions', dispatches confirmation email.
 * 3. Final Round Judge Panel:
 *    - Reads ONLY from 'Final Submissions' sheet.
 *    - Evaluates final projects with decisions: WINNER, FINALIST, NOT SELECTED.
 *    - Stores decision in 'Final Evaluation Status' & 'Final Decision Email Sent' without modifying Stage 1 screening status.
 *    - Sends distinct Final Round Result Emails protected with try/catch email safety.
 */

const CONFIG = {
  REGISTRATION_SHEET: "Form Responses 1",
  STAGE1_SHEET: "Stage 1 Submissions",
  STAGE2_SHEET: "Final Submissions",
  JUDGE_KEY: "WAI_JUDGE_2026",
  EVENT_NAME: "AI Innovation Hackathon 2026",
  ORGANIZER_EMAIL: "womeninairclub@gmail.com",
  WEBSITE_URL: "https://womeninairclub.github.io/women-in-ai-research-club/hackathon.html"
};

// =========================================================
// 1. HTTP GET ENDPOINT (Judge Panel, Status Lookup & Roster)
// =========================================================
function doGet(e) {
  try {
    const params = e ? e.parameter : {};
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // ROUTE 1: PRIVATE FINAL JUDGE PANEL DASHBOARD
    if (params.panel === "judge") {
      if (params.key !== CONFIG.JUDGE_KEY) {
        return HtmlService.createHtmlOutput(
          "<div style='font-family:sans-serif;padding:40px;color:#ef4444;background:#0f172a;height:100vh;box-sizing:border-box;text-align:center;'>" +
          "<h2 style='font-size:28px;margin-bottom:12px;'>🚫 Access Denied</h2>" +
          "<p style='color:#94a3b8;font-size:16px;'>Invalid or missing Judge Key. The Judge Panel is private and restricted to authorized judges.</p></div>"
        );
      }
      return renderJudgePanel();
    }

    // ROUTE 2: SECURE SINGLE PARTICIPANT / TEAM STATUS LOOKUP
    if (params.action === "checkStatus") {
      const q = String(params.query || "").trim().toLowerCase();
      if (!q) {
        return jsonResponse_({ found: false, error: "Missing query identifier" }, 400);
      }

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
          const rows1 = data1.slice(1);
          const match1 = rows1.find(r => {
            const ref = String(r[0] || "").toLowerCase();
            const team = String(r[3] || "").toLowerCase();
            const email = String(r[5] || "").toLowerCase();
            return ref === q || team === q || email === q;
          });

          if (match1) {
            const refId = match1[0];
            const s1Status = match1[12] || "ROUND 1 SUBMITTED";
            if (!foundRecord) {
              foundRecord = {
                teamName: match1[3] || "Participant",
                type: match1[2] || "Team",
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
          const rows2 = data2.slice(1);
          const match2 = rows2.find(r => {
            const ref = String(r[0] || "").toLowerCase();
            const team = String(r[2] || "").toLowerCase();
            const email = String(r[3] || "").toLowerCase();
            return ref === q || team === q || email === q;
          });

          if (match2) {
            const finalStatus = match2[9] || "FINAL SUBMISSION RECEIVED";
            if (foundRecord) {
              foundRecord.status = finalStatus;
              foundRecord.finalRefId = match2[0];
            } else {
              foundRecord = {
                teamName: match2[2] || "Participant",
                type: "Team",
                status: finalStatus,
                finalRefId: match2[0]
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

    // ROUTE 3: DEFAULT SANITIZED PUBLIC PARTICIPANTS DIRECTORY
    // Reads ONLY from 'Form Responses 1' (Official Registration Sheet)
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
      const rawType = String(row[col.participationType] || "").trim().toUpperCase();
      const isTeam = rawType.includes("TEAM") || (row[col.teamName] && String(row[col.teamName]).trim() !== "");
      const typeLabel = isTeam ? "TEAM" : "INDIVIDUAL";

      let teamName = "";
      const rawTeamField = String(row[col.teamName] || "").trim();
      const rawTeamLower = rawTeamField.toLowerCase();
      const isInvalidTeamName = !rawTeamField || rawTeamLower === "individual" || rawTeamLower === "n/a" || rawTeamLower === "none" || rawTeamLower === "na" || rawTeamLower === "-";

      if (isTeam && !isInvalidTeamName) {
        teamName = rawTeamField;
      } else {
        // For individual participation or missing team name, display the registered participant's name
        teamName = String(row[col.fullName] || row[col.teamLeader] || rawTeamField || "Participant").trim();
      }

      if (!teamName || teamName.toLowerCase() === "individual") {
        teamName = String(row[col.fullName] || row[col.teamLeader] || "Participant").trim();
      }

      const normKey = teamName.toLowerCase();

      // Deduplicate teams so each team appears only once
      if (isTeam && seenTeams.has(normKey)) {
        return;
      }
      if (isTeam) {
        seenTeams.add(normKey);
      }

      publicList.push({
        id: publicList.length + 1,
        teamName: teamName,
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

    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // STAGE 1: IDEA SCREENING SUBMISSION (Round 1)
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
        solution, approach, pitchLink, "ROUND 1 SUBMITTED", "No"
      ]);

      updateRegistrationStatus_(ss, teamName, email, "ROUND 1 SUBMITTED");

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
    if (body.type === "Stage2_Final") {
      const teamName = String(body.teamName || "").trim();
      const email = String(body.email || "").trim();
      const track = String(body.track || "").trim();
      const projectTitle = String(body.projectTitle || "").trim();
      const githubUrl = String(body.githubUrl || "").trim();
      const demoUrl = String(body.demoUrl || "").trim();
      const description = String(body.description || "").trim();

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

      const eligibility = checkTeamEligibility_(ss, teamName, email);
      if (!eligibility.isEligible) {
        return jsonResponse_({
          success: false,
          error: eligibility.reason || "Round 2 Final Submission is available only to shortlisted/selected teams from Stage 1 Idea Screening.",
          currentStatus: eligibility.currentStatus
        }, 403);
      }

      let stage2Sheet = ss.getSheetByName(CONFIG.STAGE2_SHEET);
      if (!stage2Sheet) {
        stage2Sheet = ss.insertSheet(CONFIG.STAGE2_SHEET);
        stage2Sheet.appendRow([
          "Reference ID", "Timestamp (IST)", "Team Name", "Leader Email",
          "Track", "Project Title", "GitHub Repository", "Demo URL",
          "Description", "Final Evaluation Status", "Final Decision Email Sent"
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
        projectTitle, githubUrl, demoUrl, description, "FINAL SUBMISSION RECEIVED", "Pending"
      ]);

      updateRegistrationStatus_(ss, teamName, email, "FINAL SUBMISSION RECEIVED");

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
// 3. FINAL ROUND JUDGE PANEL INTERFACE & SERVER FUNCTIONS
// =========================================================
function renderJudgePanel() {
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
        .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; background: var(--panel); padding: 20px 24px; border-radius: 12px; border: 1px solid var(--border); flex-wrap: wrap; gap: 16px; }
        h1 { color: var(--primary); font-size: 22px; margin: 0; display: flex; align-items: center; gap: 10px; }
        .stats-bar { display: flex; gap: 12px; flex-wrap: wrap; }
        .stat-badge { background: #0f172a; border: 1px solid var(--border); padding: 6px 14px; border-radius: 20px; font-size: 13px; color: var(--muted); font-weight: 600; }
        .stat-badge span { color: var(--text); font-weight: 700; margin-left: 4px; }
        .table-container { background: var(--panel); border-radius: 12px; overflow-x: auto; border: 1px solid var(--border); }
        table { width: 100%; border-collapse: collapse; text-align: left; }
        th, td { padding: 14px 18px; border-bottom: 1px solid var(--border); font-size: 13.5px; vertical-align: middle; }
        th { background: #0f172a; color: var(--muted); text-transform: uppercase; font-size: 11.5px; letter-spacing: 0.5px; font-weight: 700; }
        tr:hover { background: #26334d; }
        .btn { padding: 7px 14px; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 12.5px; margin-right: 6px; margin-bottom: 4px; transition: all 0.2s; display: inline-flex; align-items: center; gap: 6px; }
        .btn-winner { background: #10b981; color: #fff; }
        .btn-winner:hover { background: #059669; }
        .btn-finalist { background: #a855f7; color: #fff; }
        .btn-finalist:hover { background: #9333ea; }
        .btn-reject { background: #ef4444; color: #fff; }
        .btn-reject:hover { background: #dc2626; }
        .badge { padding: 5px 11px; border-radius: 6px; font-size: 11.5px; font-weight: 700; display: inline-block; letter-spacing: 0.3px; }
        .badge-pending { background: rgba(245, 158, 11, 0.15); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.3); }
        .badge-winner { background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); }
        .badge-finalist { background: rgba(168, 85, 247, 0.15); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.3); }
        .badge-rejected { background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3); }
        .link { color: var(--primary); text-decoration: none; font-weight: 600; }
        .link:hover { text-decoration: underline; }
        .desc-text { color: var(--muted); font-size: 12.5px; line-height: 1.4; max-width: 260px; word-break: break-word; }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          <h1>🏆 AI Innovation Hackathon 2026 — Final Round Judge Panel</h1>
          <p style="margin:4px 0 0;font-size:13px;color:var(--muted)">Evaluating Stage 2 Final Projects • Final Round Decisions &amp; Result Dispatches</p>
        </div>
        <div class="stats-bar" id="statsBar">
          <div class="stat-badge">Total Final Submissions:<span id="cntTotal">0</span></div>
          <div class="stat-badge">Pending:<span id="cntPending" style="color:#fbbf24">0</span></div>
          <div class="stat-badge">Winners:<span id="cntWinners" style="color:#34d399">0</span></div>
          <div class="stat-badge">Finalists:<span id="cntFinalists" style="color:#c084fc">0</span></div>
          <div class="stat-badge">Not Selected:<span id="cntNotSelected" style="color:#f87171">0</span></div>
        </div>
      </div>

      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>Sl. No.</th>
              <th>Team Name</th>
              <th>Leader Email</th>
              <th>Track</th>
              <th>Project Title</th>
              <th>Deliverables</th>
              <th>Description</th>
              <th>Current Final Status</th>
              <th>Final Decision Action</th>
            </tr>
          </thead>
          <tbody id="table-body">
            <tr><td colspan="9" style="text-align:center;padding:40px;color:var(--muted)">Loading final project submissions from sheet...</td></tr>
          </tbody>
        </table>
      </div>

      <script>
        google.script.run
          .withSuccessHandler(renderRows)
          .withFailureHandler(function(err) {
            document.getElementById('table-body').innerHTML = '<tr><td colspan="9" style="color:#ef4444;padding:30px;text-align:center;">Error loading final submissions: ' + err.message + '</td></tr>';
          })
          .getJudgeData();

        function renderRows(data) {
          var tbody = document.getElementById('table-body');
          tbody.innerHTML = '';

          var total = 0, pending = 0, winners = 0, finalists = 0, notSelected = 0;

          if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:40px;color:var(--muted)">No Stage 2 final project submissions found in database.</td></tr>';
            updateStats(0, 0, 0, 0, 0);
            return;
          }

          total = data.length;

          data.forEach(function(row, idx) {
            var tr = document.createElement('tr');
            var statusBadge = '';
            var statusStr = (row.status || '').toUpperCase();
            
            if (statusStr.indexOf('WINNER') !== -1) {
              statusBadge = '<span class="badge badge-winner">🏆 WINNER</span>';
              winners++;
            } else if (statusStr.indexOf('FINALIST') !== -1) {
              statusBadge = '<span class="badge badge-finalist">⭐ FINALIST</span>';
              finalists++;
            } else if (statusStr.indexOf('NOT SELECTED') !== -1 || statusStr.indexOf('REJECTED') !== -1) {
              statusBadge = '<span class="badge badge-rejected">NOT SELECTED</span>';
              notSelected++;
            } else {
              statusBadge = '<span class="badge badge-pending">PENDING EVALUATION</span>';
              pending++;
            }

            var repoLink = row.githubUrl ? '<a href="' + escapeHtml(row.githubUrl) + '" target="_blank" rel="noopener" class="link">GitHub Repo 🔗</a>' : '<span style="color:var(--muted)">No Repo</span>';
            var demoLink = row.demoUrl ? '<br><a href="' + escapeHtml(row.demoUrl) + '" target="_blank" rel="noopener" class="link" style="color:#34d399">Live Demo 🚀</a>' : '';

            var descTrunc = escapeHtml(row.description || 'No description');
            if (descTrunc.length > 120) descTrunc = descTrunc.substring(0, 120) + '...';

            tr.innerHTML = \`
              <td style="font-weight:700;color:var(--muted)">\${(idx + 1 < 10 ? '0' : '') + (idx + 1)}</td>
              <td><strong>\${escapeHtml(row.teamName)}</strong></td>
              <td>\${escapeHtml(row.email)}</td>
              <td><span style="font-size:12px;color:var(--primary);font-weight:600">\${escapeHtml(row.track || 'General')}</span></td>
              <td><strong>\${escapeHtml(row.projectTitle || 'N/A')}</strong></td>
              <td>\${repoLink}\${demoLink}</td>
              <td><div class="desc-text" title="\${escapeHtml(row.description)}">\${descTrunc}</div></td>
              <td id="status-\${idx}">\${statusBadge}</td>
              <td id="action-\${idx}">
                <button class="btn btn-winner" onclick="makeDecision('\${escapeHtml(row.email)}', '\${escapeHtml(row.teamName)}', 'winner', \${idx})">🏆 Winner</button>
                <button class="btn btn-finalist" onclick="makeDecision('\${escapeHtml(row.email)}', '\${escapeHtml(row.teamName)}', 'finalist', \${idx})">⭐ Finalist</button>
                <button class="btn btn-reject" onclick="makeDecision('\${escapeHtml(row.email)}', '\${escapeHtml(row.teamName)}', 'not_selected', \${idx})">❌ Not Selected</button>
              </td>
            \`;
            tbody.appendChild(tr);
          });

          updateStats(total, pending, winners, finalists, notSelected);
        }

        function updateStats(total, pending, winners, finalists, notSelected) {
          document.getElementById('cntTotal').innerText = total;
          document.getElementById('cntPending').innerText = pending;
          document.getElementById('cntWinners').innerText = winners;
          document.getElementById('cntFinalists').innerText = finalists;
          document.getElementById('cntNotSelected').innerText = notSelected;
        }

        function makeDecision(email, teamName, decision, idx) {
          var labelMap = { 'winner': 'WINNER', 'finalist': 'FINALIST', 'not_selected': 'NOT SELECTED' };
          var targetLabel = labelMap[decision] || decision.toUpperCase();

          if (!confirm("Are you sure you want to set the final decision for team '" + teamName + "' to " + targetLabel + "?\\nThis will save the status and send a final-round result email.")) {
            return;
          }

          var actionTd = document.getElementById('action-' + idx);
          var statusTd = document.getElementById('status-' + idx);
          actionTd.innerHTML = '<em style="color:var(--muted);font-size:12px">Saving Decision &amp; Dispatching Email...</em>';

          google.script.run
            .withSuccessHandler(function(res) {
              if (res.savedInSheet) {
                if (decision === 'winner') {
                  statusTd.innerHTML = '<span class="badge badge-winner">🏆 WINNER</span>';
                } else if (decision === 'finalist') {
                  statusTd.innerHTML = '<span class="badge badge-finalist">⭐ FINALIST</span>';
                } else {
                  statusTd.innerHTML = '<span class="badge badge-rejected">NOT SELECTED</span>';
                }
                
                if (res.success) {
                  actionTd.innerHTML = '<span style="color:#34d399;font-weight:700">✅ Saved &amp; Email Sent</span>';
                } else {
                  actionTd.innerHTML = '<span style="color:#fbbf24;font-weight:700">⚠️ Saved (Email Failed)</span>';
                  alert('Decision saved in sheet, but email notification failed: ' + res.message);
                }
              } else {
                alert('Error saving decision: ' + res.message);
                restoreActionButtons(email, teamName, idx, actionTd);
              }
            })
            .withFailureHandler(function(err) {
              alert('Server Error: ' + err.message);
              restoreActionButtons(email, teamName, idx, actionTd);
            })
            .processJudgeDecision(email, decision);
        }

        function restoreActionButtons(email, teamName, idx, actionTd) {
          actionTd.innerHTML = 
            '<button class="btn btn-winner" onclick="makeDecision(\\\'' + email + '\\\', \\\'' + teamName + '\\\', \\\'winner\\\', ' + idx + ')">🏆 Winner</button>' +
            '<button class="btn btn-finalist" onclick="makeDecision(\\\'' + email + '\\\', \\\'' + teamName + '\\\', \\\'finalist\\\', ' + idx + ')">⭐ Finalist</button>' +
            '<button class="btn btn-reject" onclick="makeDecision(\\\'' + email + '\\\', \\\'' + teamName + '\\\', \\\'not_selected\\\', ' + idx + ')">❌ Not Selected</button>';
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

function getJudgeData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.STAGE2_SHEET); // MUST READ ONLY FROM FINAL SUBMISSIONS SHEET
  if (!sheet) return [];

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  const headers = data[0].map(h => String(h || "").toLowerCase().trim());

  const getColIdx = (candidates) => {
    return headers.findIndex(h => candidates.some(c => h.includes(c)));
  };

  const emailIdx = getColIdx(["leader email", "email address", "email", "contact"]);
  const teamIdx = getColIdx(["team name", "team", "leader", "name"]);
  const trackIdx = getColIdx(["track", "category"]);
  const titleIdx = getColIdx(["project title", "title", "project"]);
  const githubIdx = getColIdx(["github repository", "github", "repo", "source code"]);
  const demoIdx = getColIdx(["demo url", "demo", "deployment", "live"]);
  const descIdx = getColIdx(["description", "overview", "abstract"]);
  const statusIdx = getColIdx(["final evaluation status", "evaluation status", "status", "decision"]);

  const teamMap = new Map();

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const email = emailIdx !== -1 && row[emailIdx] ? String(row[emailIdx]).trim() : "";
    const teamName = teamIdx !== -1 && row[teamIdx] ? String(row[teamIdx]).trim() : ("Team " + i);
    const track = trackIdx !== -1 && row[trackIdx] ? String(row[trackIdx]).trim() : "General Track";
    const projectTitle = titleIdx !== -1 && row[titleIdx] ? String(row[titleIdx]).trim() : "Final Project";
    const githubUrl = githubIdx !== -1 && row[githubIdx] ? String(row[githubIdx]).trim() : "";
    const demoUrl = demoIdx !== -1 && row[demoIdx] ? String(row[demoIdx]).trim() : "";
    const description = descIdx !== -1 && row[descIdx] ? String(row[descIdx]).trim() : "";
    const status = statusIdx !== -1 && row[statusIdx] ? String(row[statusIdx]).trim() : "PENDING EVALUATION";

    if (!email && !teamName) continue;

    const key = teamName.toLowerCase() || email.toLowerCase();
    
    // Always take the latest submission if duplicate final submission rows exist for a team
    teamMap.set(key, {
      email: email,
      teamName: teamName,
      track: track,
      projectTitle: projectTitle,
      githubUrl: githubUrl,
      demoUrl: demoUrl,
      description: description,
      status: status
    });
  }

  return Array.from(teamMap.values());
}

function processJudgeDecision(email, decision) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.STAGE2_SHEET); // TARGETS FINAL SUBMISSIONS SHEET ONLY
  if (!sheet) return { success: false, savedInSheet: false, message: "Final Submissions sheet not found." };

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return { success: false, savedInSheet: false, message: "No final submissions data available." };

  const headers = data[0].map(h => String(h || "").toLowerCase().trim());

  let emailIdx = headers.findIndex(h => h.includes("email"));
  if (emailIdx === -1) emailIdx = 3;

  let teamIdx = headers.findIndex(h => h.includes("team name") || h.includes("team"));
  if (teamIdx === -1) teamIdx = 2;

  let statusIdx = headers.findIndex(h => h === "final evaluation status" || h.includes("evaluation status") || h.includes("status"));
  let emailSentIdx = headers.findIndex(h => h === "final decision email sent" || h.includes("decision email sent") || h.includes("email sent"));

  // Automatically create required columns if missing
  if (statusIdx === -1) {
    statusIdx = headers.length;
    sheet.getRange(1, statusIdx + 1).setValue("Final Evaluation Status");
    headers.push("final evaluation status");
  }
  if (emailSentIdx === -1) {
    emailSentIdx = headers.length;
    sheet.getRange(1, emailSentIdx + 1).setValue("Final Decision Email Sent");
    headers.push("final decision email sent");
  }

  const cleanEmail = String(email || "").trim().toLowerCase();
  const matchedRowIndices = [];
  let teamName = "";

  for (let i = 1; i < data.length; i++) {
    const rowEmail = data[i][emailIdx] ? String(data[i][emailIdx]).trim().toLowerCase() : "";
    const rowTeam = data[i][teamIdx] ? String(data[i][teamIdx]).trim().toLowerCase() : "";
    
    if (rowEmail === cleanEmail || (cleanEmail && rowTeam === cleanEmail)) {
      matchedRowIndices.push(i + 1);
      if (!teamName && data[i][teamIdx]) {
        teamName = String(data[i][teamIdx]).trim();
      }
    }
  }

  if (matchedRowIndices.length === 0) {
    return { success: false, savedInSheet: false, message: "Participant email or team name '" + cleanEmail + "' not found in Final Submissions." };
  }

  let finalStatus = "PENDING EVALUATION";
  if (decision === "winner") finalStatus = "WINNER";
  else if (decision === "finalist") finalStatus = "FINALIST";
  else if (decision === "not_selected") finalStatus = "NOT SELECTED";

  // Update Final Evaluation Status across all matching rows for the team in Final Submissions
  matchedRowIndices.forEach(rowNum => {
    sheet.getRange(rowNum, statusIdx + 1).setValue(finalStatus);
  });
  SpreadsheetApp.flush();

  // Send distinct Final Round Result Email (wrapped safely in try/catch)
  let emailResult = { success: false, error: "Email dispatch attempted" };
  try {
    emailResult = sendFinalResultEmail(cleanEmail, teamName || "Participant", decision);
  } catch (err) {
    emailResult = { success: false, error: err.toString() };
  }

  const emailStatusText = emailResult.success ? "Sent" : "Failed";
  matchedRowIndices.forEach(rowNum => {
    sheet.getRange(rowNum, emailSentIdx + 1).setValue(emailStatusText);
  });
  SpreadsheetApp.flush();

  if (emailResult.success) {
    return { success: true, savedInSheet: true, message: "Final decision saved and email sent successfully!" };
  } else {
    return { success: false, savedInSheet: true, message: "Decision saved to sheet, but email delivery failed: " + (emailResult.error || "MailApp error") };
  }
}

function sendFinalResultEmail(email, teamName, decision) {
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
function checkTeamEligibility_(ss, teamName, email) {
  const normTeam = String(teamName || "").toLowerCase().trim();
  const normEmail = String(email || "").toLowerCase().trim();

  const regSheet = ss.getSheetByName(CONFIG.STAGE1_SHEET) || ss.getSheetByName(CONFIG.REGISTRATION_SHEET);
  if (!regSheet) return { isEligible: false, reason: "Submissions sheet unavailable." };

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
    return { isEligible: false, reason: "Team or Leader email not found in official records." };
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
    if (status.includes("NOT SELECTED") || status.includes("REJECTED")) {
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
  const regSheet = ss.getSheetByName(CONFIG.STAGE1_SHEET) || ss.getSheetByName(CONFIG.REGISTRATION_SHEET);
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
