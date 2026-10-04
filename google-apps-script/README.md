# AI Innovation Hackathon 2026 — Backend & Email Automation Setup Guide
**Women in AI, Research, Innovation & Entrepreneurship Club**

This directory contains the production Google Apps Script backend that connects your static website with your Google Sheets database and delivers transactional email notifications throughout the 3-stage hackathon lifecycle.

---

## Architecture & Files

### 1. `hackathon-backend.gs` (Main REST Web App API)
- **`doGet(e)`**:
  - `?action=checkStatus&query=...`: Single-record status query returning ONLY the target team's status and Stage 2 eligibility flag. (Protects participant dataset privacy).
  - Default: Returns public participant directory to `participants.html` with emails, phone numbers, WhatsApp contacts, and internal notes **completely stripped**.
- **`doPost(e)`**:
  - `Stage1_Screening`: Validates fields & email syntax, checks for duplicates, appends row to `Stage 1 Submissions`, updates status to `ROUND 1 SUBMITTED`, generates server timestamp & `WAI-SCR-XXXXXX` reference code, and dispatches Round 1 receipt email.
  - `Stage2_Final`: Enforces **Server-Side Stage 2 Eligibility Gate** (verifies team status is `SHORTLISTED / SELECTED` or `FINAL SUBMISSION PENDING`), validates `github.com` repo URL, appends row to `Final Submissions`, updates status to `FINAL SUBMISSION RECEIVED`, generates server timestamp & `WAI-FIN-XXXXXX` reference code, and dispatches Round 2 confirmation email.
- **Exception Safety**: All `MailApp.sendEmail` calls are wrapped in `try/catch` guards so that daily Gmail quota limits never fail spreadsheet row insertion or block API responses.

### 2. `screening-emails.gs` (Organizer Google Sheets Batch Automation)
- Adds a custom **"Hackathon"** menu inside Google Sheets (`Hackathon → Send Screening Result Emails`).
- Allows organizers to trigger batch decision notifications (`SHORTLISTED / SELECTED`, `NOT SELECTED`, `FINALIST`, `WINNER`) directly from the spreadsheet interface.

---

## 5-Minute Setup Instructions for Club Organizers

1. Open the Google Sheet connected to your official Google Registration Form (`Form Responses 1`).
2. Go to **Extensions → Apps Script**.
3. Create two script files:
   - Create `hackathon-backend.gs` and paste the contents of [`hackathon-backend.gs`](file:///c:/Users/Banu/Downloads/women-in-ai-research-club-main-final-participants/women-in-ai-research-club-backup-pre-redesign/google-apps-script/hackathon-backend.gs).
   - Create `screening-emails.gs` and paste the contents of [`screening-emails.gs`](file:///c:/Users/Banu/Downloads/women-in-ai-research-club-main-final-participants/women-in-ai-research-club-backup-pre-redesign/google-apps-script/screening-emails.gs).
4. Click **Deploy → New deployment**.
5. Select **Web app**:
   - **Description**: *AI Innovation Hackathon 2026 Production API*
   - **Execute as**: *Me (Your Google Account)*
   - **Who has access**: *Anyone* (Enables static website fetch calls without requiring user Google logins).
6. Click **Deploy** and grant necessary permissions when prompted by Google.
7. Copy the generated **Web App URL** (e.g. `https://script.google.com/macros/s/AKfycb.../exec`).
8. If deploying a new Web App endpoint URL, update the `PARTICIPANT_API` constant in `js/hackathon.js` and `participants.html`.

---

## 10-Tier Status Workflow & Automated Emails

```
STAGE 0: REGISTRATION
  ↓ Registration Confirmation Email
STATUS: REGISTERED / UNDER REVIEW

STAGE 1: ROUND 1 IDEA SCREENING (19 Oct 2026)
  ↓ Round 1 Submission Confirmation Email (WAI-SCR-XXXXXX)
STATUS: ROUND 1 SUBMITTED

SCREENING & SHORTLISTING
  ├── Organizers set 'SHORTLISTED / SELECTED' → Selection Email → STATUS: SHORTLISTED / SELECTED / FINAL SUBMISSION PENDING
  └── Organizers set 'NOT SELECTED' → Not Selected Email → STATUS: NOT SELECTED (Round 2 Access Blocked)

STAGE 2: ROUND 2 FINAL PROJECT SUBMISSION (20 Oct 2026)
  ↓ Final Project Submission Confirmation Email (WAI-FIN-XXXXXX with GitHub Link)
STATUS: FINAL SUBMISSION RECEIVED

JURY EVALUATION & RESULTS (20 Oct 6:00 PM – 8:00 PM IST)
  ↓ Organizer publishes results
STATUS: UNDER EVALUATION → FINALIST → WINNER
```

---

## Expected Sheet Tabs & Columns

### 1. `Form Responses 1` (Registration Sheet)
`Timestamp` | `Full Name` | `Email Address` | `Participation Type` | `Team Name` | `Team Leader / Primary Contact Name` | `Team Members` | `Screening Status`

### 2. `Stage 1 Submissions`
`Reference ID` | `Timestamp (IST)` | `Participation Type` | `Team Name` | `Team Leader` | `Email` | `Phone` | `Track` | `Problem Statement` | `Proposed Solution` | `AI Approach` | `Pitch Link` | `Status`

### 3. `Final Submissions`
`Reference ID` | `Timestamp (IST)` | `Team Name` | `Leader Email` | `Track` | `Project Title` | `GitHub Repository` | `Demo URL` | `Description` | `Evaluation Status`
