/**
 * AI INNOVATION HACKATHON 2026 — AUTOMATED SECURITY AUDIT TEST SUITE
 * 
 * Verifies server-side authorization, secret rotation, input sanitization,
 * PII isolation, and submission gate enforcement against synthetic mock data.
 * 
 * STRICT DEFENSIVE POSTURE:
 * - NO live external network calls
 * - NO real participant data
 * - NO emails dispatched
 * - NO production sheet mutations
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

// 1. Build Isolated Mock Apps Script Environment
function createMockEnvironment(initialProperties = {}, mockTimeMs = null) {
  const propertiesStore = Object.assign({}, initialProperties);
  const cacheStore = {};
  const sentEmails = [];
  const logMessages = [];

  // In-Memory Sheet Mock
  class MockRange {
    constructor(sheet, row, col, numRows = 1, numCols = 1) {
      this.sheet = sheet;
      this.row = row;
      this.col = col;
      this.numRows = numRows;
      this.numCols = numCols;
    }
    getValue() {
      const vals = this.getValues();
      return (vals[0] && vals[0][0]) !== undefined ? vals[0][0] : "";
    }
    getValues() {
      const out = [];
      for (let r = 0; r < this.numRows; r++) {
        const rowVals = [];
        const rIdx = this.row - 1 + r;
        for (let c = 0; c < this.numCols; c++) {
          const cIdx = this.col - 1 + c;
          const val = (this.sheet.data[rIdx] && this.sheet.data[rIdx][cIdx] !== undefined)
            ? this.sheet.data[rIdx][cIdx]
            : "";
          rowVals.push(val);
        }
        out.push(rowVals);
      }
      return out;
    }
    setValue(val) {
      this.setValues([[val]]);
      return this;
    }
    setValues(matrix) {
      for (let r = 0; r < matrix.length; r++) {
        const rIdx = this.row - 1 + r;
        while (this.sheet.data.length <= rIdx) {
          this.sheet.data.push([]);
        }
        for (let c = 0; c < matrix[r].length; c++) {
          const cIdx = this.col - 1 + c;
          while (this.sheet.data[rIdx].length <= cIdx) {
            this.sheet.data[rIdx].push("");
          }
          this.sheet.data[rIdx][cIdx] = matrix[r][c];
        }
      }
      return this;
    }
  }

  class MockSheet {
    constructor(name, data = []) {
      this.name = name;
      this.data = JSON.parse(JSON.stringify(data));
    }
    getName() { return this.name; }
    getLastRow() { return this.data.length; }
    getLastColumn() {
      let maxCols = 0;
      for (const row of this.data) {
        if (row.length > maxCols) maxCols = row.length;
      }
      return maxCols;
    }
    getDataRange() {
      const numRows = Math.max(1, this.getLastRow());
      const numCols = Math.max(1, this.getLastColumn());
      return new MockRange(this, 1, 1, numRows, numCols);
    }
    getRange(row, col, numRows = 1, numCols = 1) {
      return new MockRange(this, row, col, numRows, numCols);
    }
    appendRow(rowArray) {
      this.data.push([...rowArray]);
      return this;
    }
  }

  class MockSpreadsheet {
    constructor() {
      this.sheets = {};
    }
    getSheetByName(name) {
      return this.sheets[name] || null;
    }
    insertSheet(name) {
      const sh = new MockSheet(name, []);
      this.sheets[name] = sh;
      return sh;
    }
    getName() { return "Synthetic Test Database"; }
  }

  const mockSpreadsheet = new MockSpreadsheet();

  // Populate synthetic sheets
  mockSpreadsheet.sheets["Stage 1 Submissions"] = new MockSheet("Stage 1 Submissions", [
    [
      "Reference ID", "Timestamp (IST)", "Participation Type", "Team Name",
      "Team Leader / Primary Contact Name", "Email Address", "Phone", "Track", "Problem Statement",
      "Proposed Solution", "AI Approach", "Pitch Link", "Screening Status", "Screening Email Sent", "Reviewer Notes"
    ],
    [
      "WAI-SCR-SYN001", "2026-10-18 10:00:00", "Team", "Synthetic Alpha",
      "Alice Leader", "alice.synth@example.org", "+919999900001", "AI/ML", "Challenge 01",
      "Synthetic solution text", "Synthetic approach", "https://pitch.example.org", "SHORTLISTED", "Sent", "Excellent"
    ],
    [
      "WAI-SCR-SYN002", "2026-10-18 11:00:00", "Team", "Synthetic Beta",
      "Bob Leader", "bob.synth@example.org", "+919999900002", "Biomedical", "Challenge 02",
      "Synthetic beta solution", "Synthetic approach", "https://pitch.example.org", "NOT SELECTED", "Sent", "Not feasible"
    ],
    [
      "WAI-SCR-SYN003", "2026-10-18 12:00:00", "Team", "Synthetic Gamma",
      "Charlie Leader", "charlie.synth@example.org", "+919999900003", "XAI", "Challenge 03",
      "Synthetic gamma solution", "Synthetic approach", "https://pitch.example.org", "PENDING EVALUATION", "Not Sent", ""
    ]
  ]);

  const finalSubSheet = new MockSheet("Form responses 1", [
    [
      "Timestamp", "Participant / Team Name", "Selected Problem Statement", "GitHub Repository URL",
      "Final Project Demo Video", "Live Demo / Deployment Link", "Final Submission Declaration",
      "Final Evaluation Status", "Final Decision Email Sent"
    ],
    [
      "2026-10-20 12:00:00", "Synthetic Alpha", "Challenge 01", "https://github.com/synthetic/alpha-repo",
      "https://demo.example.org", "https://demo.example.org", "Deliverables verified", "PENDING EVALUATION", "Not Sent"
    ]
  ]);
  mockSpreadsheet.sheets["Form responses 1"] = finalSubSheet;
  mockSpreadsheet.sheets["Final Submissions"] = finalSubSheet;

  mockSpreadsheet.sheets["Form Responses 1"] = new MockSheet("Form Responses 1", [
    [
      "Timestamp", "Full Name", "Email Address", "Participation Type", "Team Name",
      "Team Leader / Primary Contact Name", "Team Members", "Screening Status"
    ],
    [
      "2026-10-10 10:00:00", "Alice Leader", "alice.synth@example.org", "Team", "Synthetic Alpha",
      "Alice Leader", "Member 1, Member 2", "SHORTLISTED"
    ]
  ]);

  // Apps Script Global Services
  const sandbox = {
    Logger: {
      log: (...args) => { logMessages.push(args.join(" ")); }
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (key) => propertiesStore[key] || null,
        setProperty: (key, val) => { propertiesStore[key] = String(val); },
        getProperties: () => ({ ...propertiesStore })
      })
    },
    SpreadsheetApp: {
      openById: (id) => mockSpreadsheet,
      getActiveSpreadsheet: () => mockSpreadsheet,
      getUi: () => {
        throw new Error("SpreadsheetApp.getUi() cannot be invoked from web app context");
      },
      flush: () => {}
    },
    MailApp: {
      sendEmail: (params) => {
        sentEmails.push(params);
        return true;
      },
      getRemainingDailyQuota: () => 100
    },
    HtmlService: {
      XFrameOptionsMode: {
        ALLOWALL: "ALLOWALL",
        DEFAULT: "DEFAULT"
      },
      createHtmlOutput: (content) => ({
        content: content,
        mode: "DEFAULT",
        setXFrameOptionsMode: function(m) { this.mode = m; return this; },
        getContent: function() { return this.content; }
      })
    },
    ContentService: {
      MimeType: { JSON: "JSON" },
      createTextOutput: (text) => ({
        text: text,
        mime: "JSON",
        data: (() => { try { return JSON.parse(text); } catch(e) { return text; } })(),
        setMimeType: function(m) { this.mime = m; return this; },
        getContent: function() { return this.text; }
      })
    },
    ScriptApp: {
      getService: () => ({
        getUrl: () => "https://script.google.com/macros/s/TEST/exec"
      })
    },
    CacheService: {
      getScriptCache: () => ({
        get: (key) => cacheStore[key] || null,
        put: (key, val, ttl) => { cacheStore[key] = String(val); },
        remove: (key) => { delete cacheStore[key]; }
      })
    },
    Utilities: {
      formatDate: (date, tz, format) => {
        return "2026-10-19 12:00:00";
      },
      base64EncodeWebSafe: (bytes) => {
        return Buffer.from(bytes).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      },
      DigestAlgorithm: { SHA_256: "SHA_256" },
      computeDigest: (algo, str) => {
        const crypto = require('crypto');
        return crypto.createHash('sha256').update(String(str)).digest();
      }
    },
    MockLockOrScriptLock_: () => ({
      tryLock: () => true,
      releaseLock: () => {}
    }),
    LockService: {
      getScriptLock: () => ({
        tryLock: () => true,
        releaseLock: () => {}
      })
    },
    Date: class MockDate extends Date {
      constructor(...args) {
        if (args.length === 0 && mockTimeMs !== null) {
          super(mockTimeMs);
        } else {
          super(...args);
        }
      }
      static now() {
        return mockTimeMs !== null ? mockTimeMs : Date.now();
      }
      static parse(str) {
        return Date.parse(str);
      }
    },
    JSON: JSON,
    String: String,
    Array: Array,
    Object: Object,
    Set: Set,
    Map: Map,
    Math: Math,
    Buffer: Buffer,
    sentEmails,
    logMessages,
    mockSpreadsheet,
    propertiesStore
  };

  return sandbox;
}

// 2. Load and Compile code.gs into Sandbox
function loadBackendCode(sandbox) {
  const codePath = path.join(__dirname, '..', 'google-apps-script', 'code.gs');
  const code = fs.readFileSync(codePath, 'utf8');
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  return sandbox;
}

// 3. Test Runner
async function runAllTests() {
  console.log("===================================================================");
  console.log("AI INNOVATION HACKATHON 2026 — COMPREHENSIVE SECURITY TEST SUITE");
  console.log("===================================================================");

  const VALID_JUDGE_SECRET = "Secr3t_Jury_Auth_Key_2026_xYz987!#";
  let passed = 0;
  let total = 0;

  function runTest(testName, testFn) {
    total++;
    try {
      testFn();
      console.log(`  [PASS] ${testName}`);
      passed++;
    } catch (err) {
      console.error(`  [FAIL] ${testName}`);
      console.error(`         Reason: ${err.message}`);
    }
  }

  // Group 1: Judge Authentication & Credential Boundary
  console.log("\n--- TEST GROUP 1: Judge Authentication & Credential Security ---");

  runTest("1.1 Missing Judge Key Denies Access", () => {
    const env = loadBackendCode(createMockEnvironment({ JUDGE_KEY: VALID_JUDGE_SECRET }));
    const res = env.validateJudgeKey_(undefined);
    assert.strictEqual(res, false, "Missing judge key must be denied.");
  });

  runTest("1.2 Empty String / Null Judge Key Denies Access", () => {
    const env = loadBackendCode(createMockEnvironment({ JUDGE_KEY: VALID_JUDGE_SECRET }));
    assert.strictEqual(env.validateJudgeKey_(""), false, "Empty key must be denied.");
    assert.strictEqual(env.validateJudgeKey_("   "), false, "Whitespace-only key must be denied.");
    assert.strictEqual(env.validateJudgeKey_(null), false, "Null key must be denied.");
  });

  runTest("1.3 Incorrect / Tampered Judge Key Denies Access", () => {
    const env = loadBackendCode(createMockEnvironment({ JUDGE_KEY: VALID_JUDGE_SECRET }));
    assert.strictEqual(env.validateJudgeKey_("WRONG_KEY_12345"), false, "Incorrect key must be denied.");
    assert.strictEqual(env.validateJudgeKey_(VALID_JUDGE_SECRET.substring(0, 10)), false, "Truncated key must be denied.");
    assert.strictEqual(env.validateJudgeKey_(VALID_JUDGE_SECRET + "extra"), false, "Appended key must be denied.");
  });

  runTest("1.4 Revoked Historical Credential (WAI_JUDGE_2026) is Hard Rejected", () => {
    const env = loadBackendCode(createMockEnvironment({ JUDGE_KEY: VALID_JUDGE_SECRET }));
    const res = env.validateJudgeKey_("WAI_JUDGE_2026");
    assert.strictEqual(res, false, "Revoked key WAI_JUDGE_2026 must be denied.");
    assert.ok(env.logMessages.some(m => m.includes("SECURITY ALERT")), "Security alert must be logged for revoked key.");
  });

  runTest("1.5 Revoked Historical Credential Cannot Be Stored in Script Properties", () => {
    const env = loadBackendCode(createMockEnvironment({ JUDGE_KEY: VALID_JUDGE_SECRET }));
    assert.throws(() => {
      env.setJudgeKeyInProperties_("WAI_JUDGE_2026");
    }, /revoked/, "Re-storing revoked credential must throw error.");
  });

  runTest("1.6 Short / Weak Judge Key Rejected During Rotation", () => {
    const env = loadBackendCode(createMockEnvironment({ JUDGE_KEY: VALID_JUDGE_SECRET }));
    assert.throws(() => {
      env.setJudgeKeyInProperties_("short_key_123");
    }, /at least 16 characters/, "Short judge key must be rejected.");
  });

  runTest("1.7 Unconfigured Server Properties Denies Access by Default", () => {
    const env = loadBackendCode(createMockEnvironment({})); // Empty properties
    assert.strictEqual(env.validateJudgeKey_("ANY_KEY"), false, "Must deny by default when JUDGE_KEY is unset.");
    assert.strictEqual(env.validateJudgeKey_(""), false, "Must deny when key is unset and input is empty.");
  });

  runTest("1.8 Valid Judge Key Grants Authorization", () => {
    const env = loadBackendCode(createMockEnvironment({ JUDGE_KEY: VALID_JUDGE_SECRET }));
    assert.strictEqual(env.validateJudgeKey_(VALID_JUDGE_SECRET), true, "Valid key must be granted access.");
  });

  runTest("1.9 Brute-Force Lockout Defense Blocks Access After 5 Consecutive Failures", () => {
    const env = loadBackendCode(createMockEnvironment({ JUDGE_KEY: VALID_JUDGE_SECRET }));
    // Attempt 5 failed authentications
    for (let i = 0; i < 5; i++) {
      assert.strictEqual(env.validateJudgeKey_("WRONG_KEY_ATTEMPT_" + i), false);
    }
    // Now even the valid secret must be locked out until cooldown
    assert.strictEqual(env.validateJudgeKey_(VALID_JUDGE_SECRET), false, "Must lock out even valid secret during active lockout.");
    assert.ok(env.logMessages.some(m => m.includes("brute-force lockout")), "Brute-force lockout alert must be logged.");
  });

  runTest("1.10 Ephemeral Judge Session Token Lifecycle & Validation", () => {
    const env = loadBackendCode(createMockEnvironment({ JUDGE_KEY: VALID_JUDGE_SECRET }));
    const token = env.createJudgeSessionToken_();
    assert.ok(token.startsWith("wai_sess_"), "Session token must have expected prefix.");
    assert.strictEqual(env.validateJudgeKey_(token), true, "Active session token must grant authorization.");
    assert.strictEqual(env.validateJudgeKey_(token + "_tampered"), false, "Tampered session token must be rejected.");
  });

  // Group 2: Unauthorized Data Retrieval & PII Protection
  console.log("\n--- TEST GROUP 2: Private Data Protection & Endpoint Authorization ---");

  runTest("2.1 Unauthorized getRound1JudgeData Throws Access Denied", () => {
    const env = loadBackendCode(createMockEnvironment({ JUDGE_KEY: VALID_JUDGE_SECRET }));
    assert.throws(() => {
      env.getRound1JudgeData("INVALID_KEY");
    }, /Unauthorized/, "Invalid key must throw unauthorized exception.");
  });

  runTest("2.2 Unauthorized getJudgeData Throws Access Denied", () => {
    const env = loadBackendCode(createMockEnvironment({ JUDGE_KEY: VALID_JUDGE_SECRET }));
    assert.throws(() => {
      env.getJudgeData("INVALID_KEY");
    }, /Unauthorized/, "Invalid key must throw unauthorized exception for Round 2 data.");
  });

  runTest("2.3 Public getRound1Submissions Strips Emails, Phones & Pitch Links", () => {
    const env = loadBackendCode(createMockEnvironment({
      JUDGE_KEY: VALID_JUDGE_SECRET,
      ROUND1_SHORTLIST_PUBLISHED: "true"
    }));
    const res = env.doGet({ parameter: { action: "getRound1Submissions" } });
    const payload = res.data;
    assert.ok(payload.success, "Public call must succeed.");
    assert.ok(payload.submissions.length > 0, "Submissions must be returned.");

    for (const sub of payload.submissions) {
      assert.strictEqual(sub.email, undefined, "Email must not exist in public submission record.");
      assert.strictEqual(sub.phone, undefined, "Phone must not exist in public submission record.");
      assert.strictEqual(sub.pitchLink, undefined, "Pitch link must not exist in public submission record.");
      assert.strictEqual(sub.notes, undefined, "Reviewer notes must not exist in public submission record.");
      assert.strictEqual(sub.solution, undefined, "Proposed solution must not exist in public submission record.");
    }
  });

  runTest("2.4 Public Status Lookup (checkStatus) Masks Private Fields", () => {
    const env = loadBackendCode(createMockEnvironment({
      JUDGE_KEY: VALID_JUDGE_SECRET,
      ROUND1_SHORTLIST_PUBLISHED: "true"
    }));
    const res = env.doGet({ parameter: { action: "checkStatus", query: "alice.synth@example.org" } });
    const payload = res.data;
    assert.strictEqual(payload.found, true, "Record should be found.");
    assert.strictEqual(payload.email, undefined, "Email must not be echoed in response.");
    assert.strictEqual(payload.phone, undefined, "Phone must not be echoed in response.");
    assert.strictEqual(payload.pitchLink, undefined, "Pitch link must not be echoed in response.");
  });

  runTest("2.5 Unpublished Shortlist Decisions Are Hidden from Public Views", () => {
    const env = loadBackendCode(createMockEnvironment({
      JUDGE_KEY: VALID_JUDGE_SECRET,
      ROUND1_SHORTLIST_PUBLISHED: "false" // Unpublished draft mode
    }));

    // Check public list
    const resList = env.doGet({ parameter: { action: "getRound1Submissions" } });
    for (const sub of resList.data.submissions) {
      assert.ok(!sub.status.includes("SHORTLISTED"), "Shortlist status must not appear while unpublished.");
      assert.ok(!sub.status.includes("NOT SELECTED"), "Not Selected status must not appear while unpublished.");
    }

    // Check single query lookup
    const resStatus = env.doGet({ parameter: { action: "checkStatus", query: "Synthetic Alpha" } });
    assert.strictEqual(resStatus.data.eligibleForStage2, false, "Stage 2 eligibility must remain false while unpublished.");
    assert.ok(!resStatus.data.status.includes("SHORTLISTED"), "Status must not disclose shortlist while unpublished.");
  });

  runTest("2.6 Diagnostics Endpoint Zero-PII Output Test", () => {
    const env = loadBackendCode(createMockEnvironment({ JUDGE_KEY: VALID_JUDGE_SECRET }));
    const report = env.runJudgeDiagnostics(VALID_JUDGE_SECRET);
    assert.strictEqual(report.success, true, "Diagnostics must run successfully with valid key.");
    const reportStr = JSON.stringify(report);
    assert.ok(!reportStr.includes("alice.synth@example.org"), "Diagnostics output must not contain participant emails.");
    assert.ok(!reportStr.includes("+919999900001"), "Diagnostics output must not contain participant phone numbers.");
  });

  runTest("2.7 External Web Caller Cannot Trigger Batch Screening Emails", () => {
    const env = loadBackendCode(createMockEnvironment({ JUDGE_KEY: VALID_JUDGE_SECRET }));
    const res = env.doPost({ postData: { contents: JSON.stringify({ type: "sendScreeningResultEmails" }) } });
    assert.strictEqual(res.statusCode, 400, "Must reject arbitrary execution of batch email functions.");
    assert.strictEqual(env.sentEmails.length, 0, "No emails must be dispatched by unauthorized endpoint calls.");
  });

  // Group 3: Mutation Protection & Submission Gate Enforcement
  console.log("\n--- TEST GROUP 3: Mutation Protection & Submission Gate Enforcement ---");

  runTest("3.1 Unauthorized Judge Decision Mutation via POST Denied", () => {
    const env = loadBackendCode(createMockEnvironment({ JUDGE_KEY: VALID_JUDGE_SECRET }));
    const postPayload = {
      type: "processRound1Decision",
      judgeKey: "BAD_KEY",
      refId: "WAI-SCR-SYN001",
      decision: "not_selected"
    };
    const res = env.doPost({ postData: { contents: JSON.stringify(postPayload) } });
    assert.strictEqual(res.data.success, false, "Unauthorized mutation must fail.");
    assert.strictEqual(res.data.savedInSheet, false, "Must not modify sheet without authorization.");
  });

  runTest("3.2 Unauthorized Shortlist Publication Toggle via POST Denied", () => {
    const env = loadBackendCode(createMockEnvironment({ JUDGE_KEY: VALID_JUDGE_SECRET }));
    const postPayload = {
      type: "toggleShortlistPublish",
      judgeKey: "BAD_KEY",
      isPublished: true
    };
    const res = env.doPost({ postData: { contents: JSON.stringify(postPayload) } });
    assert.strictEqual(res.data.success, false, "Unauthorized publication toggle must fail.");
    assert.strictEqual(env.propertiesStore.ROUND1_SHORTLIST_PUBLISHED, undefined, "Script property must not be toggled.");
  });

  runTest("3.3 Stage 2 Eligibility Gate: Spoofing Attempt Denied (Team Name Only with Attacker Email)", () => {
    const env = loadBackendCode(createMockEnvironment({ JUDGE_KEY: VALID_JUDGE_SECRET }));
    // Attacker knows shortlisted team 'Synthetic Alpha', but provides attacker email
    const spoofAttempt = env.checkTeamEligibility_(env.mockSpreadsheet, "Synthetic Alpha", "attacker@evil.com");
    assert.strictEqual(spoofAttempt.isEligible, false, "Eligibility must be denied when email does not match registered team leader.");
  });

  runTest("3.4 Stage 2 Eligibility Gate: Spoofing Attempt Denied (Attacker Team Name with Victim Email)", () => {
    const env = loadBackendCode(createMockEnvironment({ JUDGE_KEY: VALID_JUDGE_SECRET }));
    const spoofAttempt = env.checkTeamEligibility_(env.mockSpreadsheet, "Evil Hijack Team", "alice.synth@example.org");
    assert.strictEqual(spoofAttempt.isEligible, false, "Eligibility must be denied when team name does not match registered record.");
  });

  runTest("3.5 Stage 2 Eligibility Gate: Ineligible Non-Shortlisted Team Blocked", () => {
    const env = loadBackendCode(createMockEnvironment({ JUDGE_KEY: VALID_JUDGE_SECRET }));
    // 'Synthetic Beta' was rejected/not selected
    const res = env.checkTeamEligibility_(env.mockSpreadsheet, "Synthetic Beta", "bob.synth@example.org");
    assert.strictEqual(res.isEligible, false, "Non-shortlisted team must be rejected from Stage 2.");
  });

  runTest("3.6 Stage 2 Eligibility Gate: Legitimate Shortlisted Team Allowed", () => {
    const env = loadBackendCode(createMockEnvironment({ JUDGE_KEY: VALID_JUDGE_SECRET }));
    const res = env.checkTeamEligibility_(env.mockSpreadsheet, "Synthetic Alpha", "alice.synth@example.org");
    assert.strictEqual(res.isEligible, true, "Verified shortlisted team must pass eligibility check.");
  });

  runTest("3.7 Duplicate Submission Protection in Stage 1", () => {
    // Simulate time before 19:30 IST deadline
    const preDeadlineMs = Date.parse("2026-10-19T14:00:00+05:30");
    const env = loadBackendCode(createMockEnvironment({ JUDGE_KEY: VALID_JUDGE_SECRET }, preDeadlineMs));
    const dupPayload = {
      type: "Stage1_Screening",
      teamName: "Synthetic Alpha", // already exists
      leaderName: "Alice Leader",
      email: "alice.synth@example.org",
      track: "AI/ML",
      statement: "Challenge 01",
      solution: "New solution text",
      approach: "New approach"
    };
    const res = env.doPost({ postData: { contents: JSON.stringify(dupPayload) } });
    assert.strictEqual(res.data.alreadySubmitted, true, "Duplicate submission must be recognized.");
  });

  runTest("3.8 Server-Side Strict Deadline Enforcement Blocks Stage 1 Submissions After Cutoff", () => {
    // Simulate time AFTER 19:30 IST deadline
    const postDeadlineMs = Date.parse("2026-10-19T20:00:00+05:30");
    const env = loadBackendCode(createMockEnvironment({ JUDGE_KEY: VALID_JUDGE_SECRET }, postDeadlineMs));
    const payload = {
      type: "Stage1_Screening",
      teamName: "Late Team",
      leaderName: "Late Leader",
      email: "late@example.org",
      track: "AI/ML",
      statement: "Challenge 01",
      solution: "Late solution",
      approach: "Late approach"
    };
    const res = env.doPost({ postData: { contents: JSON.stringify(payload) } });
    assert.strictEqual(res.statusCode, 403, "Submissions after deadline must be rejected with 403.");
    assert.strictEqual(res.data.success, false, "Must return success: false.");
    assert.ok(res.data.error.includes("deadline has passed"), "Error message must state deadline has passed.");
  });

  // Group 4: Input Validation, Injection & Error Shielding
  console.log("\n--- TEST GROUP 4: Input Validation, XSS & Error Shielding ---");

  runTest("4.1 Malformed / Non-JSON POST Body Handled Gracefully", () => {
    const env = loadBackendCode(createMockEnvironment({ JUDGE_KEY: VALID_JUDGE_SECRET }));
    const res = env.doPost({ postData: { contents: "{ malformed json ... ;;" } });
    assert.strictEqual(res.statusCode, 400, "Malformed JSON must return 400 Bad Request.");
    assert.strictEqual(res.data.success, false, "Must return success=false.");
  });

  runTest("4.2 XSS Payload in Input is Escaped in Email Templates", () => {
    const preDeadlineMs = Date.parse("2026-10-19T14:00:00+05:30");
    const env = loadBackendCode(createMockEnvironment({ JUDGE_KEY: VALID_JUDGE_SECRET }, preDeadlineMs));
    const xssPayload = {
      type: "Stage1_Screening",
      teamName: "TestXSS <script>alert('pwned')</script>",
      leaderName: "Attacker <img src=x onerror=alert(1)>",
      email: "clean.xss.test@example.com",
      track: "AI/ML",
      statement: "Challenge 01 <script>eval('xss')</script>",
      solution: "Valid solution",
      approach: "Valid approach"
    };
    const res = env.doPost({ postData: { contents: JSON.stringify(xssPayload) } });
    assert.strictEqual(res.data.success, true, "Submission processed.");
    const lastEmail = env.sentEmails[env.sentEmails.length - 1];
    assert.ok(lastEmail, "Receipt email captured.");
    assert.ok(!lastEmail.htmlBody.includes("<script>"), "Script tags must be escaped in HTML email body.");
    assert.ok(!lastEmail.htmlBody.includes("<img src=x onerror"), "Image error tags must be escaped in HTML body.");
  });

  runTest("4.3 Internal Exceptions Do Not Leak Stack Traces or DB IDs to Public", () => {
    const env = loadBackendCode(createMockEnvironment({ JUDGE_KEY: VALID_JUDGE_SECRET }));
    // Force an internal error by breaking SpreadsheetApp
    env.SpreadsheetApp.openById = () => { throw new Error("Internal Database Connection Timeout at /srv/secrets/db.cfg:42"); };
    
    // GET request error shielding
    const resGet = env.doGet({ parameter: { action: "getRound1Submissions" } });
    assert.strictEqual(resGet.statusCode, 500, "Must return 500 on internal exception.");
    assert.ok(!resGet.data.error.includes("secrets"), "Must not leak internal paths or secrets.");
    assert.ok(!resGet.data.error.includes("db.cfg"), "Must not leak configuration details.");

    // POST request error shielding
    const resPost = env.doPost({ postData: { contents: JSON.stringify({ type: "Feedback_Submission", name: "A", email: "a@a.com", message: "Hi" }) } });
    assert.strictEqual(resPost.statusCode, 500, "Must return 500 on internal exception.");
    assert.ok(!resPost.data.error.includes("secrets"), "Must not leak internal paths or secrets in POST error.");
  });

  runTest("4.4 Input Sanitization Strips Control Characters & Enforces Length Bounds", () => {
    const env = loadBackendCode(createMockEnvironment({ JUDGE_KEY: VALID_JUDGE_SECRET }));
    const dirtyPayload = {
      type: "Feedback_Submission",
      name: "Alice\x00\x08Evil\x1F",
      email: "alice@test.org",
      category: "A".repeat(500), // Oversized string
      message: "Hello World\x00\x0C"
    };
    const res = env.doPost({ postData: { contents: JSON.stringify(dirtyPayload) } });
    assert.strictEqual(res.data.success, true, "Sanitized payload must succeed.");
    const fbSheet = env.SpreadsheetApp.openById("").getSheetByName("Feedback");
    assert.ok(fbSheet, "Feedback sheet created.");
    const lastRow = fbSheet.data[fbSheet.data.length - 1];
    assert.strictEqual(lastRow[1], "AliceEvil", "Null bytes and control chars must be stripped.");
    assert.ok(lastRow[3].length <= 80, "Oversized category must be truncated to 80 chars.");
    assert.strictEqual(lastRow[4], "Hello World", "Control characters stripped from message.");
  });

  runTest("4.5 MailApp Quota Protection Safeguards Organizer Daily Limit", () => {
    const preDeadlineMs = Date.parse("2026-10-19T14:00:00+05:30");
    const env = loadBackendCode(createMockEnvironment({ JUDGE_KEY: VALID_JUDGE_SECRET }, preDeadlineMs));
    // Simulate low remaining quota (<= 5)
    env.MailApp.getRemainingDailyQuota = () => 3;
    const submissionPayload = {
      type: "Stage1_Screening",
      teamName: "Quota Protected Team",
      leaderName: "Leader Q",
      email: "quota@test.org",
      track: "AI/ML",
      statement: "Challenge 01",
      solution: "Valid solution",
      approach: "Valid approach"
    };
    const res = env.doPost({ postData: { contents: JSON.stringify(submissionPayload) } });
    assert.strictEqual(res.data.success, true, "Row must still be recorded in database.");
    assert.strictEqual(res.data.emailSent, false, "Email delivery must be skipped when quota is critical.");
    assert.ok(env.logMessages.some(m => m.includes("quota low")), "Quota warning must be logged.");
  });

  // Group 5: Interface Security & Clickjacking Protection
  console.log("\n--- TEST GROUP 5: Interface Security & Clickjacking Protection ---");

  runTest("5.1 Judge Key Entry Screen Uses POST and DEFAULT Frame Protection", () => {
    const env = loadBackendCode(createMockEnvironment({ JUDGE_KEY: VALID_JUDGE_SECRET }));
    const htmlOutput = env.renderJudgeKeyEntryScreen_();
    assert.strictEqual(htmlOutput.mode, "DEFAULT", "Frame mode must be DEFAULT to prevent clickjacking.");
    const content = htmlOutput.getContent();
    assert.ok(content.includes('method="POST"'), "Auth form must use POST method to keep key out of URLs.");
    assert.ok(!content.includes('method="GET"'), "Auth form must not use GET method.");
  });

  runTest("5.2 Judge Panel Dashboard Enforces DEFAULT Frame Protection", () => {
    const env = loadBackendCode(createMockEnvironment({ JUDGE_KEY: VALID_JUDGE_SECRET }));
    const htmlOutput = env.renderJudgePanel_(VALID_JUDGE_SECRET, "1");
    assert.strictEqual(htmlOutput.mode, "DEFAULT", "Judge panel must use DEFAULT XFrameOptionsMode.");
  });

  runTest("5.3 Judge Panel Function Rejects Direct Call with Invalid Key", () => {
    const env = loadBackendCode(createMockEnvironment({ JUDGE_KEY: VALID_JUDGE_SECRET }));
    const htmlOutput = env.renderJudgePanel_("INVALID_KEY", "1");
    const content = htmlOutput.getContent();
    assert.ok(content.includes("Judge Authorization"), "Direct call with invalid key must return password entry screen.");
    assert.ok(!content.includes("loadRound1Data"), "Private judge panel logic must not be rendered without valid key.");
  });

  console.log("\n===================================================================");
  console.log(`TEST RESULTS: ${passed} / ${total} TESTS PASSED (${((passed / total) * 100).toFixed(1)}%)`);
  console.log("===================================================================");

  if (passed !== total) {
    process.exit(1);
  }
}

runAllTests().catch(err => {
  console.error("Test Suite Fatal Error:", err);
  process.exit(1);
});
