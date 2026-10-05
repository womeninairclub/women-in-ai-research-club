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
 *   - ?panel=judge&key=WAI_JUDGE_2026 -> Protected Final Round Judge Panel UI
 *   - ?action=checkStatus&query=...   -> Single team status lookup & Stage 2 gate verification
 *   - Default                         -> Public sanitized roster from 'Form Responses 1'
 * - doPost():
 *   - Stage1_Screening -> Logs proposal to 'Stage 1 Submissions'
 *   - Stage2_Final     -> Server-side Stage 1 shortlist gate & logs to 'Final Submissions'
 * - Judge Panel:
 *   - Reads ONLY from 'Final Submissions'
 *   - Saves final decisions (WINNER, FINALIST, NOT SELECTED) to 'Final Evaluation Status'
 *   - Dispatches distinct Final Round Result Emails protected by try/catch
 * ============================================================================
 */
