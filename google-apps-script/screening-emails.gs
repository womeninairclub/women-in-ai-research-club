/**
 * AI Innovation Hackathon 2026
 * Screening-result email automation.
 *
 * Sheet columns used:
 *   Full Name
 *   Email Address
 *   Participation Type
 *   Team Name
 *   Team Leader / Primary Contact Name
 *   Screening Status
 *   Screening Email Sent
 *
 * Workflow:
 * 1. Complete the Screening Status for every individual/team.
 * 2. Run sendScreeningResultEmails() once.
 * 3. The script sends Selected / Not Selected emails and marks the related rows as Sent.
 *
 * For team registrations, rows with the same Team Name are treated as one decision.
 * All unique email addresses in that team receive the same screening result.
 */

const SCREENING_CONFIG = {
  SHEET_NAME: "Stage 1 Submissions", // Updated to Stage 1 Submissions sheet
  STATUS_SELECTED: ["selected", "shortlisted", "shortlisted / selected"],
  STATUS_NOT_SELECTED: ["not selected", "not shortlisted", "rejected"],
  SENT_VALUE: "Sent",
  WEBSITE_URL: "https://womeninairclub.github.io/women-in-ai-research-club/hackathon.html",
  CONTACT_EMAIL: "womeninairclub@gmail.com"
};

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Hackathon")
    .addItem("Send Screening Result Emails", "sendScreeningResultEmails")
    .addItem("Preview Pending Screening Emails", "previewScreeningResultEmails")
    .addToUi();
}

function sendScreeningResultEmails() {
  const sheet = getScreeningSheet_();
  const model = buildScreeningModel_(sheet);
  const results = processScreeningGroups_(sheet, model, false);

  SpreadsheetApp.getUi().alert(
    "Screening emails complete",
    `Sent: ${results.sent}\nSkipped: ${results.skipped}\nNeeds review: ${results.review}`,
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

function previewScreeningResultEmails() {
  const sheet = getScreeningSheet_();
  const model = buildScreeningModel_(sheet);
  const results = processScreeningGroups_(sheet, model, true);

  Logger.log(`Pending emails: ${results.pending}`);
  Logger.log(`Needs review: ${results.review}`);
  Logger.log(JSON.stringify(results.details, null, 2));

  SpreadsheetApp.getUi().alert(
    "Preview complete",
    `Pending emails: ${results.pending}\nNeeds review: ${results.review}\n\nOpen Executions / Logs for details.`,
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

function getScreeningSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SCREENING_CONFIG.SHEET_NAME) || ss.getSheetByName("Form Responses 1");
  if (!sheet) {
    throw new Error(`Sheet not found: ${SCREENING_CONFIG.SHEET_NAME}`);
  }
  return sheet;
}

function buildScreeningModel_(sheet) {
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return { headers: [], rows: [], groups: [] };

  const headers = data[0].map(h => String(h || "").trim());
  const col = findColumns_(headers);
  const rows = data.slice(1);
  const groups = new Map();

  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const type = normalize_(row[col.participationType]);
    const fullName = clean_(row[col.fullName]);
    const email = clean_(row[col.email]).toLowerCase();
    const teamName = clean_(row[col.teamName]);
    const teamLeader = clean_(row[col.teamLeader]);
    const screeningStatus = normalize_(row[col.screeningStatus]);
    const sent = normalize_(row[col.screeningEmailSent]) === normalize_(SCREENING_CONFIG.SENT_VALUE);

    const isTeam = type === "team" || (teamName && teamName.toLowerCase() !== "individual");
    const groupKey = isTeam
      ? `team:${normalize_(teamName || fullName)}`
      : `individual:${email || normalize_(fullName)}`;

    if (!groupKey || groupKey.endsWith(":")) return;

    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        isTeam,
        name: isTeam ? (teamName || fullName || "Team") : (fullName || "Participant"),
        rows: [],
        statuses: new Set(),
        emails: new Map(),
        teamLeader
      });
    }

    const group = groups.get(groupKey);
    group.rows.push({ rowNumber, row, sent, email, fullName, screeningStatus });
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
  const details = [];

  model.groups.forEach(group => {
    const statuses = [...group.statuses].filter(Boolean);

    if (!statuses.length) {
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
        const message = buildEmail_(group, decision, recipient.name);
        MailApp.sendEmail({
          to: recipient.email,
          subject: message.subject,
          htmlBody: message.htmlBody,
          body: message.textBody,
          name: "AI Innovation Hackathon 2026"
        });
        sent++;

        // Mark every row belonging to this recipient as sent immediately.
        group.rows
          .filter(item => item.email === recipient.email)
          .forEach(item => {
            sheet.getRange(item.rowNumber, model.col.screeningEmailSent + 1)
              .setValue(SCREENING_CONFIG.SENT_VALUE);
          });
      } catch (err) {
        Logger.log(`Failed to send email to ${recipient.email}: ${err.toString()}`);
      }
    });
  });

  return { sent, skipped, review, pending, details };
}

function buildEmail_(group, decision, recipientName) {
  const selected = decision === "SELECTED";
  const greeting = group.isTeam
    ? `Dear ${escapeHtml_(group.name)},`
    : `Dear ${escapeHtml_(recipientName || group.name)},`;

  const title = selected
    ? "Congratulations — your team has been selected"
    : "AI Innovation Hackathon 2026 — Screening Result";

  const paragraph = selected
    ? "We are pleased to inform you that your team has successfully cleared the Stage 1 screening for the AI Innovation Hackathon 2026. Your team is invited to proceed to the Main Hackathon on 20 October 2026."
    : "Thank you for participating in the AI Innovation Hackathon 2026. After the Stage 1 screening, your submission has not been selected to proceed to the Main Hackathon. We sincerely appreciate your interest and effort.";

  const nextStep = selected
    ? "Please follow the official hackathon website and communication channels for the next instructions, submission requirements and event updates."
    : "We encourage you to continue taking part in future activities and events organized by the Women in AI, Research, Innovation & Entrepreneurship Club.";

  const htmlBody = `
    <div style="font-family:Arial,sans-serif;line-height:1.65;color:#222;max-width:680px;margin:0 auto">
      <h2 style="margin-bottom:18px;color:${selected ? '#0284c7' : '#333'}">${escapeHtml_(title)}</h2>
      <p>${greeting}</p>
      <p>${paragraph}</p>
      <p>${nextStep}</p>
      <p><a href="${SCREENING_CONFIG.WEBSITE_URL}">Official Hackathon Website</a></p>
      <p style="margin-top:28px">Regards,<br><strong>AI Innovation Hackathon 2026 Organizing Team</strong><br>Women in AI, Research, Innovation &amp; Entrepreneurship Club</p>
      <p style="font-size:12px;color:#666">For official communication, contact ${SCREENING_CONFIG.CONTACT_EMAIL}.</p>
    </div>
  `;

  const textBody = `${title}\n\n${stripHtml_(greeting)}\n\n${paragraph}\n\n${nextStep}\n\nOfficial Hackathon Website: ${SCREENING_CONFIG.WEBSITE_URL}\n\nRegards,\nAI Innovation Hackathon 2026 Organizing Team\nWomen in AI, Research, Innovation & Entrepreneurship Club\n${SCREENING_CONFIG.CONTACT_EMAIL}`;

  return {
    subject: `AI Innovation Hackathon 2026 — Screening Result: ${selected ? "Selected" : "Not Selected"}`,
    htmlBody,
    textBody
  };
}

function findColumns_(headers) {
  const sheet = getScreeningSheet_();

  function getOrAdd(candidate) {
    let index = headers.findIndex(header => header.toLowerCase().trim().startsWith(candidate.toLowerCase().trim()));
    if (index !== -1) return index;
    
    // Add missing column header to Google Sheet automatically
    index = headers.length;
    sheet.getRange(1, index + 1).setValue(candidate);
    headers.push(candidate);
    return index;
  }

  return {
    fullName: getOrAdd("Full Name"),
    email: getOrAdd("Email Address"),
    participationType: getOrAdd("Participation Type"),
    teamName: getOrAdd("Team Name"),
    teamLeader: getOrAdd("Team Leader / Primary Contact Name"),
    screeningStatus: getOrAdd("Screening Status"),
    screeningEmailSent: getOrAdd("Screening Email Sent")
  };
}

function decisionType_(status) {
  if (SCREENING_CONFIG.STATUS_SELECTED.some(s => status.includes(s))) return "SELECTED";
  if (SCREENING_CONFIG.STATUS_NOT_SELECTED.some(s => status.includes(s))) return "NOT_SELECTED";
  return "";
}

function normalize_(value) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function clean_(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function escapeHtml_(value) {
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
