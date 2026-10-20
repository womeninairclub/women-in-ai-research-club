const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

console.log('===================================================================');
console.log('AI INNOVATION HACKATHON 2026 — DEEP WORKFLOW & SECURITY VERIFICATION');
console.log('===================================================================');

// Load script contents
const codeGsPath = path.join(__dirname, '../google-apps-script/code.gs');
const screeningGsPath = path.join(__dirname, '../google-apps-script/screening-emails.gs');
const codeGsContent = fs.readFileSync(codeGsPath, 'utf8');
const screeningGsContent = fs.readFileSync(screeningGsPath, 'utf8');

function createDeepMockEnv(opts = {}) {
  const scriptProperties = new Map(Object.entries(opts.properties || {}));
  const mailSentLog = [];
  const logEntries = [];

  const mockSpreadsheet = {
    getName: () => 'AI Innovation Hackathon 2026 DB',
    getId: () => '1y4NDp9Idoe92CoHg3RbF7BaTUJ-TLnQrwrf40sb5AUM',
    sheets: new Map(),
    getSheetByName(name) { return this.sheets.get(name) || null; },
    insertSheet(name) {
      const s = createMockSheet(name);
      this.sheets.set(name, s);
      return s;
    }
  };

  function createMockSheet(name, initialData = []) {
    let rows = initialData.map(r => [...r]);
    return {
      name,
      getName: () => name,
      getLastRow: () => rows.length,
      getLastColumn: () => rows.length > 0 ? rows[0].length : 0,
      getDataRange: () => ({
        getValues: () => rows.map(r => [...r])
      }),
      appendRow: (row) => { rows.push([...row]); },
      getRange: (r, c, numR = 1, numC = 1) => ({
        setValue: (val) => {
          while (rows.length < r) rows.push([]);
          while (rows[r - 1].length < c) rows[r - 1].push('');
          rows[r - 1][c - 1] = val;
        },
        getValue: () => (rows[r - 1] && rows[r - 1][c - 1] !== undefined) ? rows[r - 1][c - 1] : '',
        getValues: () => {
          const res = [];
          for (let i = 0; i < numR; i++) {
            const rowArr = [];
            for (let j = 0; j < numC; j++) {
              rowArr.push((rows[r - 1 + i] && rows[r - 1 + i][c - 1 + j] !== undefined) ? rows[r - 1 + i][c - 1 + j] : '');
            }
            res.push(rowArr);
          }
          return res;
        }
      })
    };
  }

  // Preload test data
  mockSpreadsheet.sheets.set('Stage 1 Submissions', createMockSheet('Stage 1 Submissions', [
    ['Reference ID', 'Timestamp (IST)', 'Participation Type', 'Team Name', 'Team Leader / Primary Contact Name', 'Email Address', 'Phone', 'Track', 'Problem Statement', 'Proposed Solution', 'AI Approach', 'Pitch Link', 'Screening Status', 'Screening Email Sent', 'Reviewer Notes'],
    ['WAI-SCR-001', '2026-10-19 14:00:00', 'Team', 'Neural Innovators', 'Alice Sharma', 'alice@neural.com', '+919876543210', 'AI Healthcare', 'Early diagnostic AI', 'Deep learning', 'CNN + ViT', 'https://pitch.link/1', 'SHORTLISTED', 'Not Sent', 'Outstanding project'],
    ['WAI-SCR-002', '2026-10-19 14:15:00', 'Team', 'Visionary AI', 'Bob Patel', 'bob@vision.com', '+919876543211', 'EdTech AI', 'Adaptive tutoring', 'NLP model', 'Transformers', 'https://pitch.link/2', 'NOT SELECTED', 'Not Sent', 'Lacks AI novelty'],
    ['WAI-SCR-003', '2026-10-19 14:30:00', 'Individual', 'Solo Solver', 'Carol Sen', 'carol@solo.com', '+919876543212', 'Climate AI', 'Carbon tracking', 'Satellite analysis', 'Segmentation', 'https://pitch.link/3', 'PENDING EVALUATION', 'Not Sent', '']
  ]));

  mockSpreadsheet.sheets.set('Form Responses 1', createMockSheet('Form Responses 1', [
    ['Timestamp', 'Full Name / Team Leader', 'Email Address', 'Participation Type', 'Team Name', 'Team Size', 'Phone Number', 'Screening Status'],
    ['10/18/2026 10:00:00', 'Alice Sharma', 'alice@neural.com', 'Team', 'Neural Innovators', '4', '+919876543210', 'SHORTLISTED'],
    ['10/18/2026 10:30:00', 'Bob Patel', 'bob@vision.com', 'Team', 'Visionary AI', '3', '+919876543211', 'NOT SELECTED'],
    ['10/18/2026 11:00:00', 'Carol Sen', 'carol@solo.com', 'Individual', 'Solo Solver', '1', '+919876543212', 'REGISTERED']
  ]));

  const finalSubSheet = createMockSheet('Form responses 1', [
    ['Timestamp', 'Team Name', 'Problem Statement', 'GitHub Repository URL', 'Demo Video URL', 'Live Demo URL', 'Declaration', 'Final Evaluation Status', 'Final Decision Email Sent']
  ]);
  mockSpreadsheet.sheets.set('Form responses 1', finalSubSheet);
  mockSpreadsheet.sheets.set('Final Submissions', finalSubSheet);

  const ctx = {
    SpreadsheetApp: {
      openById: (id) => mockSpreadsheet,
      getUi: () => {
        if (opts.inSheetsUI === false) {
          throw new Error('Cannot call SpreadsheetApp.getUi() from this context.');
        }
        return {
          alert: (title, msg) => { logEntries.push(`UI Alert: ${title} - ${msg}`); },
          createMenu: () => ({ addItem: () => ({ addSeparator: () => ({ addItem: () => ({ addToUi: () => {} }) }) }) }),
          ButtonSet: { OK: 'OK' }
        };
      },
      flush: () => {}
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => scriptProperties.get(k) || null,
        setProperty: (k, v) => { scriptProperties.set(k, String(v)); },
        deleteProperty: (k) => { scriptProperties.delete(k); }
      })
    },
    MailApp: {
      sendEmail: (opts) => {
        mailSentLog.push(opts);
      },
      getRemainingDailyQuota: () => 100
    },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: (txt) => ({
        content: txt,
        mimeType: '',
        setMimeType(m) { this.mimeType = m; return this; }
      })
    },
    HtmlService: {
      XFrameOptionsMode: { ALLOWALL: 'ALLOWALL', DEFAULT: 'DEFAULT' },
      createHtmlOutput: (html) => ({
        html,
        frameMode: 'DEFAULT',
        setXFrameOptionsMode(mode) { this.frameMode = mode; return this; }
      })
    },
    CacheService: {
      getScriptCache: () => {
        const cStore = {};
        return {
          get: (k) => cStore[k] || null,
          put: (k, v) => { cStore[k] = String(v); },
          remove: (k) => { delete cStore[k]; }
        };
      }
    },
    Utilities: {
      formatDate: (d, tz, fmt) => '2026-10-19 20:00:00',
      base64EncodeWebSafe: (bytes) => Buffer.from(bytes).toString('base64url'),
      DigestAlgorithm: { SHA_256: 'SHA_256' },
      computeDigest: (algo, str) => {
        const crypto = require('crypto');
        return crypto.createHash('sha256').update(String(str)).digest();
      }
    },
    Logger: {
      log: (msg) => { logEntries.push(String(msg)); }
    },
    console: {
      log: () => {},
      error: () => {},
      warn: () => {}
    },
    Date: Date,
    JSON: JSON,
    Math: Math,
    String: String,
    Array: Array,
    Set: Set,
    Map: Map,
    Error: Error
  };

  vm.createContext(ctx);
  vm.runInContext(codeGsContent, ctx);
  vm.runInContext(screeningGsContent, ctx);

  return { ctx, mockSpreadsheet, scriptProperties, mailSentLog, logEntries };
}

// -------------------------------------------------------------
// VERIFICATION SUITE
// -------------------------------------------------------------

// CHECK 1: isAuthorizedScreeningCaller_
console.log('\n--- CHECK 1: isAuthorizedScreeningCaller_ Security & Legitimate Access ---');
{
  // Case A: Inside Google Sheets UI (Organizer clicked menu item in sheet)
  const envUI = createDeepMockEnv({ inSheetsUI: true });
  assert.strictEqual(envUI.ctx.isAuthorizedScreeningCaller_(), true, 'Organizer in Sheets UI must be authorized');
  console.log('  [PASS] 1A: Legitimate organizer inside Google Sheets UI is authorized without extra prompt');

  // Case B: Outside Google Sheets UI (e.g. web app context / google.script.run)
  const envNoUI = createDeepMockEnv({
    inSheetsUI: false,
    properties: { JUDGE_KEY: 'SuperSecretKey2026_Secure12345!' }
  });
  assert.strictEqual(envNoUI.ctx.isAuthorizedScreeningCaller_(), false, 'Unauthenticated caller outside UI must be DENIED');
  assert.strictEqual(envNoUI.ctx.isAuthorizedScreeningCaller_(''), false, 'Empty key outside UI must be DENIED');
  assert.strictEqual(envNoUI.ctx.isAuthorizedScreeningCaller_('WAI_JUDGE_2026'), false, 'Revoked legacy key outside UI must be DENIED');
  assert.strictEqual(envNoUI.ctx.isAuthorizedScreeningCaller_('wrong_key'), false, 'Wrong key outside UI must be DENIED');
  assert.strictEqual(envNoUI.ctx.isAuthorizedScreeningCaller_('SuperSecretKey2026_Secure12345!'), true, 'Authorized organizer with valid key outside UI is permitted');
  console.log('  [PASS] 1B: External caller outside Sheets UI cannot bypass isAuthorizedScreeningCaller_');

  // Case C: sendScreeningResultEmails blocks unauthorized caller without sending emails
  assert.throws(() => {
    envNoUI.ctx.sendScreeningResultEmails();
  }, /Unauthorized/, 'Must throw unauthorized error');
  assert.strictEqual(envNoUI.mailSentLog.length, 0, 'Zero emails must be sent on unauthorized attempt');
  console.log('  [PASS] 1C: sendScreeningResultEmails strictly enforces guard and sends zero emails');
}

// CHECK 2: Newly configured secret works & legacy secrets rejected
console.log('\n--- CHECK 2: Judge Authentication Secret Lifecycle ---');
{
  const env = createDeepMockEnv({ properties: {} });
  
  // A: Unconfigured -> Denies all
  assert.strictEqual(env.ctx.validateJudgeKey_('any_key'), false);
  console.log('  [PASS] 2A: Unconfigured Script Properties denies all authentication by default');

  // B: Rotate to strong key using rotation helper
  const newSecret = env.ctx.generateCryptographicJudgeKey_();
  assert(newSecret.length >= 32, 'Cryptographic key should be at least 32 chars');
  env.ctx.setJudgeKeyInProperties_(newSecret);
  assert.strictEqual(env.scriptProperties.get('JUDGE_KEY'), newSecret);
  console.log('  [PASS] 2B: Successfully rotated JUDGE_KEY using setJudgeKeyInProperties_');

  // C: Verify new secret authenticates
  assert.strictEqual(env.ctx.validateJudgeKey_(newSecret), true, 'New secret must authenticate');
  assert.strictEqual(env.ctx.validateJudgeKey_(newSecret + 'x'), false, 'Tampered secret must fail');
  assert.strictEqual(env.ctx.validateJudgeKey_('WAI_JUDGE_2026'), false, 'Revoked legacy secret must fail');
  console.log('  [PASS] 2C: New secret authenticates successfully, variations and legacy keys rejected');

  // D: Defense-in-depth: Even if an organizer accidentally attempts to set WAI_JUDGE_2026 in properties
  assert.throws(() => {
    env.ctx.setJudgeKeyInProperties_('WAI_JUDGE_2026');
  }, /Security Violation/, 'Setting legacy key must throw');
  console.log('  [PASS] 2D: setJudgeKeyInProperties_ refuses to store revoked historical credential');
}

// CHECK 3: Stage 2 Shortlist Verification Gate
console.log('\n--- CHECK 3: Stage 2 Eligibility Gate Verification ---');
{
  const env = createDeepMockEnv({
    properties: { JUDGE_KEY: 'SuperSecretKey2026_Secure12345!' }
  });
  const ss = env.mockSpreadsheet;

  // Case A: Legitimate Shortlisted Team
  const legitCheck = env.ctx.checkTeamEligibility_(ss, 'Neural Innovators', 'alice@neural.com');
  assert.strictEqual(legitCheck.isEligible, true, 'Shortlisted team with registered email must be eligible');
  console.log('  [PASS] 3A: Legitimate shortlisted team (Neural Innovators, alice@neural.com) is eligible');

  // Case B: Attacker uses shortlisted team name with attacker email
  const hijackCheck1 = env.ctx.checkTeamEligibility_(ss, 'Neural Innovators', 'attacker@evil.com');
  assert.strictEqual(hijackCheck1.isEligible, false, 'Spoofed email must be rejected');
  console.log('  [PASS] 3B: Attacker email with legitimate team name is strictly rejected');

  // Case C: Attacker uses registered leader email with attacker team name
  const hijackCheck2 = env.ctx.checkTeamEligibility_(ss, 'Evil Team 666', 'alice@neural.com');
  assert.strictEqual(hijackCheck2.isEligible, false, 'Spoofed team name must be rejected');
  console.log('  [PASS] 3C: Attacker team name with legitimate leader email is strictly rejected');

  // Case D: Legitimate Not-Selected Team
  const notSelectedCheck = env.ctx.checkTeamEligibility_(ss, 'Visionary AI', 'bob@vision.com');
  assert.strictEqual(notSelectedCheck.isEligible, false, 'Not-selected team must not be eligible');
  assert(notSelectedCheck.reason.includes('Not Selected'), 'Reason must indicate not selected');
  console.log('  [PASS] 3D: Not-selected team (Visionary AI) is cleanly blocked from Stage 2');

  // Case E: Pending evaluation team
  const pendingCheck = env.ctx.checkTeamEligibility_(ss, 'Solo Solver', 'carol@solo.com');
  assert.strictEqual(pendingCheck.isEligible, false, 'Pending team must not be eligible until shortlisted');
  console.log('  [PASS] 3E: Pending evaluation team (Solo Solver) is blocked from Stage 2');
}

// CHECK 4: Public Endpoints Zero-PII Audit
console.log('\n--- CHECK 4: Public Endpoints Zero-PII Audit ---');
{
  const env = createDeepMockEnv({
    properties: {
      ROUND1_SHORTLIST_PUBLISHED: 'true',
      ROUND1_SHOW_NOT_SELECTED: 'true'
    }
  });

  // Test Route 1B: getRound1Submissions
  const res1B = env.ctx.doGet({ parameter: { action: 'getRound1Submissions' } });
  const data1B = JSON.parse(res1B.content);
  assert(data1B.success === true);
  assert(data1B.submissions.length > 0);
  data1B.submissions.forEach(sub => {
    assert.strictEqual(sub.email, undefined, 'Email MUST NOT be present in public response');
    assert.strictEqual(sub.phone, undefined, 'Phone MUST NOT be present in public response');
    assert.strictEqual(sub.pitchLink, undefined, 'Pitch Link MUST NOT be present in public response');
    assert.strictEqual(sub.solution, undefined, 'Solution MUST NOT be present in public response');
    assert.strictEqual(sub.approach, undefined, 'Approach MUST NOT be present in public response');
    assert.strictEqual(sub.reviewerNotes, undefined, 'Notes MUST NOT be present in public response');
  });
  console.log('  [PASS] 4A: getRound1Submissions strictly returns allowlisted public fields only');

  // Test Route 2: checkStatus
  const resStatus = env.ctx.doGet({ parameter: { action: 'checkStatus', query: 'Neural Innovators' } });
  const dataStatus = JSON.parse(resStatus.content);
  assert.strictEqual(dataStatus.found, true);
  assert.strictEqual(dataStatus.email, undefined, 'Email MUST NOT be exposed in checkStatus');
  assert.strictEqual(dataStatus.phone, undefined, 'Phone MUST NOT be exposed in checkStatus');
  assert.strictEqual(dataStatus.pitchLink, undefined, 'Pitch Link MUST NOT be exposed in checkStatus');
  console.log('  [PASS] 4B: checkStatus returns only verification status and reference ID (Zero PII)');

  // Test Route 3: default roster
  const resRoster = env.ctx.doGet({ parameter: {} });
  const dataRoster = JSON.parse(resRoster.content);
  assert(Array.isArray(dataRoster));
  dataRoster.forEach(sub => {
    assert.strictEqual(sub.email, undefined, 'Email MUST NOT be present in public roster');
    assert.strictEqual(sub.phone, undefined, 'Phone MUST NOT be present in public roster');
    assert.strictEqual(sub.pitchLink, undefined, 'Pitch Link MUST NOT be present in public roster');
  });
  console.log('  [PASS] 4C: Default public roster strictly returns allowlisted public fields only');
}

// CHECK 5: API Contracts & Workflows
console.log('\n--- CHECK 5: Frontend-to-Backend API Contracts & Time Gating ---');
{
  const env = createDeepMockEnv({});

  // Route 0: getReleaseKey
  const resKey = env.ctx.doGet({ parameter: { action: 'getReleaseKey' } });
  const dataKey = JSON.parse(resKey.content);
  assert.strictEqual(typeof dataKey.unlocked, 'boolean');
  assert.strictEqual(typeof dataKey.serverTimeIST, 'string');
  console.log('  [PASS] 5A: getReleaseKey API contract confirmed (unlocked=' + dataKey.unlocked + ')');

  // Feedback Submission
  const fbRes = env.ctx.doPost({
    postData: {
      contents: JSON.stringify({
        type: 'Feedback_Submission',
        name: 'Tester',
        email: 'tester@example.com',
        category: 'General',
        message: 'Platform runs smoothly!'
      })
    }
  });
  const fbData = JSON.parse(fbRes.content);
  assert.strictEqual(fbData.success, true);
  console.log('  [PASS] 5B: Feedback API contract confirmed and recorded');
}

console.log('\n===================================================================');
console.log('ALL DEEP VERIFICATION CHECKS PASSED SUCCESSFULLY (100%)');
console.log('===================================================================\n');
