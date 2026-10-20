/**
 * AI Innovation Hackathon 2026
 * Screening-result email automation & spreadsheet batch operations.
 *
 * Sheet columns used:
 *   Reference ID
 *   Full Name / Team Leader
 *   Email Address / Team Leader Email
 *   Participation Type
 *   Team Name
 *   Screening Status
 *   Screening Email Sent
 *
 * Workflow:
 * 1. Complete the Screening Status for submissions in 'Stage 1 Submissions'.
 * 2. Run sendScreeningResultEmails() to batch-deliver pending result emails.
 * 3. The script sends Shortlisted / Not Selected emails and marks rows as Sent (<timestamp> IST).
 */

const SCREENING_CONFIG = {
  SPREADSHEET_ID: "1y4NDp9Idoe92CoHg3RbF7BaTUJ-TLnQrwrf40sb5AUM",
  SHEET_NAME: "Stage 1 Submissions",
  STATUS_SELECTED: ["selected", "shortlisted", "shortlisted / selected"],
  STATUS_NOT_SELECTED: ["not selected", "not shortlisted", "rejected"],
  SENT_VALUE: "Sent",
  WEBSITE_URL: "https://womeninairclub.github.io/women-in-ai-research-club/hackathon.html",
  CONTACT_EMAIL: "womeninairclub@gmail.com"
};

function isAuthorizedScreeningCaller_(providedKey) {
  try {
    const ui = SpreadsheetApp.getUi();
    if (ui) return true;
  } catch (e) {
    // Throws exception when invoked outside of active Google Sheets container UI
  }
  if (typeof validateJudgeKey_ === "function") {
    return validateJudgeKey_(providedKey);
  }
  return false;
}

function onOpen() {
  try {
    SpreadsheetApp.getUi()
      .createMenu("Hackathon")
      .addItem("Send Screening Result Emails", "sendScreeningResultEmails")
      .addItem("Preview Pending Screening Emails", "previewScreeningResultEmails")
      .addSeparator()
      .addItem("Run System Diagnostics", "runDiagnosticsFromMenu")
      .addToUi();
  } catch (e) {
    // Non-UI context
  }
}

function sendScreeningResultEmails(optJudgeKey) {
  if (!isAuthorizedScreeningCaller_(optJudgeKey)) {
    throw new Error("Unauthorized: Administrative screening email delivery requires authorized credentials.");
  }
  const sheet = getScreeningSheet_();
  const model = buildScreeningModel_(sheet);
  const results = processScreeningGroups_(sheet, model, false);

  try {
    SpreadsheetApp.getUi().alert(
      "Screening emails complete",
      `Sent: ${results.sent}\nSkipped: ${results.skipped}\nNeeds review: ${results.review}\nFailed: ${results.failed || 0}`,
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  } catch (uiErr) {
    Logger.log(`Screening emails complete: Sent=${results.sent}, Skipped=${results.skipped}, Review=${results.review}`);
  }
}

function previewScreeningResultEmails(optJudgeKey) {
  if (!isAuthorizedScreeningCaller_(optJudgeKey)) {
    throw new Error("Unauthorized: Administrative preview requires authorized credentials.");
  }
  const sheet = getScreeningSheet_();
  const model = buildScreeningModel_(sheet);
  const results = processScreeningGroups_(sheet, model, true);

  Logger.log(`Pending emails: ${results.pending}`);
  Logger.log(`Needs review: ${results.review}`);
  Logger.log(JSON.stringify(results.details, null, 2));

  try {
    SpreadsheetApp.getUi().alert(
      "Preview complete",
      `Pending emails: ${results.pending}\nNeeds review: ${results.review}\n\nOpen Executions / Logs for details.`,
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  } catch (uiErr) {
    Logger.log(`Preview complete: Pending=${results.pending}, Review=${results.review}`);
  }
}

function runDiagnosticsFromMenu(optJudgeKey) {
  if (!isAuthorizedScreeningCaller_(optJudgeKey)) {
    throw new Error("Unauthorized: Diagnostics requires authorized credentials.");
  }
  const ss = SpreadsheetApp.openById(SCREENING_CONFIG.SPREADSHEET_ID);
  const s1Sheet = ss.getSheetByName(SCREENING_CONFIG.SHEET_NAME);
  const quota = MailApp.getRemainingDailyQuota();
  const rowCount = s1Sheet ? Math.max(0, s1Sheet.getLastRow() - 1) : 0;

  try {
    SpreadsheetApp.getUi().alert(
      "System Diagnostics",
      `Stage 1 Submissions: ${s1Sheet ? "Found (" + rowCount + " rows)" : "MISSING"}\nMailApp Remaining Quota: ${quota} emails\nTarget Spreadsheet: Connected (${ss.getName()})`,
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  } catch (uiErr) {
    Logger.log(`System Diagnostics: Stage1=${rowCount} rows, Quota=${quota}`);
  }
}

function getScreeningSheet_() {
  const ss = SpreadsheetApp.openById(SCREENING_CONFIG.SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SCREENING_CONFIG.SHEET_NAME) || ss.getSheetByName("Form Responses 1");
  if (!sheet) {
    throw new Error(`Sheet not found: ${SCREENING_CONFIG.SHEET_NAME}`);
  }
  return sheet;
}

function buildScreeningModel_(sheet) {
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return { headers: [], rows: [], groups: [] };

  const headers = data[0].map(h => String(h || "").trim());
  const col = findScreeningColumns_(headers);
  const rows = data.slice(1);
  const groups = new Map();

  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const refId = clean_(row[col.refId]);
    const type = normalize_(row[col.participationType]);
    const fullName = clean_(row[col.fullName]);
    const email = clean_(row[col.email]).toLowerCase();
    const teamName = clean_(row[col.teamName]);
    const teamLeader = clean_(row[col.teamLeader]);
    const screeningStatus = normalize_(row[col.screeningStatus]);
    const emailSentRaw = normalize_(row[col.screeningEmailSent]);
    const sent = emailSentRaw.startsWith("sent") || emailSentRaw === "yes";

    // Primary group key uses refId if available, fallback to team or individual email
    const isTeam = type === "team" || (teamName && teamName.toLowerCase() !== "individual");
    const groupKey = refId
      ? `ref:${refId}`
      : (isTeam ? `team:${normalize_(teamName || fullName)}` : `individual:${email || normalize_(fullName)}`);

    if (!groupKey || groupKey.endsWith(":")) return;

    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        refId,
        isTeam,
        name: isTeam ? (teamName || fullName || "Team") : (fullName || "Participant"),
        rows: [],
        statuses: new Set(),
        emails: new Map(),
        teamLeader
      });
    }

    const group = groups.get(groupKey);
    group.rows.push({ rowNumber, row, sent, email, fullName, screeningStatus, refId });
    if (screeningStatus) group.statuses.add(screeningStatus);

    if (email && !group.emails.has(email)) {
      group.emails.set(email, {
        email,
        name: isTeam ? (teamLeader || fullName || group.name) : (fullName || group.name),
        alreadySent: sent
      });
    } else if (email && group.emails.has(email) && sent) {
      group.emails.get(email).alreadySent = true;
    }
  });

  return { headers, col, rows, groups: [...groups.values()] };
}

function processScreeningGroups_(sheet, model, previewOnly) {
  let sent = 0;
  let skipped = 0;
  let review = 0;
  let pending = 0;
  let failed = 0;
  const details = [];

  const remainingQuota = MailApp.getRemainingDailyQuota();

  model.groups.forEach(group => {
    const statuses = [...group.statuses].filter(Boolean);

    if (!statuses.length) {
      skipped++;
      return;
    }

    // Skip PENDING EVALUATION from batch sending
    if (statuses.some(s => s.includes("pending") || s.includes("received") || s.includes("submitted"))) {
      skipped++;
      return;
    }

    if (statuses.length > 1) {
      review++;
      details.push({ group: group.name, action: "REVIEW", reason: "Conflicting screening statuses" });
      return;
    }

    const status = statuses[0];
    const decision = decisionType_(status);
    if (!decision) {
      skipped++;
      details.push({ group: group.name, action: "SKIP", reason: `Unsupported status: ${status}` });
      return;
    }

    const pendingRecipients = [...group.emails.values()].filter(item => !item.alreadySent);

    if (!pendingRecipients.length) {
      skipped++;
      return;
    }

    pending += pendingRecipients.length;
    details.push({
      group: group.name,
      decision,
      recipients: pendingRecipients.map(item => item.email),
      action: previewOnly ? "PREVIEW" : "SEND"
    });

    if (previewOnly) return;

    pendingRecipients.forEach(recipient => {
      try {
        if (MailApp.getRemainingDailyQuota() <= 0) {
          failed++;
          group.rows.forEach(item => {
            sheet.getRange(item.rowNumber, model.col.screeningEmailSent + 1)
              .setValue("Failed: Quota exhausted");
          });
          return;
        }

        const message = buildEmail_(group, decision, recipient.name);
        MailApp.sendEmail({
          to: recipient.email,
          subject: message.subject,
          htmlBody: message.htmlBody,
          body: message.textBody,
          name: "AI Innovation Hackathon 2026 Jury"
        });
        sent++;

        const nowIst = Utilities.formatDate(new Date(), "Asia/Kolkata", "yyyy-MM-dd HH:mm");
        const sentVal = `Sent (${nowIst} IST)`;
        group.rows
          .filter(item => item.email === recipient.email || !item.email)
          .forEach(item => {
            sheet.getRange(item.rowNumber, model.col.screeningEmailSent + 1)
              .setValue(sentVal);
          });
      } catch (err) {
        failed++;
        Logger.log(`Failed to send email to ${recipient.email}: ${err.toString()}`);
        group.rows
          .filter(item => item.email === recipient.email)
          .forEach(item => {
            sheet.getRange(item.rowNumber, model.col.screeningEmailSent + 1)
              .setValue(`Failed: ${String(err.message || err).substring(0, 100)}`);
          });
      }
    });
  });

  return { sent, skipped, review, pending, failed, details };
}

function buildEmail_(group, decision, recipientName) {
  const selected = decision === "SELECTED";
  const refCode = group.refId ? ` [${group.refId}]` : "";
  const greeting = group.isTeam
    ? `Dear ${escapeScreeningHtml_(group.name)},`
    : `Dear ${escapeScreeningHtml_(recipientName || group.name)},`;

  const title = selected
    ? "Congratulations — your team has been shortlisted for Stage 2!"
    : "AI Innovation Hackathon 2026 — Round 1 Screening Result";

  const paragraph = selected
    ? "We are pleased to inform you that your solution proposal has successfully cleared the Stage 1 screening for the AI Innovation Hackathon 2026. Your team is officially SHORTLISTED and invited to proceed to the Stage 2 Main Hackathon & Final Project Submission on 20 October 2026."
    : "Thank you for participating in the AI Innovation Hackathon 2026. After Stage 1 idea screening evaluation, your submission has not been selected to advance to Stage 2. We sincerely appreciate your interest, effort, and creative contribution.";

  const nextStep = selected
    ? `Please visit the official hackathon portal to review final submission guidelines and access the Stage 2 form: <br><a href="${SCREENING_CONFIG.WEBSITE_URL}#stage2" style="display:inline-block;margin-top:10px;padding:8px 16px;background:#0284c7;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold">Go to Stage 2 Submission ↗</a>`
    : "We encourage you to continue developing your ideas and taking part in future research workshops and challenges organized by the Women in AI, Research, Innovation & Entrepreneurship Club.";

  const htmlBody = `
    <div style="font-family:Arial,sans-serif;line-height:1.65;color:#222;max-width:680px;margin:0 auto;padding:24px;background:#f8fafc;border-radius:12px;border:1px solid #e2e8f0">
      <h2 style="margin-top:0;margin-bottom:18px;color:${selected ? '#0284c7' : '#334155'}">${escapeScreeningHtml_(title)}</h2>
      <p>${greeting}</p>
      <p>${paragraph}</p>
      ${group.refId ? `<p style="background:#ecfdf5;border-left:4px solid #10b981;padding:10px 14px;border-radius:4px"><strong>Reference Code:</strong> <span style="font-family:monospace;font-weight:bold">${escapeScreeningHtml_(group.refId)}</span></p>` : ""}
      <p>${nextStep}</p>
      <p style="margin-top:28px">Warm regards,<br><strong>AI Innovation Hackathon 2026 Organizing Committee &amp; Screening Jury</strong><br>Women in AI, Research, Innovation &amp; Entrepreneurship Club</p>
      <p style="font-size:12px;color:#666">For inquiries, contact ${SCREENING_CONFIG.CONTACT_EMAIL}.</p>
    </div>
  `;

  const textBody = `${title}\n\n${stripHtml_(greeting)}\n\n${paragraph}\n\n${stripHtml_(nextStep)}\n\nPortal: ${SCREENING_CONFIG.WEBSITE_URL}\n\nRegards,\nAI Innovation Hackathon 2026 Organizing Committee\n${SCREENING_CONFIG.CONTACT_EMAIL}`;

  return {
    subject: `AI Innovation Hackathon 2026 — Stage 1 Screening Result: ${selected ? "Shortlisted" : "Not Selected"}${refCode}`,
    htmlBody,
    textBody
  };
}

function findScreeningColumns_(headers) {
  const sheet = getScreeningSheet_();

  function getOrAdd(candidate, aliases) {
    const searchTerms = [candidate, ...(aliases || [])];
    for (let i = 0; i < searchTerms.length; i++) {
      const term = searchTerms[i].toLowerCase().trim();
      const index = headers.findIndex(header => {
        const h = String(header || "").toLowerCase().trim();
        return h === term || h.includes(term);
      });
      if (index !== -1) return index;
    }

    const index = headers.length;
    sheet.getRange(1, index + 1).setValue(candidate);
    headers.push(candidate);
    return index;
  }

  return {
    refId: getOrAdd("Reference ID", ["ref id", "reference", "id"]),
    fullName: getOrAdd("Full Name", ["Team Leader / Primary Contact Name", "Participant / Team Name", "Participant Name", "Name"]),
    email: getOrAdd("Email Address", ["Email", "Contact Email", "Team Leader Email"]),
    participationType: getOrAdd("Participation Type", ["Type"]),
    teamName: getOrAdd("Team Name"),
    teamLeader: getOrAdd("Team Leader / Primary Contact Name", ["Team Leader", "Leader Name"]),
    screeningStatus: getOrAdd("Screening Status", ["Status", "Screening"]),
    screeningEmailSent: getOrAdd("Screening Email Sent", ["Email Sent"])
  };
}

function decisionType_(status) {
  const norm = normalize_(status);
  if (!norm) return "";
  if (SCREENING_CONFIG.STATUS_NOT_SELECTED.some(s => norm.includes(s))) return "NOT_SELECTED";
  if (SCREENING_CONFIG.STATUS_SELECTED.some(s => norm.includes(s))) return "SELECTED";
  return "";
}

function normalize_(value) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function clean_(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function escapeScreeningHtml_(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function stripHtml_(value) {
  return String(value ?? "").replace(/<[^>]*>/g, "");
}
