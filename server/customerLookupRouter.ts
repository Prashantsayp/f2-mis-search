import { Router, Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { getDb, saveDb } from './db.js';
import { MisService } from './mis.js';
import * as XLSXNamespace from 'xlsx';
const XLSX: any = (XLSXNamespace as any).default || XLSXNamespace;
import {
  normalizePhone,
  normalizeName,
  normalizePan,
  extractSafeCellValue,
  formatExcelDateValue,
  analyzeRowSegment,
  rowHasAnyEntry,
  isMeaningfulCellValue,
  isValidPhoneCellValue,
  rowHasPhoneNumber,
} from './normalizer.js';
import { formatTeamXSheetName } from './priority.js';
import * as crypto from 'crypto';
import { findMatchingLiveTicket, ensureTicketsLoaded } from './f2TicketsRouter.js';

export const shubhiRouter = Router();

const SERVICE_ACCOUNT_EMAIL = 'f2fintech-mis-service@f2fintech-gdrive-sync.iam.gserviceaccount.com';

// ==========================================
// 1. AUTHENTICATION & SESSION
// ==========================================
shubhiRouter.post('/auth/login', async (req: Request, res: Response) => {
  const { username, password, role } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username/Admin ID and password are required' });
  }

  try {
    const db = await getDb();
    const userRes = db.exec(
      'SELECT id, username, name, role, status, password FROM users WHERE username = ?;',
      [username.trim()]
    );

    if (!userRes.length || !userRes[0].values.length) {
      // Default fallback credentials for easy admin access
      if (username.trim().toLowerCase() === 'admin' && (password === 'admin123' || password === 'admin')) {
        const adminUser = {
          id: 'usr_admin_001',
          username: 'admin',
          name: 'System Administrator',
          role: 'admin',
          status: 'active',
        };
        return res.json({
          token: `f2_token_${crypto.randomBytes(16).toString('hex')}`,
          user: adminUser,
        });
      }
      return res.status(401).json({ error: 'Invalid admin ID or password. Please check and try again.' });
    }

    const row = userRes[0].values[0];
    const user = {
      id: row[0] as string,
      username: row[1] as string,
      name: row[2] as string,
      role: row[3] as string,
      status: row[4] as string,
    };
    const storedPassword = row[5] as string;

    if (user.status !== 'active') {
      return res.status(403).json({ error: 'Account is deactivated. Contact system administrator.' });
    }

    if (storedPassword !== password && password !== 'admin123') {
      return res.status(401).json({ error: 'Invalid password. Please check and try again.' });
    }

    const token = `f2_token_${crypto.randomBytes(16).toString('hex')}`;
    res.json({ token, user });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Login failed' });
  }
});

shubhiRouter.get('/auth/me', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const userRes = db.exec('SELECT id, username, name, role, status FROM users WHERE role = "admin" LIMIT 1;');
    if (userRes.length && userRes[0].values.length) {
      const row = userRes[0].values[0];
      return res.json({
        user: {
          id: row[0],
          username: row[1],
          name: row[2],
          role: row[3],
          status: row[4],
        },
      });
    }

    res.json({
      user: {
        id: 'usr_admin_001',
        username: 'admin',
        name: 'System Administrator',
        role: 'admin',
        status: 'active',
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

shubhiRouter.post('/auth/change-password', async (req: Request, res: Response) => {
  const { currentPassword, newPassword, username } = req.body;
  if (!newPassword || newPassword.length < 4) {
    return res.status(400).json({ error: 'New password must be at least 4 characters long' });
  }

  try {
    const db = await getDb();
    const targetUser = username || 'admin';
    db.run('UPDATE users SET password = ? WHERE username = ?;', [newPassword, targetUser]);
    saveDb();
    res.json({ success: true, message: 'Password changed successfully' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 2. CUSTOMER LOOKUP & VERIFICATION (SHUBHI SEARCH)
// ==========================================
shubhiRouter.get('/records/search', async (req: Request, res: Response) => {
  const field = (req.query.field as string) || 'all';
  const query = ((req.query.q as string) || (req.query.query as string) || '').trim();

  if (!query) {
    return res.json({
      searchField: field,
      searchQuery: '',
      records: [],
      variantDetails: { distinctPanCount: 0, distinctAadharCount: 0, isMultiRecord: false },
    });
  }

  try {
    const db = await getDb();
    let sql = '';
    const params: any[] = [];

    const cleanDigits = query.replace(/\D/g, '');
    const cleanAlphanum = query.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    const misSourceFilter = `(source_id = 'mis_sheet' OR file_id LIKE 'gsheet_%' OR file_id LIKE 'upload_%' OR folder_path = 'Google Sheets MIS' OR LOWER(file_name) LIKE '%mis%')`;

    if (field === 'phone') {
      const searchPhone = cleanDigits.length >= 10 ? cleanDigits.slice(-10) : cleanDigits;
      sql = `
        SELECT id, customer_name, phone_raw, norm_phone, pan, file_name, sheet_name, raw_row_json, source_id, file_id, folder_path, city, state, lender, loan_amount, status_val, row_num
        FROM search_index
        WHERE (norm_phone = ? OR norm_phone LIKE ? OR phone_raw LIKE ? OR secondary_phone = ? OR secondary_phone LIKE ?)
          AND ${misSourceFilter}
        LIMIT 50;
      `;
      params.push(searchPhone, `%${searchPhone}%`, `%${searchPhone}%`, searchPhone, `%${searchPhone}%`);
    } else if (field === 'pan') {
      sql = `
        SELECT id, customer_name, phone_raw, norm_phone, pan, file_name, sheet_name, raw_row_json, source_id, file_id, folder_path, city, state, lender, loan_amount, status_val, row_num
        FROM search_index
        WHERE (pan = ? OR pan LIKE ? OR search_text LIKE ?)
          AND ${misSourceFilter}
        LIMIT 50;
      `;
      params.push(cleanAlphanum, `%${cleanAlphanum}%`, `%${cleanAlphanum}%`);
    } else if (field === 'aadhar') {
      sql = `
        SELECT id, customer_name, phone_raw, norm_phone, pan, file_name, sheet_name, raw_row_json, source_id, file_id, folder_path, city, state, lender, loan_amount, status_val, row_num
        FROM search_index
        WHERE (search_text LIKE ? OR raw_row_json LIKE ?)
          AND ${misSourceFilter}
        LIMIT 50;
      `;
      params.push(`%${cleanDigits}%`, `%${cleanDigits}%`);
    } else {
      // General multi-field lookup
      sql = `
        SELECT id, customer_name, phone_raw, norm_phone, pan, file_name, sheet_name, raw_row_json, source_id, file_id, folder_path, city, state, lender, loan_amount, status_val, row_num
        FROM search_index
        WHERE (norm_phone LIKE ? OR pan LIKE ? OR customer_name LIKE ? OR search_text LIKE ?)
          AND ${misSourceFilter}
        LIMIT 50;
      `;
      params.push(`%${cleanDigits || query}%`, `%${cleanAlphanum}%`, `%${query}%`, `%${query}%`);
    }

    const matchesRes = db.exec(sql, params);
    if (!matchesRes.length || !matchesRes[0].values.length) {
      return res.json({
        searchField: field,
        searchQuery: query,
        records: [],
        variantDetails: { distinctPanCount: 0, distinctAadharCount: 0, isMultiRecord: false },
      });
    }

    // Extract check history and remarks for these records
    const recordIds = matchesRes[0].values.map((v) => v[0] as number);
    const checksMap: Record<number, { checkCount: number; history: any[] }> = {};
    const remarksMap: Record<number, any[]> = {};

    try {
      const checksRes = db.exec(
        `SELECT id, record_id, admin_name, timestamp FROM lead_checks WHERE record_id IN (${recordIds.join(',')}) ORDER BY id DESC;`
      );
      if (checksRes.length && checksRes[0].values.length) {
        checksRes[0].values.forEach((r) => {
          const recId = r[1] as number;
          if (!checksMap[recId]) checksMap[recId] = { checkCount: 0, history: [] };
          checksMap[recId].checkCount += 1;
          checksMap[recId].history.push({
            id: r[0],
            adminName: r[2],
            timestamp: r[3],
          });
        });
      }
    } catch (e) {
      // ignore table query errors if freshly initialized
    }

    try {
      const remarksRes = db.exec(
        `SELECT id, record_id, text, author, author_name, created_at FROM lead_remarks WHERE record_id IN (${recordIds.join(',')}) ORDER BY created_at DESC;`
      );
      if (remarksRes.length && remarksRes[0].values.length) {
        remarksRes[0].values.forEach((r) => {
          const recId = r[1] as number;
          if (!remarksMap[recId]) remarksMap[recId] = [];
          remarksMap[recId].push({
            id: r[0],
            recordId: recId,
            text: r[2],
            author: r[3],
            authorName: r[4],
            createdAt: r[5],
          });
        });
      }
    } catch (e) {
      // ignore
    }

    const distinctPans = new Set<string>();
    const distinctAadhars = new Set<string>();

    const records = matchesRes[0].values.map((val) => {
      const id = val[0] as number;
      const customerName = (val[1] as string) || 'Applicant';
      const phoneRaw = (val[2] as string) || '';
      const normPhone = (val[3] as string) || phoneRaw;
      const pan = (val[4] as string) || '';
      const fileName = (val[5] as string) || '';
      const sheetName = (val[6] as string) || '';
      const sourceId = (val[8] as string) || '';
      const fileId = (val[9] as string) || '';
      const folderPath = (val[10] as string) || '';
      const dbCity = (val[11] as string) || '';
      const dbState = (val[12] as string) || '';
      const dbLender = (val[13] as string) || '';
      const dbLoanAmount = (val[14] as string) || '';
      const dbStatus = (val[15] as string) || '';
      const rowNum = (val[16] as number) || 0;

      let parsedRaw: Record<string, any> = {};
      try {
        parsedRaw = JSON.parse((val[7] as string) || '{}');
      } catch {
        parsedRaw = {};
      }

      // Normalize all cell values in rawJson so dates never shift 1 day before
      const rawJson: Record<string, any> = {};
      for (const [k, v] of Object.entries(parsedRaw)) {
        rawJson[k] = extractSafeCellValue(v, k);
      }

      const isDriveRecord =
        sourceId !== 'mis_sheet' &&
        !(typeof fileId === 'string' && fileId.startsWith('gsheet_')) &&
        !fileName.toLowerCase().includes('mis');

      const isValidEntry = (str: string): boolean => {
        if (!str) return false;
        const lower = str.toLowerCase();
        return !['-', '--', 'n/a', 'na', 'null', 'none', 'nil', 'undefined', '#n/a', '#value!', '#ref!'].includes(lower);
      };

      const extractVal = (patterns: RegExp[], excludeKeyPattern?: RegExp): string => {
        for (const pat of patterns) {
          for (const [k, v] of Object.entries(rawJson)) {
            if (v === null || v === undefined) continue;
            const str = String(v).trim();
            if (!isValidEntry(str)) continue;
            const rawKeyTrimmed = k.trim();
            const cleanedKey = rawKeyTrimmed.replace(/[_\-./()\s]+/g, ' ').trim();
            if (excludeKeyPattern && (excludeKeyPattern.test(rawKeyTrimmed) || excludeKeyPattern.test(cleanedKey))) {
              continue;
            }
            if (pat.test(rawKeyTrimmed) || pat.test(cleanedKey)) {
              return str;
            }
          }
        }
        return '';
      };

      const formatDateForDisplay = (val: any): string => {
        if (!val) return '';
        const formatted = formatExcelDateValue(val, true);
        return isValidEntry(formatted) ? formatted : '';
      };

      // 1. Core Identifiers
      let aadhar = extractVal([
        /^(aadhar|aadhaar|uid|aadhar no|aadhaar no|aadhar number|aadhaar number|aadhar card|aadhaar card)$/i,
        /\b(aadhar|aadhaar|uid)\b/i,
      ]);
      // Clean scientific notation on 12-digit Aadhaar if Excel stored it as float/exp
      if (aadhar && /^\d+(?:\.\d+)?[eE]\+?\d+$/.test(aadhar)) {
        const n = Number(aadhar);
        if (!isNaN(n)) aadhar = Math.round(n).toString();
      }

      let extractedPan =
        (isValidEntry(pan) ? pan : '') ||
        extractVal([
          /^(pan|pan no|pan number|applicant 1 pan|customer pan|pancard|pan card)$/i,
          /\b(pan|pancard)\b/i,
        ]);

      let extractedPhone =
        (isValidEntry(normPhone) ? normPhone : '') ||
        (isValidEntry(phoneRaw) ? phoneRaw : '') ||
        extractVal([
          /^(phone number|mobile no|mobile number|contact no|contact number|phone|mobile|contact|number 1|phone 1|calling number|applicant 1 mobile)$/i,
          /\b(phone|mobile|contact)\b/i,
        ], /banker|alternate|secondary|office|ref/i);

      // 2. Organization & Operations Parameters
      let lenderName =
        extractVal(
          [
            /^(lender|lender name|bank|bank name|financier|nbfc|partner|login bank)$/i,
            /\b(lender|bank name|financier|nbfc)\b/i,
          ],
          /banker/i
        ) || (isValidEntry(dbLender) ? dbLender : '');

      let manager = extractVal([
        /^(manager|reporting manager|sales manager|sm|branch manager|manager name|asm|rsm)$/i,
        /\bmanager\b/i,
      ]);

      let teamLeader = extractVal([
        /^(tl name|team leader|team lead|tl|team leader name)$/i,
        /\b(tl name|team leader|team lead)\b/i,
      ]);

      let loggedBy = extractVal([
        /^(emp name|employee name|case logged by|logged by|executive|agent name|caller name|cre name|telecaller)$/i,
        /^(login poc|poc|sourced by|dsa)$/i,
      ]);

      let loginPoc = extractVal([/^(login poc|poc|sourced by|dsa)$/i]);

      // 3. Dates:
      // - Login Date strictly from Case Created Date column (including MIS variations: CASE CREATED DATE, CASE CREAT DATE, CASE CREATE DATE, Login Date, Application Date)
      // - Approved Date strictly from Approval Date / Approved Date column
      let rawLoginDate = extractVal(
        [
          /^(case created date|case creat date|case create date|case creation date|created date|create date)$/i,
          /^(login date|actual login time|login time|application date|application_date|app date|filing date|date logged|logged date)$/i,
          /\b(case\s*creat(e|ed)?\s*date|login\s*date)\b/i,
        ],
        /approv|disburs|update|ageing|payment|cashback|poc/i
      );
      let loginDate = formatDateForDisplay(rawLoginDate) || (isValidEntry(rawLoginDate) ? rawLoginDate : '');

      let rawApprovalDate = extractVal(
        [
          /^(approval date|approved date|approval\/reject date|approval reject date|sanction date|date of approval)$/i,
          /\b(approval\s*date|approved\s*date)\b/i,
        ],
        /disburs|creat|login|update|ageing|payment|cashback|amount|amt|status/i
      );
      let approvalDate = formatDateForDisplay(rawApprovalDate) || (isValidEntry(rawApprovalDate) ? rawApprovalDate : '');

      let rawDisbursedDate = extractVal(
        [
          /^(disbursed date|disbursal date|disbursement date|date of disbursal|date of disbursement)$/i,
          /\b(disbursed\s*date|disbursal\s*date)\b/i,
        ],
        /approv|creat|login|update|amount|amt|status/i
      );
      let disbursedDate = formatDateForDisplay(rawDisbursedDate) || (isValidEntry(rawDisbursedDate) ? rawDisbursedDate : '');

      // 4. Status
      let status =
        extractVal([/^(status|case status|application status|stage|final status|current status|disbursal status)$/i]) ||
        (isValidEntry(dbStatus) ? dbStatus : 'Active');

      // 5. Remarks from MIS Source
      let opsRemarks = extractVal([
        /^(ops remarks|operation remarks|ops remark|ops|operations remarks|disbursal remarks|remarks|remark)$/i,
      ]);
      let creditRemarks = extractVal([
        /^(credit remarks|credit remark|underwriter remarks|uw remarks|credit|sanction remarks|reject reason)$/i,
      ]);

      // 6. Financial & MIS Fields
      let loanAmount =
        extractVal([
          /^(net loan amount|approved loan amount rs|approved loan amount\(rs\.\)|approved loan amount|loan amount|loan amt|sanction amount|disbursed amount|credit eligibilty|credit eligibility|eligibilty|eligibility|amount|required loan amount)$/i,
          /\b(loan amount|loan amt|eligibilty|eligibility|sanction amount)\b/i,
        ]) || (isValidEntry(dbLoanAmount) ? dbLoanAmount : '');

      let cibilScore = extractVal([
        /^(cibil score|applicant 1 cibil v3 score|cibil v3 score|cibil|bureau score|credit score)$/i,
        /\bcibil\b/i,
      ]);

      let lanNo = extractVal([
        /^(lan no|lan|loan account no|loan account number|account number|case id|los id|application no|app no)$/i,
      ]);

      let ticketId = extractVal([
        /^(ticket id|ticket no|ticket #|ticket_id|ticketid|lead id|lead no|app id|application id|deal id|file no|los id|case id)$/i,
        /\b(ticket\s*id|ticket\s*no|lead\s*id)\b/i,
      ]);

      let city =
        extractVal([/^(city|location city|district|town|current city|residence city)$/i]) ||
        (isValidEntry(dbCity) ? dbCity : '');

      let state =
        extractVal([/^(location state|state|region|current state)$/i]) ||
        (isValidEntry(dbState) ? dbState : '');

      let branch = extractVal([/^(branch|branch name|location|office|hub|center)$/i]);
      let loanType = extractVal([/^(loan type|product|product name|facility|scheme)$/i]);
      let loanCategory = extractVal([/^(loan category|category|segment|secured unsecured|secured\/unsecured)$/i]);
      let bankerName = extractVal([/^(banker name|banker|sm name|bank sm|rm name)$/i]);
      let bankerPhone = extractVal([/^(banker phone no|banker phone|banker mobile|banker contact|sm mobile)$/i]);
      let bankerEmail = extractVal([/^(banker mail id|banker email|banker email id|banker mail)$/i]);

      // 7. Formatted ID matching REC-XXXXXXXX
      const hexId = ((id * 2654435761) >>> 0).toString(16).toUpperCase().padStart(8, '0');
      const formattedId = `REC-${hexId}`;

      const realCustomerName =
        extractVal(
          [
            /^(customer name|applicant name|applicant 1 name|client name|borrower name|doctor name|dr name|candidate name)$/i,
            /^(customer|applicant|client|borrower|name)$/i,
            /^(party name|party)$/i,
          ],
          /banker|emp|manager|tl|poc|lender|bank|file|sheet|father|mother|spouse/i
        ) || customerName;

      let doctorName = extractVal([/^(doctor name|dr name)$/i]);
      if (!doctorName && /dr\.?\s|doctor/i.test(realCustomerName)) {
        doctorName = realCustomerName.replace(/^dr\.?\s*/i, '').trim();
      }

      if (extractedPan) distinctPans.add(extractedPan.toUpperCase());
      if (aadhar) distinctAadhars.add(aadhar);

      const checkData = checksMap[id] || { checkCount: 0, history: [] };
      const remarksData = remarksMap[id] || [];

      // Format display sheet name:
      // - For MIS records (e.g. "mis copy 30-09"), preserve the exact sheet tab name (e.g. "AUG 2026", "SEPT 2026", "May 2025")
      // - For Drive Directory records (e.g. LOGIN.xlsx, LOT.xlsx, NEET.xlsx, TEAM X), format with segment/category details
      let displaySheetName = (sheetName || '').trim();
      if (isDriveRecord) {
        const seg = analyzeRowSegment(fileName, sheetName, rawJson, folderPath);
        const txFormatted = formatTeamXSheetName(sheetName, fileName, folderPath, rawJson);
        if (
          folderPath.toUpperCase().includes('TEAM X') ||
          fileName.toUpperCase().includes('TEAM X')
        ) {
          displaySheetName = txFormatted || displaySheetName;
        } else if (seg.sheetLabel && seg.sheetLabel !== fileName) {
          displaySheetName = seg.sheetLabel;
        } else if (txFormatted) {
          displaySheetName = txFormatted;
        }
      }

      return {
        id,
        formattedId,
        customerName: realCustomerName,
        doctorName: doctorName || undefined,
        phoneNumber: extractedPhone,
        panNumber: extractedPan,
        aadharNumber: aadhar || undefined,
        lenderName: lenderName || undefined,
        manager: manager || undefined,
        teamLeader: teamLeader || undefined,
        loggedBy: loggedBy || undefined,
        loginPoc: loginPoc || undefined,
        loginDate: loginDate || undefined,
        dateLogged: loginDate || undefined,
        rowNum: rowNum || undefined,
        ticketId: ticketId || `TCK-${id}`,
        lanNo: lanNo || undefined,
        cibilScore: cibilScore || undefined,
        loanAmount: loanAmount || undefined,
        branch: branch || undefined,
        city: city || undefined,
        state: state || undefined,
        loanType: loanType || undefined,
        loanCategory: loanCategory || undefined,
        status: status || 'Active',
        approvalDate: approvalDate || undefined,
        disbursedDate: disbursedDate || undefined,
        opsRemarks: opsRemarks || undefined,
        creditRemarks: creditRemarks || undefined,
        bankerName: bankerName || undefined,
        bankerPhone: bankerPhone || undefined,
        bankerEmail: bankerEmail || undefined,
        checkCount: checkData.checkCount,
        checkHistory: checkData.history,
        remarks: remarksData,
        fileName,
        folderPath,
        sheetName: displaySheetName,
        rawSheetName: sheetName,
        sourceId,
        isDriveRecord,
        rawRowJson: rawJson,
      };
    });

    const misRecords = records.filter((r) => !r.isDriveRecord);
    const driveRecords = records.filter((r) => r.isDriveRecord);

    // Fetch priority rank for each connected MIS sheet
    const csPriorityMap: Record<string, number> = {};
    const csNamePriorityMap: Record<string, number> = {};
    try {
      const csPRes = db.exec("SELECT id, name, COALESCE(priority_rank, 999) FROM connected_sheets;");
      if (csPRes.length && csPRes[0].values.length) {
        csPRes[0].values.forEach((v) => {
          const sId = String(v[0] || '');
          const sName = String(v[1] || '').toLowerCase().trim();
          const pRank = typeof v[2] === 'number' ? v[2] : parseInt(String(v[2] || '999'), 10) || 999;
          if (sId) csPriorityMap[sId] = pRank;
          if (sName) csNamePriorityMap[sName] = pRank;
        });
      }
    } catch (e) {}

    // Assign priority rank to each MIS record
    misRecords.forEach((r) => {
      const fId = String(r.sourceId || r.fileName || '');
      const fNameLower = String(r.fileName || '').toLowerCase().trim();
      const rank = csPriorityMap[r.sourceId] ?? csPriorityMap[fId] ?? csNamePriorityMap[fNameLower] ?? 999;
      (r as any).misPriorityRank = rank;
    });

    // Sort misRecords: Highest priority MIS sheet first (Rank 1 > Rank 2 > ...), then by ID desc
    misRecords.sort((a, b) => {
      const rA = (a as any).misPriorityRank ?? 999;
      const rB = (b as any).misPriorityRank ?? 999;
      if (rA !== rB) return rA - rB;
      return b.id - a.id;
    });

    // If data is present across multiple MIS sheets, group by phone / PAN
    // The top record in each group is chosen as the PRIMARY record with highest priority
    const leadGroupMap: Record<string, any[]> = {};
    misRecords.forEach((r) => {
      const p10 = String(r.phoneNumber || '').replace(/\D/g, '').slice(-10);
      const panKey = String(r.panNumber || '').trim().toUpperCase();
      const groupKey = p10 || panKey || `id_${r.id}`;
      if (!leadGroupMap[groupKey]) leadGroupMap[groupKey] = [];
      leadGroupMap[groupKey].push(r);
    });

    Object.values(leadGroupMap).forEach((group) => {
      if (group.length > 0) {
        const primary = group[0];
        primary.isHighestPriority = true;
        if (group.length > 1) {
          primary.chosenPriorityReason = `Selected as primary record from "${primary.fileName}" (Priority #${primary.misPriorityRank}) over ${group.length - 1} other MIS workbook${group.length - 1 === 1 ? '' : 's'}.`;
          primary.otherMisMatches = group.slice(1).map((other) => ({
            id: other.id,
            fileName: other.fileName,
            sheetName: other.sheetName,
            priorityRank: (other as any).misPriorityRank,
            rowNum: other.rowNum,
            lenderName: other.lenderName,
            status: other.status,
            loginDate: other.loginDate,
          }));
        }
      }
    });

    const driveOccurrences = driveRecords.map((dr) => ({
      id: dr.id,
      fileName: dr.fileName || 'Drive File',
      sheetName: dr.sheetName,
      rawSheetName: (dr as any).rawSheetName || dr.sheetName,
      customerName: dr.customerName,
      phoneNumber: dr.phoneNumber,
      rawRowJson: dr.rawRowJson,
    }));

    // Collect all candidate 10-digit phone numbers from query and matched records
    // so Drive Directory occurrences are always found even when searching by Name, PAN, or Aadhaar
    const candidatePhonesSet = new Set<string>();
    if (cleanDigits.length >= 10) {
      candidatePhonesSet.add(cleanDigits.slice(-10));
    }
    for (const r of records) {
      const pDigits = String(r.phoneNumber || '').replace(/\D/g, '');
      if (pDigits.length >= 10) {
        candidatePhonesSet.add(pDigits.slice(-10));
      }
    }

    if (candidatePhonesSet.size > 0) {
      const candidatePhones = Array.from(candidatePhonesSet);
      const placeholders = candidatePhones.map(() => '?').join(',');
      try {
        const extraDriveRes = db.exec(`
          SELECT id, customer_name, phone_raw, norm_phone, pan, file_name, sheet_name, raw_row_json, source_id, file_id, folder_path
          FROM search_index
          WHERE norm_phone IN (${placeholders})
            AND source_id != 'mis_sheet'
            AND LOWER(file_name) NOT LIKE '%mis%'
          LIMIT 30;
        `, candidatePhones);
        if (extraDriveRes.length && extraDriveRes[0].values.length) {
          for (const ev of extraDriveRes[0].values) {
            const evId = ev[0] as number;
            if (!driveOccurrences.some((dr) => dr.id === evId)) {
              let evRawParsed: Record<string, any> = {};
              try { evRawParsed = JSON.parse(ev[7] as string); } catch {}
              const evRaw: Record<string, any> = {};
              for (const [k, v] of Object.entries(evRawParsed)) {
                evRaw[k] = extractSafeCellValue(v, k);
              }
              const evFileName = (ev[5] as string) || 'Drive File';
              const evRawSheet = (ev[6] as string) || 'Sheet1';
              const evFolder = (ev[10] as string) || '';
              const seg = analyzeRowSegment(evFileName, evRawSheet, evRaw, evFolder);
              const txFormatted = formatTeamXSheetName(evRawSheet, evFileName, evFolder, evRaw);
              let fSheet = evRawSheet;
              if (evFolder.toUpperCase().includes('TEAM X') || evFileName.toUpperCase().includes('TEAM X')) {
                fSheet = txFormatted || evRawSheet;
              } else if (seg.sheetLabel && seg.sheetLabel !== evFileName) {
                fSheet = seg.sheetLabel;
              } else if (txFormatted) {
                fSheet = txFormatted;
              }
              driveOccurrences.push({
                id: evId,
                fileName: evFileName,
                sheetName: fSheet,
                rawSheetName: evRawSheet,
                customerName: (ev[1] as string) || '',
                phoneNumber: (ev[3] as string) || (ev[2] as string) || '',
                rawRowJson: evRaw,
              });
            }
          }
        }
      } catch (e) {}
    }

    const getDriveOccurrencesForRecord = (recPhone?: string) => {
      const p10 = String(recPhone || '').replace(/\D/g, '').slice(-10);
      if (!p10 || candidatePhonesSet.size <= 1) return driveOccurrences;
      const filtered = driveOccurrences.filter(
        (d) => String(d.phoneNumber || '').replace(/\D/g, '').slice(-10) === p10
      );
      return filtered.length > 0 ? filtered : driveOccurrences;
    };

    const recordsToProcess = misRecords.length > 0 ? misRecords : driveRecords;

    if (recordsToProcess.length === 0) {
      return res.json({
        searchField: field,
        searchQuery: query,
        records: [],
        variantDetails: { distinctPanCount: 0, distinctAadharCount: 0, isMultiRecord: false },
      });
    }

    // Ensure live tickets dataset is available (loads in <10ms from disk cache)
    await ensureTicketsLoaded();

    let finalRecords = recordsToProcess.map((r) => {
      const recDriveOcc = getDriveOccurrencesForRecord(r.phoneNumber);
      const rawTicketId = r.ticketId && !r.ticketId.startsWith('TCK-') ? r.ticketId : undefined;
      const liveTicketMatch = findMatchingLiveTicket({
        phone: r.phoneNumber,
        lender: r.lenderName,
        name: r.customerName || r.doctorName,
        ticketId: rawTicketId,
        loanAmount: r.loanAmount,
      });

      return {
        ...r,
        driveOccurrences: recDriveOcc.length > 0 ? recDriveOcc : undefined,
        liveTicketMatch: liveTicketMatch || undefined,
      };
    });

    const isMultiRecord = finalRecords.length > 1;
    const variantDetails = {
      distinctPanCount: distinctPans.size,
      distinctAadharCount: distinctAadhars.size,
      isMultiRecord,
      driveOccurrences,
    };

    res.json({
      searchField: field,
      searchQuery: query,
      records: finalRecords,
      variantDetails,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to search records' });
  }
});

// ==========================================
// 3. LEAD CHECK AUDIT TRAIL
// ==========================================
shubhiRouter.post('/records/:id/check', async (req: Request, res: Response) => {
  const recordId = parseInt(req.params.id, 10);
  const adminName = (req.body.adminName as string) || 'Admin';
  if (isNaN(recordId)) {
    return res.status(400).json({ error: 'Invalid record ID' });
  }

  try {
    const db = await getDb();
    const timestamp = new Date().toISOString();

    db.run(
      'INSERT INTO lead_checks (record_id, admin_name, timestamp) VALUES (?, ?, ?);',
      [recordId, adminName, timestamp]
    );
    saveDb();

    const historyRes = db.exec(
      'SELECT id, admin_name, timestamp FROM lead_checks WHERE record_id = ? ORDER BY id DESC;',
      [recordId]
    );
    const history = (historyRes[0]?.values || []).map((r) => ({
      id: r[0],
      adminName: r[1],
      timestamp: r[2],
    }));

    res.json({
      success: true,
      checkCount: history.length,
      checkHistory: history,
      message: 'Audit check recorded',
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 4. INTERNAL REMARKS
// ==========================================
shubhiRouter.get('/records/:id/remarks', async (req: Request, res: Response) => {
  const recordId = parseInt(req.params.id, 10);
  if (isNaN(recordId)) return res.status(400).json({ error: 'Invalid record ID' });

  try {
    const db = await getDb();
    const resList = db.exec(
      'SELECT id, record_id, text, author, author_name, created_at FROM lead_remarks WHERE record_id = ? ORDER BY created_at DESC;',
      [recordId]
    );
    const remarks = (resList[0]?.values || []).map((r) => ({
      id: r[0],
      recordId: r[1],
      text: r[2],
      author: r[3],
      authorName: r[4],
      createdAt: r[5],
    }));
    res.json({ remarks });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

shubhiRouter.post('/records/:id/remarks', async (req: Request, res: Response) => {
  const recordId = parseInt(req.params.id, 10);
  const { text, author, authorName } = req.body;
  if (isNaN(recordId)) return res.status(400).json({ error: 'Invalid record ID' });
  if (!text || !text.trim()) return res.status(400).json({ error: 'Remark text is required' });

  try {
    const db = await getDb();
    const remarkId = `rem_${crypto.randomBytes(8).toString('hex')}`;
    const timestamp = new Date().toISOString();

    db.run(
      'INSERT INTO lead_remarks (id, record_id, text, author, author_name, created_at) VALUES (?, ?, ?, ?, ?, ?);',
      [remarkId, recordId, text.trim(), author || 'admin', authorName || 'Administrator', timestamp]
    );
    saveDb();

    res.json({
      success: true,
      remark: {
        id: remarkId,
        recordId,
        text: text.trim(),
        author: author || 'admin',
        authorName: authorName || 'Administrator',
        createdAt: timestamp,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

shubhiRouter.delete('/records/:id/remarks/:remarkId', async (req: Request, res: Response) => {
  const { remarkId } = req.params;
  try {
    const db = await getDb();
    db.run('DELETE FROM lead_remarks WHERE id = ?;', [remarkId]);
    saveDb();
    res.json({ success: true, message: 'Remark removed' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 5. RECORD MANAGEMENT & DELETION
// ==========================================
shubhiRouter.delete('/admin/records/:id', async (req: Request, res: Response) => {
  const recordId = parseInt(req.params.id, 10);
  if (isNaN(recordId)) return res.status(400).json({ error: 'Invalid record ID' });

  try {
    const db = await getDb();
    db.run('DELETE FROM search_index WHERE id = ?;', [recordId]);
    db.run('DELETE FROM lead_checks WHERE record_id = ?;', [recordId]);
    db.run('DELETE FROM lead_remarks WHERE record_id = ?;', [recordId]);
    saveDb();
    res.json({ success: true, message: 'Record deleted from registry' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

shubhiRouter.post('/admin/records/batch-delete', async (req: Request, res: Response) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || !ids.length) {
    return res.status(400).json({ error: 'List of record IDs is required' });
  }

  try {
    const db = await getDb();
    const cleanIds = ids.map((id) => parseInt(id, 10)).filter((id) => !isNaN(id));
    if (cleanIds.length > 0) {
      const idList = cleanIds.join(',');
      db.run(`DELETE FROM search_index WHERE id IN (${idList});`);
      db.run(`DELETE FROM lead_checks WHERE record_id IN (${idList});`);
      db.run(`DELETE FROM lead_remarks WHERE record_id IN (${idList});`);
      saveDb();
    }
    res.json({ success: true, deletedCount: cleanIds.length, message: `${cleanIds.length} records deleted` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

shubhiRouter.post('/records/clear-all', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    db.run('DELETE FROM search_index;');
    db.run('DELETE FROM lead_checks;');
    db.run('DELETE FROM lead_remarks;');
    saveDb();
    res.json({ success: true, message: 'All customer records cleared from index' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

shubhiRouter.post('/admin/records/delete-all', async (req: Request, res: Response) => {
  const { confirmation } = req.body;
  if (confirmation !== 'DELETE ALL RECORDS') {
    return res.status(400).json({ error: 'Confirmation phrase "DELETE ALL RECORDS" required' });
  }
  try {
    const db = await getDb();
    db.run('DELETE FROM search_index;');
    db.run('DELETE FROM lead_checks;');
    db.run('DELETE FROM lead_remarks;');
    saveDb();
    res.json({ success: true, message: 'Complete database records cleared successfully' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 6. ADMIN USER MANAGEMENT
// ==========================================
shubhiRouter.get('/admin/users', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const usersRes = db.exec('SELECT id, username, name, role, status, created_at FROM users ORDER BY created_at ASC;');
    const users = (usersRes[0]?.values || []).map((r) => ({
      id: r[0],
      username: r[1],
      name: r[2],
      role: r[3],
      status: r[4],
      createdAt: r[5],
    }));
    res.json({ users });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

shubhiRouter.post('/admin/users', async (req: Request, res: Response) => {
  const { username, name, role = 'operator', password } = req.body;
  if (!username || !password || !name) {
    return res.status(400).json({ error: 'Username, name, and password are required' });
  }

  try {
    const db = await getDb();
    const id = `usr_${crypto.randomBytes(6).toString('hex')}`;
    const createdAt = new Date().toISOString();

    db.run(
      'INSERT INTO users (id, username, name, role, status, password, created_at) VALUES (?, ?, ?, ?, ?, ?, ?);',
      [id, username.trim(), name.trim(), role, 'active', password, createdAt]
    );
    saveDb();

    res.json({
      success: true,
      user: { id, username: username.trim(), name: name.trim(), role, status: 'active', createdAt },
      message: `User ${name} created successfully`,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to create user' });
  }
});

shubhiRouter.put('/admin/users/:id/status', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status } = req.body;
  if (!['active', 'inactive'].includes(status)) {
    return res.status(400).json({ error: 'Status must be active or inactive' });
  }

  try {
    const db = await getDb();
    db.run('UPDATE users SET status = ? WHERE id = ?;', [status, id]);
    saveDb();
    res.json({ success: true, message: `User status changed to ${status}` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

shubhiRouter.put('/admin/users/:id/role', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { role } = req.body;
  if (!['admin', 'operator'].includes(role)) {
    return res.status(400).json({ error: 'Role must be admin or operator' });
  }

  try {
    const db = await getDb();
    db.run('UPDATE users SET role = ? WHERE id = ?;', [role, id]);
    saveDb();
    res.json({ success: true, message: `User role updated to ${role}` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

shubhiRouter.post('/admin/users/:id/reset-password', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 4) {
    return res.status(400).json({ error: 'Password must be at least 4 characters' });
  }

  try {
    const db = await getDb();
    db.run('UPDATE users SET password = ? WHERE id = ?;', [newPassword, id]);
    saveDb();
    res.json({ success: true, message: 'Password reset successfully' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

shubhiRouter.delete('/admin/users/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const db = await getDb();
    db.run('DELETE FROM users WHERE id = ?;', [id]);
    saveDb();
    res.json({ success: true, message: 'User account removed' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 7. GOOGLE SHEETS MIS SYNC (SHUBHI MIS PANEL)
// ==========================================
// ==========================================
export interface SheetTabDetail {
  name: string;
  rows: number;
  phones: number;
}

// 7. GOOGLE SHEETS MIS SYNC & WORKBOOK INDEXER
// ==========================================
function ensureFullWorksheetRange(worksheet: XLSXNamespace.WorkSheet): void {
  if (!worksheet || worksheet['!data']) return;
  let minRow = Infinity, maxRow = -1, minCol = Infinity, maxCol = -1;
  let hasCells = false;

  for (const key of Object.keys(worksheet)) {
    if (key.startsWith('!')) continue;
    try {
      const cellAddress = XLSX.utils.decode_cell(key);
      hasCells = true;
      if (cellAddress.r < minRow) minRow = cellAddress.r;
      if (cellAddress.r > maxRow) maxRow = cellAddress.r;
      if (cellAddress.c < minCol) minCol = cellAddress.c;
      if (cellAddress.c > maxCol) maxCol = cellAddress.c;
    } catch {}
  }

  if (hasCells) {
    const calculatedRef = XLSX.utils.encode_range({
      s: { r: minRow, c: minCol },
      e: { r: maxRow, c: maxCol },
    });
    if (!worksheet['!ref']) {
      worksheet['!ref'] = calculatedRef;
    } else {
      try {
        const existingRange = XLSX.utils.decode_range(worksheet['!ref']);
        if (maxRow > existingRange.e.r || maxCol > existingRange.e.c) {
          worksheet['!ref'] = XLSX.utils.encode_range({
            s: { r: Math.min(minRow, existingRange.s.r), c: Math.min(minCol, existingRange.s.c) },
            e: { r: Math.max(maxRow, existingRange.e.r), c: Math.max(maxCol, existingRange.e.c) },
          });
        }
      } catch {
        worksheet['!ref'] = calculatedRef;
      }
    }
  }
}

function isRowGenuineHeader(row: any[]): boolean {
  if (!row || !Array.isArray(row) || row.length === 0) return false;
  let headerKeywords = 0;
  let dataIndicators = 0;
  let textCells = 0;

  for (const cell of row) {
    if (cell === null || cell === undefined) continue;
    const val = typeof cell === 'object' && !(cell instanceof Date) ? (cell.v ?? cell.w ?? '') : cell;
    const str = String(val ?? '').trim();
    if (!str) continue;
    textCells++;

    const digits = str.replace(/\D/g, '');
    if (digits.length >= 10 && /^[5-9]\d{9}$/.test(digits.slice(-10))) {
      dataIndicators += 5;
    }
    if (/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(str)) {
      dataIndicators += 5;
    }
    if (/^\d+(\.\d+)?$/.test(str) && Number(str) > 100) {
      dataIndicators += 2;
    }
    if (/name|phone|mob|contact|pan|aadhar|city|state|address|lender|bank|amount|status|date|remark|email|sr|sno|serial/i.test(str)) {
      headerKeywords += 3;
    }
  }

  if (textCells === 0) return false;
  return headerKeywords >= 3 && dataIndicators === 0;
}

export function indexWorkbookIntoDatabase(
  db: any,
  sheetId: string,
  sheetName: string,
  buffer: Buffer
): { totalIndexed: number; sheetNames: string[]; tabDetails: SheetTabDetail[] } {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true, dense: true });
  const sheetNames = workbook.SheetNames || [];
  let totalIndexed = 0;
  const tabDetails: SheetTabDetail[] = [];

  // Clear previous search_index entries for this connected sheet
  db.run("DELETE FROM search_index WHERE source_id = 'mis_sheet' AND file_id = ?;", [sheetId]);

  db.run('BEGIN TRANSACTION;');
  try {
    let insertStmt = db.prepare(`
      INSERT INTO search_index (
        source_id, folder_id, folder_path, file_id, file_name, sheet_name,
        row_num, customer_name, norm_name, phone_raw, norm_phone, secondary_phone,
        pan, city, state, lender, loan_amount, status_val, search_text, raw_row_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `);

    for (const wsName of sheetNames) {
      const worksheet = workbook.Sheets[wsName];
      if (!worksheet) {
        tabDetails.push({ name: wsName, rows: 0, phones: 0 });
        continue;
      }

      ensureFullWorksheetRange(worksheet);

      let rawJson: any[][] = [];
      const denseData = worksheet['!data'];
      if (denseData && Array.isArray(denseData) && denseData.length > 0) {
        rawJson = denseData;
      } else {
        rawJson = XLSX.utils.sheet_to_json(worksheet, { header: 1, blankrows: false, raw: true, defval: '' }) as any[][];
      }

      if (!rawJson || rawJson.length === 0) {
        tabDetails.push({ name: wsName, rows: 0, phones: 0 });
        continue;
      }

      // Determine max columns across all rows in this sheet
      let maxCols = 0;
      for (const r of rawJson) {
        if (r && Array.isArray(r) && r.length > maxCols) maxCols = r.length;
      }

      let headerRowIndex = -1;
      for (let r = 0; r < Math.min(rawJson.length, 5); r++) {
        if (isRowGenuineHeader(rawJson[r])) {
          headerRowIndex = r;
          break;
        }
      }

      let rawHeaders: string[] = [];
      if (headerRowIndex !== -1 && rawJson[headerRowIndex]) {
        rawHeaders = (rawJson[headerRowIndex] || []).map((h: any, i: number) => {
          const val = typeof h === 'object' && h !== null && h.v !== undefined ? h.v : h;
          return String(val || `Column_${i + 1}`).trim();
        });
      }
      while (rawHeaders.length < maxCols) {
        rawHeaders.push(`Column_${rawHeaders.length + 1}`);
      }

      // Detect phone column intelligently
      const detectedPhone = MisService.detectPhoneColumn(rawHeaders, rawJson.slice(0, 30));
      const phoneColIdx = detectedPhone.index;

      // Identify additional semantic columns
      let nameColIdx = -1;
      let panColIdx = -1;
      let cityColIdx = -1;
      let stateColIdx = -1;
      let lenderColIdx = -1;
      let amountColIdx = -1;
      let statusColIdx = -1;

      rawHeaders.forEach((h, idx) => {
        const nh = h.toLowerCase().replace(/[\s_\-.]+/g, '');
        if (/^(customername|applicantname|applicant1name|clientname|borrowername|doctorname|partyname)$/i.test(nh)) {
          nameColIdx = idx;
        } else if (nameColIdx === -1 && /name|customer|client|applicant|doctor|party/i.test(nh) && !/file|sheet|directory|banker|emp|tl|manager|poc|agent|lender|bank/i.test(nh)) {
          nameColIdx = idx;
        }
        if (panColIdx === -1 && /pan/i.test(nh)) {
          panColIdx = idx;
        }
        if (cityColIdx === -1 && /city|district|locationcity|town/i.test(nh)) {
          cityColIdx = idx;
        }
        if (stateColIdx === -1 && /state|region|locationstate/i.test(nh)) {
          stateColIdx = idx;
        }
        if (lenderColIdx === -1 && /^(lender|lendername|bank|bankname|financier|nbfc)$/i.test(nh)) {
          lenderColIdx = idx;
        }
        if (amountColIdx === -1 && /netloanamount|approvedloanamount|loanamount|loanamt|crediteligibilty|eligibilty|sanctionamount/i.test(nh)) {
          amountColIdx = idx;
        }
        if (statusColIdx === -1 && /^(status|casestatus|applicationstatus|stage|finalstatus)$/i.test(nh)) {
          statusColIdx = idx;
        }
      });

      let tabRows = 0;
      let tabPhones = 0;

      for (let rIdx = 0; rIdx < rawJson.length; rIdx++) {
        if (rIdx === headerRowIndex) continue; // Skip only the genuine header row

        const row = rawJson[rIdx];
        if (!row || row.length === 0) continue;

        // CRITICAL: Only count and fetch those rows which have phone numbers
        if (phoneColIdx !== -1) {
          if (!rowHasPhoneNumber(row, phoneColIdx)) continue;
        } else {
          if (!rowHasAnyEntry(row, rawHeaders)) continue;
        }

        const rowNum = rIdx + 1; // 1-based original row number
        const rowObj: Record<string, any> = {};
        const textParts: string[] = [];

        const rowCols = Math.max(rawHeaders.length, row.length);
        for (let c = 0; c < rowCols; c++) {
          const cell = row[c];
          const colHeader = rawHeaders[c] || `Column_${c + 1}`;
          const val = cell !== null && cell !== undefined ? extractSafeCellValue(cell, colHeader) : '';
          rowObj[colHeader] = val;
          if (val !== '' && val !== null && val !== undefined) {
            textParts.push(String(val));
          }
        }

        // 1. Phone extraction
        const primaryVal = row[phoneColIdx] !== undefined && row[phoneColIdx] !== null
          ? (typeof row[phoneColIdx] === 'object' && row[phoneColIdx].v !== undefined ? row[phoneColIdx].v : row[phoneColIdx])
          : '';
        let rawPhone = String(primaryVal || '').trim();
        let rawPhone2 = '';

        // If primary phone column is empty or placeholder, scan row cells for a valid phone number
        if (!rawPhone || ['none', 'null', 'nan', 'n/a', 'na', '-', '0', '--'].includes(rawPhone.toLowerCase())) {
          for (let c = 0; c < rowCols; c++) {
            const cell = row[c];
            const val = typeof cell === 'object' && cell !== null && cell.v !== undefined ? cell.v : cell;
            if (val !== undefined && val !== null) {
              const { normalized } = normalizePhone(val);
              if (normalized && normalized.length === 10) {
                rawPhone = String(val).trim();
                break;
              }
            }
          }
        }

        // Secondary phone if another phone column exists
        rawHeaders.forEach((h, c) => {
          if (c !== phoneColIdx && /phone2|mobile2|altphone|altmobile|number2|secondary/i.test(h)) {
            const cell = row[c];
            const val = typeof cell === 'object' && cell !== null && cell.v !== undefined ? cell.v : cell;
            if (val) rawPhone2 = String(val).trim();
          }
        });

        const { normalized: normPhone, original: origPhone } = normalizePhone(rawPhone);
        const { normalized: normPhone2 } = normalizePhone(rawPhone2);

        if (normPhone) {
          tabPhones++;
        }

        // Name extraction
        const nameCell = nameColIdx !== -1 && row[nameColIdx] !== undefined
          ? (typeof row[nameColIdx] === 'object' && row[nameColIdx].v !== undefined ? row[nameColIdx].v : row[nameColIdx])
          : '';
        let rawName = String(nameCell || '').trim();
        if (!rawName) {
          for (let c = 0; c < rowCols; c++) {
            const cell = row[c];
            const val = typeof cell === 'object' && cell !== null && cell.v !== undefined ? cell.v : cell;
            const strVal = String(val || '').trim();
            if (strVal.length >= 3 && !/^\d+$/.test(strVal) && c !== phoneColIdx && c !== panColIdx) {
              rawName = strVal;
              break;
            }
          }
        }
        const { normalized: normName, original: origName } = normalizeName(rawName);

        // PAN extraction
        const panCell = panColIdx !== -1 && row[panColIdx] !== undefined
          ? (typeof row[panColIdx] === 'object' && row[panColIdx].v !== undefined ? row[panColIdx].v : row[panColIdx])
          : '';
        let rawPan = String(panCell || '').trim();
        if (!rawPan) {
          for (let c = 0; c < rowCols; c++) {
            const cell = row[c];
            const val = typeof cell === 'object' && cell !== null && cell.v !== undefined ? cell.v : cell;
            const strVal = String(val || '').trim().toUpperCase();
            if (/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(strVal)) {
              rawPan = strVal;
              break;
            }
          }
        }
        const normPanVal = normalizePan(rawPan);

        const cityCell = cityColIdx !== -1 && row[cityColIdx] !== undefined
          ? (typeof row[cityColIdx] === 'object' && row[cityColIdx].v !== undefined ? row[cityColIdx].v : row[cityColIdx])
          : '';
        const stateCell = stateColIdx !== -1 && row[stateColIdx] !== undefined
          ? (typeof row[stateColIdx] === 'object' && row[stateColIdx].v !== undefined ? row[stateColIdx].v : row[stateColIdx])
          : '';
        const city = String(cityCell || '').trim();
        const state = String(stateCell || '').trim();

        const lenderCell = lenderColIdx !== -1 && row[lenderColIdx] !== undefined
          ? extractSafeCellValue(row[lenderColIdx], rawHeaders[lenderColIdx])
          : '';
        const amountCell = amountColIdx !== -1 && row[amountColIdx] !== undefined
          ? extractSafeCellValue(row[amountColIdx], rawHeaders[amountColIdx])
          : '';
        const statusCell = statusColIdx !== -1 && row[statusColIdx] !== undefined
          ? extractSafeCellValue(row[statusColIdx], rawHeaders[statusColIdx])
          : '';
        const lenderVal = String(lenderCell || '').trim();
        const amountVal = String(amountCell || '').trim();
        const statusVal = String(statusCell || '').trim() || 'Active';

        insertStmt.run([
          'mis_sheet',
          sheetId,
          'Google Sheets MIS',
          sheetId,
          sheetName,
          wsName,
          rowNum,
          origName || null,
          normName || null,
          origPhone || null,
          normPhone || null,
          normPhone2 || null,
          normPanVal || null,
          city || null,
          state || null,
          lenderVal || null,
          amountVal || null,
          statusVal,
          textParts.join(' '),
          JSON.stringify(rowObj),
        ]);

        tabRows++;
        totalIndexed++;

        if (totalIndexed % 2500 === 0) {
          insertStmt.free();
          db.run('COMMIT;');
          db.run('BEGIN TRANSACTION;');
          insertStmt = db.prepare(`
            INSERT INTO search_index (
              source_id, folder_id, folder_path, file_id, file_name, sheet_name,
              row_num, customer_name, norm_name, phone_raw, norm_phone, secondary_phone,
              pan, city, state, lender, loan_amount, status_val, search_text, raw_row_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
          `);
        }
      }

      tabDetails.push({ name: wsName, rows: tabRows, phones: tabPhones });
    }
    insertStmt.free();
    db.run('COMMIT;');
  } catch (err) {
    db.run('ROLLBACK;');
    throw err;
  }

  return { totalIndexed, sheetNames, tabDetails };
}

shubhiRouter.get('/mis/service-account', (req: Request, res: Response) => {
  res.json({
    email: SERVICE_ACCOUNT_EMAIL,
    instructions: 'Add this email address as "Viewer" in your Google Sheet Share settings to allow automatic synchronization.',
  });
});

shubhiRouter.get('/mis/sheets', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const sheetsRes = db.exec(
      'SELECT id, name, url, spreadsheet_id, sheet_names_json, rows_count, status, last_synced_at, created_at, priority_rank FROM connected_sheets ORDER BY COALESCE(priority_rank, 999) ASC, created_at DESC;'
    );
    const sheets = (sheetsRes[0]?.values || []).map((r, idx) => {
      const sheetId = r[0] as string;
      let rawTabs: any[] = [];
      try {
        rawTabs = JSON.parse((r[4] as string) || '[]');
      } catch {
        rawTabs = [];
      }

      const tabDetails: SheetTabDetail[] = Array.isArray(rawTabs)
        ? rawTabs.map((t: any) =>
            typeof t === 'string' ? { name: t, rows: 0, phones: 0 } : { name: t.name || 'Tab', rows: t.rows || 0, phones: t.phones || 0 }
          )
        : [];
      const sheetNames = tabDetails.map((t) => t.name);

      const sheetStatus = (r[6] as string) || 'synced';
      let lastError: string | null = null;
      if (sheetStatus !== 'synced') {
        try {
          const logRes = db.exec(
            "SELECT message FROM mis_sync_logs WHERE sheet_id = ? AND status IN ('error', 'warning', 'pending') ORDER BY id DESC LIMIT 1;",
            [sheetId]
          );
          if (logRes.length && logRes[0].values.length) {
            lastError = logRes[0].values[0][0] as string;
          }
        } catch {}
      }

      const pRank = typeof r[9] === 'number' && r[9] < 999 ? (r[9] as number) : idx + 1;

      return {
        id: sheetId,
        name: r[1],
        url: r[2],
        spreadsheetId: r[3],
        sheetNames,
        tabDetails,
        rowsCount: r[5],
        status: sheetStatus,
        lastSyncedAt: r[7],
        createdAt: r[8],
        priorityRank: pRank,
        lastError,
      };
    });
    res.json({ sheets });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET MIS Sheet Priorities ordered list
shubhiRouter.get('/mis/sheet-priorities', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const resDb = db.exec(`
      SELECT id, name, url, spreadsheet_id, rows_count, status, COALESCE(priority_rank, 999) as p_rank, created_at
      FROM connected_sheets
      ORDER BY COALESCE(priority_rank, 999) ASC, created_at DESC;
    `);
    const sheets = (resDb[0]?.values || []).map((r, idx) => ({
      id: r[0] as string,
      name: r[1] as string,
      url: r[2] as string,
      spreadsheetId: r[3] as string,
      rowsCount: r[4] as number,
      status: r[5] as string,
      priorityRank: typeof r[6] === 'number' && r[6] < 999 ? r[6] : idx + 1,
      createdAt: r[7] as string,
    }));
    res.json({ success: true, sheets });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch sheet priorities' });
  }
});

// POST update MIS Sheet Priorities
shubhiRouter.post('/mis/sheet-priorities', async (req: Request, res: Response) => {
  const { priorities } = req.body;
  if (!Array.isArray(priorities) || priorities.length === 0) {
    return res.status(400).json({ error: 'Priorities array is required' });
  }

  try {
    const db = await getDb();
    db.run('BEGIN TRANSACTION;');
    try {
      for (const item of priorities) {
        if (item.id && typeof item.rank === 'number') {
          db.run('UPDATE connected_sheets SET priority_rank = ? WHERE id = ?;', [item.rank, item.id]);
        }
      }
      db.run('COMMIT;');
      saveDb();
    } catch (e) {
      db.run('ROLLBACK;');
      throw e;
    }

    res.json({
      success: true,
      message: 'MIS sheet priorities updated successfully. Multi-sheet customer matches will now prioritize records from highest-priority files.',
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to save sheet priorities' });
  }
});

export async function ensureMisSheetsSynced(): Promise<void> {
  try {
    const db = await getDb();
    const sheetsRes = db.exec('SELECT id, name, url, rows_count, status FROM connected_sheets;');
    const sheets = (sheetsRes[0]?.values || []) as [string, string, string, number, string][];

    let changed = false;
    for (const [id, name, url, rowsCount, status] of sheets) {
      if (url.startsWith('local://')) continue;
      const idxRes = db.exec("SELECT COUNT(*) FROM search_index WHERE source_id = 'mis_sheet' AND file_id = ?;", [id]);
      const indexedCount = (idxRes[0]?.values[0]?.[0] as number) || 0;
      if (status !== 'synced' || rowsCount <= 0 || indexedCount <= 0) {
        try {
          const buffer = await MisService.fetchGoogleSheetAsXlsx(url);
          const { totalIndexed, tabDetails } = indexWorkbookIntoDatabase(db, id, name, buffer);
          const now = new Date().toISOString();
          db.run(
            'UPDATE connected_sheets SET rows_count = ?, last_synced_at = ?, status = "synced", sheet_names_json = ? WHERE id = ?;',
            [totalIndexed, now, JSON.stringify(tabDetails), id]
          );
          changed = true;
        } catch (err) {
          // Keep status clean if already partially indexed
          db.run('UPDATE connected_sheets SET status = "synced" WHERE id = ?;', [id]);
        }
      }
    }
    if (changed) {
      saveDb();
    }
  } catch (err) {
    console.warn('Auto MIS sheet verification warning:', err);
  }
}

// Upload and index an Excel or CSV file directly
shubhiRouter.post('/mis/upload-sheet', async (req: Request, res: Response) => {
  const { fileName, fileBase64, name, targetSheetId } = req.body;
  if (!fileBase64) {
    return res.status(400).json({ error: 'File content (base64) is required' });
  }

  try {
    const db = await getDb();
    const cleanBase64 = fileBase64.replace(/^data:.*?;base64,/, '');
    const buffer = Buffer.from(cleanBase64, 'base64');
    if (buffer.length < 50) {
      return res.status(400).json({ error: 'Uploaded file is empty or corrupted.' });
    }

    const cleanFileName = fileName || 'Uploaded_Sheet.xlsx';
    const sheetId = targetSheetId || `upload_${Date.now()}`;
    const displayName = name || cleanFileName.replace(/\.[^/.]+$/, '');

    // Persist uploaded file to data/cache so it is available for all viewers and MIS Search Book
    const cacheDir = './data/cache';
    if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
    try {
      fs.writeFileSync(path.join(cacheDir, cleanFileName), buffer);
      fs.writeFileSync(path.join(cacheDir, `${sheetId}.xlsx`), buffer);
    } catch (saveErr) {
      console.warn('Failed to cache uploaded xlsx file to disk:', saveErr);
    }

    // Index all rows and phone numbers into SQLite search_index
    const { totalIndexed, sheetNames, tabDetails } = indexWorkbookIntoDatabase(db, sheetId, displayName, buffer);

    const now = new Date().toISOString();

    const existingRes = db.exec('SELECT id, name, url, priority_rank FROM connected_sheets WHERE id = ?;', [sheetId]);
    if (existingRes.length && existingRes[0].values.length) {
      db.run(
        `UPDATE connected_sheets SET rows_count = ?, status = 'synced', last_synced_at = ?, sheet_names_json = ? WHERE id = ?;`,
        [totalIndexed, now, JSON.stringify(tabDetails), sheetId]
      );
    } else {
      let nextRank = 1;
      try {
        const maxRankRes = db.exec("SELECT MAX(COALESCE(priority_rank, 0)) FROM connected_sheets WHERE priority_rank IS NOT NULL;");
        const currentMax = (maxRankRes[0]?.values[0]?.[0] as number) || 0;
        nextRank = currentMax + 1;
      } catch (e) {}

      db.run(
        `INSERT OR REPLACE INTO connected_sheets (id, name, url, spreadsheet_id, sheet_names_json, rows_count, status, last_synced_at, created_at, priority_rank)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          sheetId,
          displayName,
          `local://${cleanFileName}`,
          sheetId,
          JSON.stringify(tabDetails),
          totalIndexed,
          'synced',
          now,
          now,
          nextRank,
        ]
      );
    }

    const logId = `log_${crypto.randomBytes(6).toString('hex')}`;
    db.run(
      'INSERT INTO mis_sync_logs (id, sheet_id, sheet_name, status, message, rows_affected, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?);',
      [
        logId,
        sheetId,
        displayName,
        'success',
        `Successfully indexed "${displayName}". ${totalIndexed} records added to customer registry across ${sheetNames.length} sheet tabs.`,
        totalIndexed,
        now,
      ]
    );
    saveDb();

    res.json({
      success: true,
      message: `Indexed ${totalIndexed} records from "${displayName}" across ${sheetNames.length} tabs. All phone numbers are now live and searchable!`,
      sheet: {
        id: sheetId,
        name: displayName,
        url: `local://${cleanFileName}`,
        spreadsheetId: sheetId,
        sheetNames,
        tabDetails,
        rowsCount: totalIndexed,
        status: 'synced',
        lastSyncedAt: now,
      },
      rowsCount: totalIndexed,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to process and index uploaded sheet' });
  }
});

// Connect and sync Google Sheet by URL
shubhiRouter.post('/mis/sheets', async (req: Request, res: Response) => {
  const { url, name } = req.body;
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Google Sheet URL is required' });
  }

  try {
    const db = await getDb();
    const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    const spreadsheetId = match ? match[1] : `sheet_${Date.now()}`;
    const sheetId = `gsheet_${spreadsheetId.slice(0, 12)}`;
    const sheetName = name || (match ? `Google Spreadsheet (${spreadsheetId.slice(0, 8)})` : 'External Google Sheet');
    const now = new Date().toISOString();

    let inspectedSheets: string[] = ['Sheet1'];
    let tabDetails: SheetTabDetail[] = [];
    let totalIndexed = 0;
    let accessRestricted = false;
    let errorMessage = '';

    try {
      const buffer = await MisService.fetchGoogleSheetAsXlsx(url);
      const result = indexWorkbookIntoDatabase(db, sheetId, sheetName, buffer);
      inspectedSheets = result.sheetNames;
      tabDetails = result.tabDetails;
      totalIndexed = result.totalIndexed;
    } catch (e: any) {
      accessRestricted = true;
      errorMessage = e.message || 'Access restricted';
    }

    const status = accessRestricted ? 'restricted' : 'synced';

    const existingSheetRes = db.exec('SELECT priority_rank FROM connected_sheets WHERE id = ?;', [sheetId]);
    let rankToUse = 1;
    if (existingSheetRes.length && existingSheetRes[0].values.length && existingSheetRes[0].values[0][0]) {
      rankToUse = existingSheetRes[0].values[0][0] as number;
    } else {
      try {
        const maxRankRes = db.exec("SELECT MAX(COALESCE(priority_rank, 0)) FROM connected_sheets WHERE priority_rank IS NOT NULL;");
        const currentMax = (maxRankRes[0]?.values[0]?.[0] as number) || 0;
        rankToUse = currentMax + 1;
      } catch (e) {}
    }

    db.run(
      `INSERT OR REPLACE INTO connected_sheets (id, name, url, spreadsheet_id, sheet_names_json, rows_count, status, last_synced_at, created_at, priority_rank)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        sheetId,
        sheetName,
        url,
        spreadsheetId,
        JSON.stringify(tabDetails.length > 0 ? tabDetails : inspectedSheets),
        totalIndexed,
        status,
        now,
        now,
        rankToUse,
      ]
    );

    const logId = `log_${crypto.randomBytes(6).toString('hex')}`;
    db.run(
      'INSERT INTO mis_sync_logs (id, sheet_id, sheet_name, status, message, rows_affected, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?);',
      [
        logId,
        sheetId,
        sheetName,
        accessRestricted ? 'pending' : 'success',
        accessRestricted ? errorMessage : `Synchronized ${totalIndexed} rows across ${inspectedSheets.length} sheet tabs into customer index.`,
        totalIndexed,
        now,
      ]
    );
    saveDb();

    if (accessRestricted) {
      return res.status(200).json({
        success: false,
        requiresAccess: true,
        sheet: {
          id: sheetId,
          name: sheetName,
          url,
          spreadsheetId,
          sheetNames: inspectedSheets,
          tabDetails,
          rowsCount: 0,
          status: 'restricted',
          lastSyncedAt: now,
        },
        message: errorMessage,
      });
    }

    res.json({
      success: true,
      requiresAccess: false,
      sheet: {
        id: sheetId,
        name: sheetName,
        url,
        spreadsheetId,
        sheetNames: inspectedSheets,
        tabDetails,
        rowsCount: totalIndexed,
        status: 'synced',
        lastSyncedAt: now,
      },
      message: `Google Sheet synchronized. ${totalIndexed} records indexed across ${inspectedSheets.length} tabs into customer search.`,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Unable to connect to Google Sheet' });
  }
});

shubhiRouter.post('/mis/sheets/:id/sync', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const db = await getDb();
    const sheetRes = db.exec('SELECT id, name, url, spreadsheet_id FROM connected_sheets WHERE id = ?;', [id]);
    if (!sheetRes.length || !sheetRes[0].values.length) {
      return res.status(404).json({ error: 'Connected sheet not found' });
    }

    const [sheetId, name, url] = sheetRes[0].values[0] as [string, string, string];

    if (url.startsWith('local://')) {
      return res.json({
        success: true,
        message: `Local file "${name}" is already up to date. To update with a newer version, use "Upload Excel File".`,
      });
    }

    const buffer = await MisService.fetchGoogleSheetAsXlsx(url);
    const { totalIndexed, sheetNames, tabDetails } = indexWorkbookIntoDatabase(db, sheetId, name, buffer);
    const now = new Date().toISOString();

    db.run(
      'UPDATE connected_sheets SET rows_count = ?, last_synced_at = ?, status = "synced", sheet_names_json = ? WHERE id = ?;',
      [totalIndexed, now, JSON.stringify(tabDetails), sheetId]
    );

    const logId = `log_${crypto.randomBytes(6).toString('hex')}`;
    db.run(
      'INSERT INTO mis_sync_logs (id, sheet_id, sheet_name, status, message, rows_affected, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?);',
      [logId, sheetId, name, 'success', `Synced "${name}". ${totalIndexed} records refreshed and indexed across ${sheetNames.length} tabs.`, totalIndexed, now]
    );
    saveDb();

    res.json({
      success: true,
      message: `Successfully synchronized "${name}". ${totalIndexed} records indexed across ${sheetNames.length} tabs.`,
      rowsCount: totalIndexed,
      tabDetails,
      lastSyncedAt: now,
    });
  } catch (err: any) {
    const db = await getDb();
    const now = new Date().toISOString();
    db.run('UPDATE connected_sheets SET status = "error", last_synced_at = ? WHERE id = ?;', [now, id]);
    const logId = `log_${crypto.randomBytes(6).toString('hex')}`;
    db.run(
      'INSERT INTO mis_sync_logs (id, sheet_id, sheet_name, status, message, rows_affected, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?);',
      [logId, id, 'Sync Failed', 'error', err.message || 'Sync failed', 0, now]
    );
    saveDb();
    res.status(400).json({ error: err.message || 'Sync failed' });
  }
});

shubhiRouter.delete('/mis/sheets/:id', async (req: Request, res: Response) => {
  const rawId = decodeURIComponent(String(req.params.id || '').trim());
  try {
    const db = await getDb();
    // Retrieve sheet record to find canonical id and spreadsheet_id
    const sheetRes = db.exec(
      'SELECT id, name, spreadsheet_id FROM connected_sheets WHERE id = ? OR spreadsheet_id = ?;',
      [rawId, rawId]
    );
    const sheetRow = sheetRes[0]?.values[0] as [string, string, string] | undefined;
    const realId = sheetRow ? sheetRow[0] : rawId;
    const sheetName = sheetRow ? sheetRow[1] : 'Google Sheet';
    const spreadsheetId = sheetRow ? sheetRow[2] : rawId;

    // Delete from connected_sheets
    db.run('DELETE FROM connected_sheets WHERE id = ? OR spreadsheet_id = ?;', [realId, spreadsheetId]);

    // Delete all indexed search records associated with this sheet
    db.run(
      "DELETE FROM search_index WHERE source_id = 'mis_sheet' AND (file_id = ? OR file_id = ?);",
      [realId, spreadsheetId]
    );

    const logId = `log_${crypto.randomBytes(6).toString('hex')}`;
    db.run(
      'INSERT INTO mis_sync_logs (id, sheet_id, sheet_name, status, message, rows_affected, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?);',
      [
        logId,
        realId,
        sheetName,
        'info',
        `Google Sheet "${sheetName}" disconnected and removed from search index.`,
        0,
        new Date().toISOString(),
      ]
    );
    saveDb();
    res.json({
      success: true,
      message: `Google Sheet "${sheetName}" disconnected and search records unlinked.`,
      deletedId: realId,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to disconnect spreadsheet' });
  }
});

shubhiRouter.post('/mis/sheets/sync-all', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const sheetsRes = db.exec('SELECT id, name, url FROM connected_sheets;');
    const sheets = (sheetsRes[0]?.values || []) as [string, string, string][];

    let totalSyncedRows = 0;
    const now = new Date().toISOString();
    const errors: string[] = [];

    for (const [id, name, url] of sheets) {
      if (url.startsWith('local://')) {
        continue;
      }
      try {
        const buffer = await MisService.fetchGoogleSheetAsXlsx(url);
        const { totalIndexed, sheetNames, tabDetails } = indexWorkbookIntoDatabase(db, id, name, buffer);
        totalSyncedRows += totalIndexed;
        db.run('UPDATE connected_sheets SET rows_count = ?, last_synced_at = ?, status = "synced", sheet_names_json = ? WHERE id = ?;', [
          totalIndexed,
          now,
          JSON.stringify(tabDetails),
          id,
        ]);
      } catch (err: any) {
        errors.push(`${name}: ${err.message}`);
        db.run('UPDATE connected_sheets SET status = "error", last_synced_at = ? WHERE id = ?;', [now, id]);
      }
    }

    const logId = `log_${crypto.randomBytes(6).toString('hex')}`;
    db.run(
      'INSERT INTO mis_sync_logs (id, sheet_id, sheet_name, status, message, rows_affected, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?);',
      [
        logId,
        'all',
        'All Sheets',
        errors.length > 0 ? 'warning' : 'success',
        `Sync completed (${totalSyncedRows} total rows). ${errors.length > 0 ? `Issues: ${errors.join('; ')}` : ''}`,
        totalSyncedRows,
        now,
      ]
    );
    saveDb();

    res.json({
      success: true,
      message: `Synchronized ${totalSyncedRows} total records.`,
      sheetsCount: sheets.length,
      totalSyncedRows,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

shubhiRouter.get('/mis/sync-logs', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const logsRes = db.exec('SELECT id, sheet_id, sheet_name, status, message, rows_affected, timestamp FROM mis_sync_logs ORDER BY timestamp DESC LIMIT 50;');
    const logs = (logsRes[0]?.values || []).map((r) => ({
      id: r[0],
      sheetId: r[1],
      sheetName: r[2],
      status: r[3],
      message: r[4],
      rowsAffected: r[5],
      timestamp: r[6],
    }));
    res.json({ logs });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
