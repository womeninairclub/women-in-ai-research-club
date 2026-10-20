/**
 * ============================================================================
 * AUTHORITATIVE BACKEND NOTICE
 * ============================================================================
 * The SINGLE authoritative Google Apps Script backend implementation for the
 * AI Innovation Hackathon 2026 is located in:
 * 
 *   👉 code.gs (google-apps-script/code.gs)
 * 
 * To deploy the Web App backend:
 * 1. Open Google Apps Script (Extensions -> Apps Script from your Google Sheet).
 * 2. Copy the complete code from 'code.gs' into your Apps Script project editor.
 * 3. (Optional) For standalone Stage 1 screening email automation, copy 'screening-emails.gs'.
 * 4. DO NOT copy this notice file into your Apps Script project to prevent function collisions.
 * 
 * Summary of backend architecture in code.gs:
 * - doGet():
 *   - ?panel=judge&key=<CONFIGURED_JUDGE_KEY> -> Protected Interactive Judge Panel UI:
 *       * Tab 1: Round 1 Idea Screening (evaluates Stage 1 Submissions, delivers Shortlist / Not Selected emails, toggles shortlist publication)
 *       * Tab 2: Round 2 Final Evaluation (evaluates Final Submissions with WINNER / FINALIST / NOT SELECTED)
 *       * Tab 3: System Diagnostics (safe read-only operational health check)
 *   - ?action=checkStatus&query=...   -> Single team status lookup & Stage 2 gate verification
 *   - ?action=getRound1Submissions    -> Public submitted proposals directory from 'Stage 1 Submissions' (sanitized, zero private data)
 *   - ?action=diagnostics&key=...     -> Safe read-only JSON diagnostics report
 * - doPost():
 *   - Stage1_Screening -> Logs proposal to 'Stage 1 Submissions', generates WAI-SCR-XXXXXX ref ID, dispatches receipt
 *   - Stage2_Final     -> Server-side Stage 1 shortlist gate & logs to 'Final Submissions'
 *   - processRound1Decision -> HTTP POST decision endpoint with judge key auth
 *   - toggleShortlistPublish -> HTTP POST shortlist publication toggle with judge key auth
 * ============================================================================
 */
