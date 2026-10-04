# Screening-result email automation

This script uses the existing screening columns in the hackathon registration sheet:

- `Screening Status`
- `Screening Email Sent`

### Setup

1. Open the Google Sheet connected to the hackathon registration form.
2. Open **Extensions → Apps Script**.
3. Add `screening-emails.gs` to that Apps Script project.
4. Save the project and reload the Google Sheet.
5. Use the new **Hackathon** menu.
6. Run **Preview Pending Screening Emails** first and review the log.
7. After the screening decisions are complete, run **Send Screening Result Emails**.

Use `Selected` or `Not Selected` in the `Screening Status` column. Team rows with the same Team Name are treated as one screening decision. All unique email addresses present for that team receive the same result email.

The script writes `Sent` into `Screening Email Sent` after successful delivery so the same recipient is not intentionally sent again by later runs.

The website does not send email directly; this Apps Script is the email layer connected to the registration Sheet.
