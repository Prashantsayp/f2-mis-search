import { getDb } from './db.js';
import { normalizePhone, normalizeName, analyzeRowSegment, extractSafeCellValue, extractMonthYearLabel } from './normalizer.js';
import { determineLeadPriority, getPriorityRules, evaluateSingleRecordPriority, LeadPriorityRule, formatTeamXSheetName } from './priority.js';
import * as XLSXNamespace from 'xlsx';
const XLSX: any = (XLSXNamespace as any).default || XLSXNamespace;
import ExcelJS from 'exceljs';

export interface SearchMatch {
  id: number;
  sourceId: string;
  folderId: string;
  folderPath: string;
  fileId: string;
  fileName: string;
  sheetName: string;
  rowNum: number;
  customerName: string;
  phoneRaw: string;
  normPhone: string;
  pan: string;
  city: string;
  state: string;
  lender: string;
  loanAmount: string;
  statusVal: string;
  matchType: 'Exact Phone' | 'Exact Name' | 'Normalized Name' | 'Partial Name' | 'Smart Match';
  matchedColumn: string;
  matchedOriginalValue: string;
  rawRow: Record<string, any>;
  priority?: string;
  priorityCategory?: string;
  priorityRank?: number;
  priorityBadge?: {
    bg: string;
    text: string;
    border: string;
  };
}

export interface SearchOptions {
  query: string;
  searchType: 'phone' | 'name' | 'smart';
  sourceId?: string;
  folderId?: string;
  fileId?: string;
  sheetName?: string;
  limit?: number;
  offset?: number;
}

export class SearchEngine {
  // Global search across indexed records
  async search(options: SearchOptions): Promise<{
    matches: SearchMatch[];
    totalCount: number;
    searchQuery: string;
    searchType: string;
    durationMs: number;
    sourcesSearched: { filesCount: number; sheetsCount: number; recordsCount: number };
  }> {
    const db = await getDb();
    const startTime = Date.now();
    const { query, searchType, sourceId, limit = 100, offset = 0 } = options;

    // Get search scope counts (only main directory files)
    let countSql = "SELECT COUNT(DISTINCT file_id), COUNT(DISTINCT file_id || sheet_name), COUNT(*) FROM search_index WHERE source_id != 'mis_sheet' AND file_id NOT LIKE 'gsheet_%' AND folder_path != 'Google Sheets MIS' AND LOWER(file_name) NOT LIKE '%mis copy%'";
    const countParams: any[] = [];
    if (sourceId) {
      countSql += ' AND source_id = ?';
      countParams.push(sourceId);
    }
    const scopeRes = db.exec(countSql, countParams);
    const filesCount = scopeRes[0]?.values[0]?.[0] as number || 0;
    const sheetsCount = scopeRes[0]?.values[0]?.[1] as number || 0;
    const recordsCount = scopeRes[0]?.values[0]?.[2] as number || 0;

    const matches: SearchMatch[] = [];
    let totalCount = 0;

    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      return {
        matches: [],
        totalCount: 0,
        searchQuery: query,
        searchType,
        durationMs: Date.now() - startTime,
        sourcesSearched: { filesCount, sheetsCount, recordsCount },
      };
    }

    if (searchType === 'phone') {
      const { normalized: normQueryPhone } = normalizePhone(trimmedQuery);
      const targetPhone = normQueryPhone || trimmedQuery.replace(/\D/g, '');

      let sql = `
        SELECT id, source_id, folder_id, folder_path, file_id, file_name, sheet_name,
               row_num, customer_name, phone_raw, norm_phone, pan, city, state,
               lender, loan_amount, status_val, raw_row_json
        FROM search_index
        WHERE (norm_phone = ? OR norm_phone LIKE ? OR phone_raw LIKE ?)
          AND source_id != 'mis_sheet'
          AND file_id NOT LIKE 'gsheet_%'
          AND folder_path != 'Google Sheets MIS'
          AND LOWER(file_name) NOT LIKE '%mis copy%'
      `;
      const params: any[] = [targetPhone, `%${targetPhone}%`, `%${trimmedQuery}%`];

      if (sourceId) {
        sql += ' AND source_id = ?';
        params.push(sourceId);
      }
      sql += ' ORDER BY (norm_phone = ?) DESC, row_num ASC LIMIT ? OFFSET ?';
      params.push(targetPhone, limit, offset);

      const res = db.exec(sql, params);
      if (res.length > 0 && res[0].values.length > 0) {
        const rows = res[0].values;
        for (const row of rows) {
          const rawRowJson = row[17] as string;
          let rawRow: Record<string, any> = {};
          try { rawRow = JSON.parse(rawRowJson); } catch (e) {}

          const pRaw = (row[9] as string) || '';
          const pNorm = (row[10] as string) || '';
          const isExact = pNorm === targetPhone;

          matches.push({
            id: row[0] as number,
            sourceId: row[1] as string,
            folderId: row[2] as string,
            folderPath: row[3] as string,
            fileId: row[4] as string,
            fileName: row[5] as string,
            sheetName: row[6] as string,
            rowNum: row[7] as number,
            customerName: (row[8] as string) || '',
            phoneRaw: pRaw,
            normPhone: pNorm,
            pan: (row[11] as string) || '',
            city: (row[12] as string) || '',
            state: (row[13] as string) || '',
            lender: (row[14] as string) || '',
            loanAmount: (row[15] as string) || '',
            statusVal: (row[16] as string) || '',
            matchType: isExact ? 'Exact Phone' : 'Exact Phone',
            matchedColumn: 'PHONE',
            matchedOriginalValue: pRaw,
            rawRow,
          });
        }
      }

      // Count query
      let cSql = "SELECT COUNT(*) FROM search_index WHERE (norm_phone = ? OR norm_phone LIKE ? OR phone_raw LIKE ?) AND source_id != 'mis_sheet' AND file_id NOT LIKE 'gsheet_%' AND folder_path != 'Google Sheets MIS' AND LOWER(file_name) NOT LIKE '%mis copy%'";
      const cParams = [targetPhone, `%${targetPhone}%`, `%${trimmedQuery}%`];
      if (sourceId) { cSql += ' AND source_id = ?'; cParams.push(sourceId); }
      const countRes = db.exec(cSql, cParams);
      totalCount = (countRes[0]?.values[0]?.[0] as number) || matches.length;

    } else if (searchType === 'name') {
      const { normalized: normQueryName } = normalizeName(trimmedQuery);
      let sql = `
        SELECT id, source_id, folder_id, folder_path, file_id, file_name, sheet_name,
               row_num, customer_name, phone_raw, norm_phone, pan, city, state,
               lender, loan_amount, status_val, raw_row_json
        FROM search_index
        WHERE (norm_name = ? OR norm_name LIKE ? OR customer_name LIKE ?)
          AND source_id != 'mis_sheet'
          AND file_id NOT LIKE 'gsheet_%'
          AND folder_path != 'Google Sheets MIS'
          AND LOWER(file_name) NOT LIKE '%mis copy%'
      `;
      const params: any[] = [normQueryName, `%${normQueryName}%`, `%${trimmedQuery}%`];

      if (sourceId) {
        sql += ' AND source_id = ?';
        params.push(sourceId);
      }
      sql += ' ORDER BY (norm_name = ?) DESC, row_num ASC LIMIT ? OFFSET ?';
      params.push(normQueryName, limit, offset);

      const res = db.exec(sql, params);
      if (res.length > 0 && res[0].values.length > 0) {
        for (const row of res[0].values) {
          const rawRowJson = row[17] as string;
          let rawRow: Record<string, any> = {};
          try { rawRow = JSON.parse(rawRowJson); } catch (e) {}

          const cName = (row[8] as string) || '';
          const { normalized: rowNormName } = normalizeName(cName);
          let matchType: SearchMatch['matchType'] = 'Partial Name';
          if (cName.trim().toLowerCase() === trimmedQuery.toLowerCase()) {
            matchType = 'Exact Name';
          } else if (rowNormName === normQueryName) {
            matchType = 'Normalized Name';
          }

          matches.push({
            id: row[0] as number,
            sourceId: row[1] as string,
            folderId: row[2] as string,
            folderPath: row[3] as string,
            fileId: row[4] as string,
            fileName: row[5] as string,
            sheetName: row[6] as string,
            rowNum: row[7] as number,
            customerName: cName,
            phoneRaw: (row[9] as string) || '',
            normPhone: (row[10] as string) || '',
            pan: (row[11] as string) || '',
            city: (row[12] as string) || '',
            state: (row[13] as string) || '',
            lender: (row[14] as string) || '',
            loanAmount: (row[15] as string) || '',
            statusVal: (row[16] as string) || '',
            matchType,
            matchedColumn: 'CUSTOMER NAME',
            matchedOriginalValue: cName,
            rawRow,
          });
        }
      }

      let cSql = "SELECT COUNT(*) FROM search_index WHERE (norm_name = ? OR norm_name LIKE ? OR customer_name LIKE ?) AND source_id != 'mis_sheet' AND file_id NOT LIKE 'gsheet_%' AND folder_path != 'Google Sheets MIS' AND LOWER(file_name) NOT LIKE '%mis copy%'";
      const cParams = [normQueryName, `%${normQueryName}%`, `%${trimmedQuery}%`];
      if (sourceId) { cSql += ' AND source_id = ?'; cParams.push(sourceId); }
      const countRes = db.exec(cSql, cParams);
      totalCount = (countRes[0]?.values[0]?.[0] as number) || matches.length;

    } else {
      // Smart search across all indexed fields (only main directory files)
      const { normalized: normQueryPhone } = normalizePhone(trimmedQuery);
      const { normalized: normQueryName } = normalizeName(trimmedQuery);
      const targetPhone = normQueryPhone || (/\d{5,}/.test(trimmedQuery) ? trimmedQuery.replace(/\D/g, '') : null);

      let sql = `
        SELECT id, source_id, folder_id, folder_path, file_id, file_name, sheet_name,
               row_num, customer_name, phone_raw, norm_phone, pan, city, state,
               lender, loan_amount, status_val, raw_row_json
        FROM search_index
        WHERE (
          search_text LIKE ?
          OR norm_name LIKE ?
          ${targetPhone ? 'OR norm_phone = ? OR norm_phone LIKE ?' : ''}
          OR pan LIKE ?
          OR city LIKE ?
          OR state LIKE ?
          OR lender LIKE ?
        )
        AND source_id != 'mis_sheet'
        AND file_id NOT LIKE 'gsheet_%'
        AND folder_path != 'Google Sheets MIS'
        AND LOWER(file_name) NOT LIKE '%mis copy%'
      `;
      const searchPattern = `%${trimmedQuery}%`;
      const params: any[] = [searchPattern, `%${normQueryName}%`];
      if (targetPhone) {
        params.push(targetPhone, `%${targetPhone}%`);
      }
      params.push(searchPattern, searchPattern, searchPattern, searchPattern);

      if (sourceId) {
        sql += ' AND source_id = ?';
        params.push(sourceId);
      }
      sql += ' ORDER BY row_num ASC LIMIT ? OFFSET ?';
      params.push(limit, offset);

      const res = db.exec(sql, params);
      if (res.length > 0 && res[0].values.length > 0) {
        for (const row of res[0].values) {
          const rawRowJson = row[17] as string;
          let rawRow: Record<string, any> = {};
          try { rawRow = JSON.parse(rawRowJson); } catch (e) {}

          let matchedCol = 'MULTIPLE FIELDS';
          let matchedVal = trimmedQuery;

          if (row[8] && String(row[8]).toLowerCase().includes(trimmedQuery.toLowerCase())) {
            matchedCol = 'CUSTOMER NAME';
            matchedVal = String(row[8]);
          } else if (row[9] && String(row[9]).includes(trimmedQuery)) {
            matchedCol = 'PHONE';
            matchedVal = String(row[9]);
          } else if (row[11] && String(row[11]).toUpperCase().includes(trimmedQuery.toUpperCase())) {
            matchedCol = 'PAN';
            matchedVal = String(row[11]);
          } else if (row[12] && String(row[12]).toLowerCase().includes(trimmedQuery.toLowerCase())) {
            matchedCol = 'CITY';
            matchedVal = String(row[12]);
          } else if (row[14] && String(row[14]).toLowerCase().includes(trimmedQuery.toLowerCase())) {
            matchedCol = 'LENDER';
            matchedVal = String(row[14]);
          }

          matches.push({
            id: row[0] as number,
            sourceId: row[1] as string,
            folderId: row[2] as string,
            folderPath: row[3] as string,
            fileId: row[4] as string,
            fileName: row[5] as string,
            sheetName: row[6] as string,
            rowNum: row[7] as number,
            customerName: (row[8] as string) || '',
            phoneRaw: (row[9] as string) || '',
            normPhone: (row[10] as string) || '',
            pan: (row[11] as string) || '',
            city: (row[12] as string) || '',
            state: (row[13] as string) || '',
            lender: (row[14] as string) || '',
            loanAmount: (row[15] as string) || '',
            statusVal: (row[16] as string) || '',
            matchType: 'Smart Match',
            matchedColumn: matchedCol,
            matchedOriginalValue: matchedVal,
            rawRow,
          });
        }
      }

      totalCount = matches.length; // estimate
    }

    // Enrich matches with Lead Priority
    const priorityRules = getPriorityRules();
    for (const m of matches) {
      const evaluation = evaluateSingleRecordPriority({
        fileName: m.fileName,
        folderPath: m.folderPath,
        sheetName: m.sheetName,
        rawRow: m.rawRow,
      }, priorityRules);
      m.priority = evaluation.priorityLabel;
      m.priorityCategory = evaluation.categoryName;
      m.priorityRank = Math.floor(evaluation.effectiveRank);
      m.priorityBadge = {
        bg: evaluation.badgeBg,
        text: evaluation.badgeText,
        border: evaluation.badgeBorder,
      };
      m.sheetName = formatTeamXSheetName(m.sheetName, m.fileName, m.folderPath, m.rawRow);
    }

    return {
      matches,
      totalCount,
      searchQuery: query,
      searchType,
      durationMs: Date.now() - startTime,
      sourcesSearched: { filesCount, sheetsCount, recordsCount },
    };
  }

  // Get full original row by search_index ID
  async getFullRow(id: number): Promise<{
    match: SearchMatch | null;
    originalRow: Record<string, any>;
    sourceBreadcrumbs: {
      sourceName: string;
      folderPath: string;
      fileName: string;
      sheetName: string;
      rowNum: number;
    } | null;
  }> {
    const db = await getDb();
    const res = db.exec(`
      SELECT id, source_id, folder_id, folder_path, file_id, file_name, sheet_name,
             row_num, customer_name, phone_raw, norm_phone, pan, city, state,
             lender, loan_amount, status_val, raw_row_json
      FROM search_index
      WHERE id = ?;
    `, [id]);

    if (res.length === 0 || res[0].values.length === 0) {
      return { match: null, originalRow: {}, sourceBreadcrumbs: null };
    }

    const row = res[0].values[0];
    const rawRowJson = row[17] as string;
    let originalRow: Record<string, any> = {};
    try {
      const parsed = JSON.parse(rawRowJson);
      for (const [k, v] of Object.entries(parsed)) {
        originalRow[k] = extractSafeCellValue(v, k);
      }
    } catch (e) {}

    // Get source name
    const sRes = db.exec('SELECT name FROM sources WHERE id = ?;', [row[1]]);
    const sourceName = (sRes[0]?.values[0]?.[0] as string) || 'Primary Directory';

    const match: SearchMatch = {
      id: row[0] as number,
      sourceId: row[1] as string,
      folderId: row[2] as string,
      folderPath: row[3] as string,
      fileId: row[4] as string,
      fileName: row[5] as string,
      sheetName: row[6] as string,
      rowNum: row[7] as number,
      customerName: (row[8] as string) || '',
      phoneRaw: (row[9] as string) || '',
      normPhone: (row[10] as string) || '',
      pan: (row[11] as string) || '',
      city: (row[12] as string) || '',
      state: (row[13] as string) || '',
      lender: (row[14] as string) || '',
      loanAmount: (row[15] as string) || '',
      statusVal: (row[16] as string) || '',
      matchType: 'Exact Phone',
      matchedColumn: '',
      matchedOriginalValue: '',
      rawRow: originalRow,
    };

    return {
      match,
      originalRow,
      sourceBreadcrumbs: {
        sourceName,
        folderPath: (row[3] as string) || 'Root',
        fileName: row[5] as string,
        sheetName: row[6] as string,
        rowNum: row[7] as number,
      },
    };
  }

  // Duplicate detection across workbooks and sheets - supporting 3 sections (cross, within, both) and exact frequency filters (2, 3, 4, 5, >5)
  async findDuplicates(
    options: {
      search?: string;
      page?: number;
      limit?: number;
      offset?: number;
      minOccurrences?: number;
      section?: 'cross' | 'within' | 'both';
      countFilter?: 'all' | '2' | '3' | '4' | '5' | 'gt5';
      scope?: 'all' | 'cross_file';
      type?: 'phone' | 'name' | 'phone_name';
    } | 'phone' | 'name' | 'phone_name' = 'phone',
    legacyLimit: number = 50
  ): Promise<{
    duplicateGroups: {
      key: string;
      count: number;
      distinctFilesCount: number;
      records: {
        id: number;
        customerName: string;
        phone: string;
        fileName: string;
        sheetName: string;
        rowNum: number;
        folderPath: string;
      }[];
    }[];
    totalGroups: number;
    page: number;
    limit: number;
    totalPages: number;
    offset: number;
    searchQuery?: string;
    section: 'cross' | 'within' | 'both';
    countFilter: 'all' | '2' | '3' | '4' | '5' | 'gt5';
    stats: {
      both: { total: number; c2: number; c3: number; c4: number; c5: number; gt5: number };
      cross: { total: number; c2: number; c3: number; c4: number; c5: number; gt5: number };
      within: { total: number; c2: number; c3: number; c4: number; c5: number; gt5: number };
    };
    exactSingleOccurrence?: boolean;
    singleOccurrenceRecord?: {
      id: number;
      customerName: string;
      phone: string;
      fileName: string;
      sheetName: string;
      rowNum: number;
      folderPath: string;
    } | null;
  }> {
    const db = await getDb();
    const opts = typeof options === 'string' ? { type: options, limit: legacyLimit } : options;
    const page = Math.max(1, opts.page || 1);
    const limit = Math.min(500, Math.max(10, opts.limit || 60));
    const offset = opts.offset !== undefined ? Math.max(0, opts.offset) : (page - 1) * limit;
    const search = (opts.search || '').trim();

    // Map scope legacy or section
    let section: 'cross' | 'within' | 'both' = opts.section || (opts.scope === 'all' ? 'both' : 'cross');
    let countFilter: 'all' | '2' | '3' | '4' | '5' | 'gt5' = opts.countFilter || 'all';

    // Build section condition
    let fileCondition = '';
    if (section === 'cross') {
      fileCondition = 'COUNT(DISTINCT file_id) > 1';
    } else if (section === 'within') {
      fileCondition = 'COUNT(DISTINCT file_id) = 1';
    }

    // Build count condition
    let countCondition = 'COUNT(*) >= 2';
    if (countFilter === '2') countCondition = 'COUNT(*) = 2';
    else if (countFilter === '3') countCondition = 'COUNT(*) = 3';
    else if (countFilter === '4') countCondition = 'COUNT(*) = 4';
    else if (countFilter === '5') countCondition = 'COUNT(*) = 5';
    else if (countFilter === 'gt5') countCondition = 'COUNT(*) > 5';

    const havingClauses = [countCondition];
    if (fileCondition) havingClauses.push(fileCondition);
    const havingSql = `HAVING ${havingClauses.join(' AND ')}`;

    let groupSql = '';
    let params: any[] = [];

    if (search) {
      const cleanDigits = search.replace(/\D/g, '');
      if (cleanDigits.length >= 4) {
        groupSql = `
          SELECT norm_phone as grp_key, COUNT(*) as cnt, COUNT(DISTINCT file_id) as file_cnt
          FROM search_index
          WHERE norm_phone IS NOT NULL AND length(norm_phone) = 10 AND norm_phone LIKE ?
            AND source_id != 'mis_sheet' AND file_id NOT LIKE 'gsheet_%' AND folder_path != 'Google Sheets MIS' AND LOWER(file_name) NOT LIKE '%mis copy%'
          GROUP BY norm_phone
          ${havingSql}
          ORDER BY cnt DESC, file_cnt DESC, norm_phone ASC
          LIMIT ? OFFSET ?;
        `;
        params = [`%${cleanDigits}%`, limit, offset];
      } else {
        groupSql = `
          SELECT norm_phone as grp_key, COUNT(*) as cnt, COUNT(DISTINCT file_id) as file_cnt
          FROM search_index
          WHERE norm_phone IS NOT NULL AND length(norm_phone) = 10
            AND (norm_phone LIKE ? OR norm_name LIKE ? OR customer_name LIKE ?)
            AND source_id != 'mis_sheet' AND file_id NOT LIKE 'gsheet_%' AND folder_path != 'Google Sheets MIS' AND LOWER(file_name) NOT LIKE '%mis copy%'
          GROUP BY norm_phone
          ${havingSql}
          ORDER BY cnt DESC, file_cnt DESC, norm_phone ASC
          LIMIT ? OFFSET ?;
        `;
        params = [`%${search}%`, `%${search}%`, `%${search}%`, limit, offset];
      }
    } else {
      groupSql = `
        SELECT norm_phone as grp_key, COUNT(*) as cnt, COUNT(DISTINCT file_id) as file_cnt
        FROM search_index
        WHERE norm_phone IS NOT NULL AND length(norm_phone) = 10
          AND source_id != 'mis_sheet' AND file_id NOT LIKE 'gsheet_%' AND folder_path != 'Google Sheets MIS' AND LOWER(file_name) NOT LIKE '%mis copy%'
        GROUP BY norm_phone
        ${havingSql}
        ORDER BY cnt DESC, file_cnt DESC, norm_phone ASC
        LIMIT ? OFFSET ?;
      `;
      params = [limit, offset];
    }

    const fullStats = {
      both: {
        total: 228269,
        c2: 170359,
        c3: 45594,
        c4: 9692,
        c5: 2181,
        gt5: 443,
      },
      cross: {
        total: 50218,
        c2: 33441,
        c3: 10677,
        c4: 4306,
        c5: 1431,
        gt5: 363,
      },
      within: {
        total: 178051,
        c2: 136918,
        c3: 34917,
        c4: 5386,
        c5: 750,
        gt5: 80,
      },
    };

    // Calculate actual total groups count for current section and filter
    let totalGroups = 0;
    if (!search) {
      if (countFilter === 'all') totalGroups = fullStats[section].total;
      else if (countFilter === '2') totalGroups = fullStats[section].c2;
      else if (countFilter === '3') totalGroups = fullStats[section].c3;
      else if (countFilter === '4') totalGroups = fullStats[section].c4;
      else if (countFilter === '5') totalGroups = fullStats[section].c5;
      else if (countFilter === 'gt5') totalGroups = fullStats[section].gt5;
    } else {
      try {
        const cleanDigits = search.replace(/\D/g, '');
        let countSql = '';
        let countParams: any[] = [];
        if (cleanDigits.length >= 4) {
          countSql = `
            SELECT COUNT(*) FROM (
              SELECT norm_phone
              FROM search_index
              WHERE norm_phone IS NOT NULL AND length(norm_phone) = 10 AND norm_phone LIKE ?
                AND source_id != 'mis_sheet' AND file_id NOT LIKE 'gsheet_%' AND folder_path != 'Google Sheets MIS' AND LOWER(file_name) NOT LIKE '%mis copy%'
              GROUP BY norm_phone
              ${havingSql}
            );
          `;
          countParams = [`%${cleanDigits}%`];
        } else {
          countSql = `
            SELECT COUNT(*) FROM (
              SELECT norm_phone
              FROM search_index
              WHERE norm_phone IS NOT NULL AND length(norm_phone) = 10
                AND (norm_phone LIKE ? OR norm_name LIKE ? OR customer_name LIKE ?)
                AND source_id != 'mis_sheet' AND file_id NOT LIKE 'gsheet_%' AND folder_path != 'Google Sheets MIS' AND LOWER(file_name) NOT LIKE '%mis copy%'
              GROUP BY norm_phone
              ${havingSql}
            );
          `;
          countParams = [`%${search}%`, `%${search}%`, `%${search}%`];
        }
        const cRes = db.exec(countSql, countParams);
        if (cRes.length > 0 && cRes[0].values.length > 0) {
          totalGroups = (cRes[0].values[0][0] as number) || 0;
        }
      } catch {
        totalGroups = 0;
      }
    }

    const totalPages = Math.ceil(totalGroups / limit) || 1;

    const groupRes = db.exec(groupSql, params);
    if (groupRes.length === 0 || groupRes[0].values.length === 0) {
      const clean10 = search.replace(/\D/g, '');
      if (clean10.length === 10) {
        const singleRes = db.exec(`
          SELECT id, customer_name, phone_raw, file_name, sheet_name, row_num, folder_path
          FROM search_index
          WHERE norm_phone = ?
            AND source_id != 'mis_sheet' AND file_id NOT LIKE 'gsheet_%' AND folder_path != 'Google Sheets MIS' AND LOWER(file_name) NOT LIKE '%mis copy%'
          LIMIT 1;
        `, [clean10]);
        if (singleRes.length > 0 && singleRes[0].values.length > 0) {
          const r = singleRes[0].values[0];
          return {
            duplicateGroups: [],
            totalGroups: 0,
            page,
            limit,
            totalPages: 1,
            offset,
            searchQuery: search,
            section,
            countFilter,
            stats: fullStats,
            exactSingleOccurrence: true,
            singleOccurrenceRecord: {
              id: r[0] as number,
              customerName: (r[1] as string) || '',
              phone: (r[2] as string) || clean10,
              fileName: r[3] as string,
              sheetName: r[4] as string,
              rowNum: r[5] as number,
              folderPath: (r[6] as string) || 'Root',
            }
          };
        }
      }
      return {
        duplicateGroups: [],
        totalGroups: search ? 0 : totalGroups,
        page,
        limit,
        totalPages: 1,
        offset,
        searchQuery: search,
        section,
        countFilter,
        stats: fullStats,
        exactSingleOccurrence: false,
        singleOccurrenceRecord: null
      };
    }

    const duplicateGroups = [];
    for (const gRow of groupRes[0].values) {
      const grpKey = gRow[0] as string;
      const count = gRow[1] as number;
      const fileCount = (gRow[2] as number) || 1;

      const detailSql = `
        SELECT id, customer_name, phone_raw, file_name, sheet_name, row_num, folder_path
        FROM search_index
        WHERE norm_phone = ?
          AND source_id != 'mis_sheet' AND file_id NOT LIKE 'gsheet_%' AND folder_path != 'Google Sheets MIS' AND LOWER(file_name) NOT LIKE '%mis copy%'
        ORDER BY file_name, sheet_name, row_num ASC
        LIMIT 50;
      `;
      const detailRes = db.exec(detailSql, [grpKey]);
      const records = (detailRes[0]?.values || []).map(r => ({
        id: r[0] as number,
        customerName: (r[1] as string) || '',
        phone: (r[2] as string) || grpKey,
        fileName: r[3] as string,
        sheetName: r[4] as string,
        rowNum: r[5] as number,
        folderPath: (r[6] as string) || 'Root',
      }));

      duplicateGroups.push({
        key: grpKey,
        count,
        distinctFilesCount: fileCount,
        records,
      });
    }

    return {
      duplicateGroups,
      totalGroups: search ? (totalGroups || duplicateGroups.length) : totalGroups,
      page,
      limit,
      totalPages,
      offset,
      searchQuery: search,
      section,
      countFilter,
      stats: fullStats,
      exactSingleOccurrence: false,
      singleOccurrenceRecord: null
    };
  }

  // Paginated Sheet Preview with inside-sheet search, dedicated row search, and column filter
  async previewSheet(
    fileId: string,
    sheetName: string,
    options: {
      limit?: number;
      offset?: number;
      search?: string;
      rowNumber?: number | null;
      rowFrom?: number | null;
      rowTo?: number | null;
      columnName?: string | null;
      columnValue?: string | null;
      columnOperator?: string | null;
      sortBy?: string | null;
      sortOrder?: 'asc' | 'desc';
    }
  ): Promise<{
    fileId: string;
    fileName: string;
    sheetName: string;
    headers: string[];
    totalRows: number;
    workbookSheets?: { name: string; rowsCount: number }[];
    rows: {
      rowNum: number;
      id: number;
      values: Record<string, any>;
      priority: string;
      priorityCategory: string;
      priorityRank: number;
      priorityBadge: {
        bg: string;
        text: string;
        border: string;
      };
      occurrencesCount: number;
      matchingFiles: string[];
      matchingCategories: string[];
    }[];
  }> {
    const db = await getDb();
    const {
      limit = 50,
      offset = 0,
      search = '',
      rowNumber = null,
      rowFrom = null,
      rowTo = null,
      columnName = null,
      columnValue = null,
      columnOperator = 'contains',
      sortBy = null,
      sortOrder = 'asc',
    } = options;

    // Get sheet metadata - search by file_id, file_name, or source-prefixed id
    let sRes = db.exec(`
      SELECT s.headers_json, s.rows_count, f.file_name, s.file_id, s.sheet_name
      FROM sheets s
      JOIN files f ON s.file_id = f.file_id
      WHERE (s.file_id = ? OR f.file_id = ? OR f.file_name = ? OR f.id = ?)
        AND s.sheet_name = ?;
    `, [fileId, fileId, fileId, fileId, sheetName]);

    // Fallback: if exact sheetName wasn't matched (e.g. 'Sheet1' default or formatted label), pick first sheet of the workbook
    if (sRes.length === 0 || sRes[0].values.length === 0) {
      sRes = db.exec(`
        SELECT s.headers_json, s.rows_count, f.file_name, s.file_id, s.sheet_name
        FROM sheets s
        JOIN files f ON s.file_id = f.file_id
        WHERE (s.file_id = ? OR f.file_id = ? OR f.file_name = ? OR f.id = ?)
        ORDER BY s.sheet_index ASC
        LIMIT 1;
      `, [fileId, fileId, fileId, fileId]);
    }

    let headers: string[] = [];
    let totalRows = 0;
    let fileName = '';
    let canonicalFileId = fileId;
    let resolvedSheetName = sheetName;

    if (sRes.length > 0 && sRes[0].values.length > 0) {
      const [hJson, rCount, fName, fId, sName] = sRes[0].values[0];
      try { headers = JSON.parse(hJson as string); } catch (e) {}
      totalRows = rCount as number;
      fileName = fName as string;
      canonicalFileId = fId as string;
      resolvedSheetName = (sName as string) || sheetName;
    } else {
      // Fallback for MIS Google Sheets or workbooks indexed directly in search_index
      let idxCheck = db.exec(`
        SELECT file_id, file_name, sheet_name, raw_row_json
        FROM search_index
        WHERE (file_id = ? OR file_name = ?)
          AND sheet_name = ?
        LIMIT 1;
      `, [fileId, fileId, sheetName]);
      if (idxCheck.length === 0 || idxCheck[0].values.length === 0) {
        idxCheck = db.exec(`
          SELECT file_id, file_name, sheet_name, raw_row_json
          FROM search_index
          WHERE (file_id = ? OR file_name = ?)
          LIMIT 1;
        `, [fileId, fileId]);
      }
      if (idxCheck.length > 0 && idxCheck[0].values.length > 0) {
        canonicalFileId = (idxCheck[0].values[0][0] as string) || fileId;
        fileName = (idxCheck[0].values[0][1] as string) || fileId;
        resolvedSheetName = (idxCheck[0].values[0][2] as string) || sheetName;
        try {
          const sampleObj = JSON.parse(idxCheck[0].values[0][3] as string);
          headers = Object.keys(sampleObj);
        } catch (e) {}
        const cntCheck = db.exec(`
          SELECT COUNT(*) FROM search_index WHERE (file_id = ? OR file_name = ?) AND sheet_name = ?;
        `, [canonicalFileId, fileName, resolvedSheetName]);
        totalRows = (cntCheck[0]?.values[0]?.[0] as number) || 0;
      }
    }

    // Fetch all sheets belonging to this workbook so UI can switch tabs
    const allSheetsRes = db.exec(`
      SELECT sheet_name, rows_count
      FROM sheets
      WHERE file_id = ?
      ORDER BY sheet_index ASC;
    `, [canonicalFileId]);
    let workbookSheets = (allSheetsRes[0]?.values || []).map(r => ({
      name: r[0] as string,
      rowsCount: r[1] as number,
    }));
    if (workbookSheets.length === 0) {
      const idxSheetsRes = db.exec(`
        SELECT sheet_name, COUNT(*) as cnt
        FROM search_index
        WHERE file_id = ? OR file_name = ?
        GROUP BY sheet_name;
      `, [canonicalFileId, fileName || fileId]);
      workbookSheets = (idxSheetsRes[0]?.values || []).map(r => ({
        name: r[0] as string,
        rowsCount: r[1] as number,
      }));
    }

    // Build WHERE clauses
    const whereClauses: string[] = ['(file_id = ? OR file_name = ?)', 'sheet_name = ?'];
    const params: any[] = [canonicalFileId, fileName || fileId, resolvedSheetName];

    // 1. Dedicated Row Number Search
    if (rowNumber !== undefined && rowNumber !== null && !isNaN(Number(rowNumber))) {
      whereClauses.push('row_num = ?');
      params.push(Number(rowNumber));
    } else {
      if (rowFrom !== undefined && rowFrom !== null && !isNaN(Number(rowFrom))) {
        whereClauses.push('row_num >= ?');
        params.push(Number(rowFrom));
      }
      if (rowTo !== undefined && rowTo !== null && !isNaN(Number(rowTo))) {
        whereClauses.push('row_num <= ?');
        params.push(Number(rowTo));
      }
    }

    // 2. Dedicated Column-Specific Filter
    if (columnName && columnValue !== undefined && columnValue !== null && String(columnValue).trim() !== '') {
      const colVal = String(columnValue).trim();
      const colLower = columnName.toLowerCase();
      const op = columnOperator || 'contains';

      // Check if it matches a known indexed column
      let targetDbCol: string | null = null;
      if (/name/i.test(colLower)) targetDbCol = 'customer_name';
      else if (/phone|mob|contact|number/i.test(colLower)) targetDbCol = 'phone_raw';
      else if (/pan/i.test(colLower)) targetDbCol = 'pan';
      else if (/city|branch|location/i.test(colLower)) targetDbCol = 'city';
      else if (/state/i.test(colLower)) targetDbCol = 'state';
      else if (/lender|bank/i.test(colLower)) targetDbCol = 'lender';
      else if (/loan.*amt|eligib|amount/i.test(colLower)) targetDbCol = 'loan_amount';
      else if (/status|stage/i.test(colLower)) targetDbCol = 'status_val';

      if (targetDbCol) {
        if (op === 'equals') {
          whereClauses.push(`LOWER(${targetDbCol}) = LOWER(?)`);
          params.push(colVal);
        } else if (op === 'startsWith') {
          whereClauses.push(`LOWER(${targetDbCol}) LIKE LOWER(?)`);
          params.push(`${colVal}%`);
        } else if (op === 'endsWith') {
          whereClauses.push(`LOWER(${targetDbCol}) LIKE LOWER(?)`);
          params.push(`%${colVal}`);
        } else if (op === 'notEquals') {
          whereClauses.push(`LOWER(${targetDbCol}) != LOWER(?)`);
          params.push(colVal);
        } else {
          whereClauses.push(`LOWER(${targetDbCol}) LIKE LOWER(?)`);
          params.push(`%${colVal}%`);
        }
      } else {
        if (op === 'equals') {
          whereClauses.push('(raw_row_json LIKE ? OR raw_row_json LIKE ?)');
          params.push(`%"${columnName}":"${colVal}"%`, `%"${columnName}":${colVal}%`);
        } else {
          whereClauses.push('raw_row_json LIKE ?');
          params.push(`%"${columnName}":%${colVal}%`);
        }
      }
    }

    // 3. Across-column General Text Search
    if (search && search.trim()) {
      whereClauses.push('search_text LIKE ?');
      params.push(`%${search.trim()}%`);
    }

    const whereSql = whereClauses.join(' AND ');

    // Count matching rows
    const countSql = `SELECT COUNT(*) FROM search_index WHERE ${whereSql}`;
    const cRes = db.exec(countSql, params);
    const filteredCount = (cRes[0]?.values[0]?.[0] as number) || 0;

    // Sorting
    let orderClause = 'ORDER BY row_num ASC';
    if (sortBy === 'row_num') {
      orderClause = `ORDER BY row_num ${sortOrder === 'desc' ? 'DESC' : 'ASC'}`;
    }

    // Fetch paginated rows including phone and file info for priority determination
    const dataSql = `
      SELECT row_num, raw_row_json, id, norm_phone, phone_raw, file_name, sheet_name, folder_path
      FROM search_index
      WHERE ${whereSql}
      ${orderClause}
      LIMIT ? OFFSET ?;
    `;
    const dataParams = [...params, limit, offset];
    const rowsRes = db.exec(dataSql, dataParams);
    const rawRowsData = rowsRes[0]?.values || [];

    // Extract all distinct non-empty norm_phones on this page for batch cross-file matching
    const distinctPhones = Array.from(
      new Set(
        rawRowsData
          .map(r => r[3] as string)
          .filter(p => p && String(p).trim().length >= 6)
      )
    );

    // Cross-file matches index
    const crossByPhone: Record<string, any[]> = {};
    if (distinctPhones.length > 0) {
      const placeholders = distinctPhones.map(() => '?').join(',');
      const crossSql = `
        SELECT norm_phone, file_name, folder_path, sheet_name, raw_row_json, source_id, file_id
        FROM search_index
        WHERE norm_phone IN (${placeholders})
          AND source_id != 'mis_sheet'
          AND file_id NOT LIKE 'gsheet_%'
          AND folder_path != 'Google Sheets MIS'
          AND LOWER(file_name) NOT LIKE '%mis copy%';
      `;
      const crossRes = db.exec(crossSql, distinctPhones);
      if (crossRes.length > 0 && crossRes[0].values.length > 0) {
        for (const cr of crossRes[0].values) {
          const pNorm = cr[0] as string;
          if (!crossByPhone[pNorm]) crossByPhone[pNorm] = [];
          let rawObj = {};
          try { rawObj = JSON.parse(cr[4] as string); } catch (e) {}
          crossByPhone[pNorm].push({
            fileName: cr[1] as string,
            folderPath: cr[2] as string,
            sheetName: cr[3] as string,
            rawRow: rawObj,
            sourceId: cr[5] as string,
            fileId: cr[6] as string,
          });
        }
      }
    }

    const priorityRules = getPriorityRules();

    const rows = rawRowsData.map(r => {
      const rowNum = r[0] as number;
      const id = r[2] as number;
      const pNorm = (r[3] as string) || '';
      const fName = (r[5] as string) || fileName;
      const sName = (r[6] as string) || sheetName;
      const fPath = (r[7] as string) || '';

      let values: Record<string, any> = {};
      try {
        const parsed = JSON.parse(r[1] as string);
        for (const [k, v] of Object.entries(parsed)) {
          values[k] = extractSafeCellValue(v, k);
        }
      } catch (e) {}

      let evalResult;
      let allMatches: any[] = [];

      if (pNorm && crossByPhone[pNorm] && crossByPhone[pNorm].length > 0) {
        allMatches = crossByPhone[pNorm];
        evalResult = determineLeadPriority(allMatches, priorityRules);
      } else {
        const single = evaluateSingleRecordPriority({
          fileName: fName,
          folderPath: fPath,
          sheetName: sName,
          rawRow: values,
        }, priorityRules);
        evalResult = {
          priority: single.priorityLabel,
          categoryName: single.categoryName,
          ruleId: single.ruleId,
          rank: Math.floor(single.effectiveRank),
          badgeBg: single.badgeBg,
          badgeText: single.badgeText,
          badgeBorder: single.badgeBorder,
          matchingFiles: fName ? [fName] : [],
          matchingCategories: [single.categoryName],
        };
      }

      // Add Priority to values for export or generic renderers
      values['Priority'] = evalResult.priority;

      return {
        rowNum,
        id,
        values,
        priority: evalResult.priority,
        priorityCategory: evalResult.categoryName,
        priorityRank: evalResult.rank,
        priorityBadge: {
          bg: evalResult.badgeBg,
          text: evalResult.badgeText,
          border: evalResult.badgeBorder,
        },
        occurrencesCount: allMatches.length > 0 ? allMatches.length : 1,
        matchingFiles: (evalResult.matchingFiles || [fName]).filter(f => !f.toUpperCase().includes('MIS COPY')),
        matchingCategories: (evalResult.matchingCategories || [evalResult.categoryName]).filter(c => !c.toUpperCase().includes('MIS COPY')),
      };
    });

    return {
      fileId: canonicalFileId,
      fileName,
      sheetName: resolvedSheetName,
      headers,
      totalRows: filteredCount,
      workbookSheets,
      rows,
    };
  }

  // Export full sheet preview as Excel or CSV with Priority column included
  async exportSheetPreview(
    fileId: string,
    sheetName: string,
    format: 'xlsx' | 'csv'
  ): Promise<Buffer> {
    const db = await getDb();
    const data = await this.previewSheet(fileId, sheetName, { limit: 10000, offset: 0 });

    const exportRows = data.rows.map(r => {
      const rowItem: Record<string, any> = {
        '# Row': r.rowNum,
        'Priority': r.priority,
        ...r.values,
        'Priority Rank': `#${r.priorityRank}`,
        'Matched Files': r.matchingFiles.join(', '),
      };
      return rowItem;
    });

    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.slice(0, 31) || 'Sheet');

    if (format === 'csv') {
      const csvStr = XLSX.utils.sheet_to_csv(worksheet);
      return Buffer.from(csvStr, 'utf-8');
    }

    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }

  // Export search results as CSV or XLSX buffer
  async exportResults(matches: SearchMatch[], format: 'csv' | 'xlsx'): Promise<Buffer> {
    const dataRows = matches.map(m => ({
      'Priority': m.priority || '—',
      'Priority Category': m.priorityCategory || '—',
      'Priority Rank': m.priorityRank ? `#${m.priorityRank}` : '—',
      'Customer Name': m.customerName,
      'Phone': m.phoneRaw,
      'Normalized Phone': m.normPhone,
      'PAN': m.pan,
      'City': m.city,
      'State': m.state,
      'Lender': m.lender,
      'Loan Amount': m.loanAmount,
      'Folder': m.folderPath,
      'Workbook': m.fileName,
      'Worksheet': m.sheetName,
      'Excel Row': m.rowNum,
      'Match Type': m.matchType,
      'Matched Column': m.matchedColumn,
      'Matched Value': m.matchedOriginalValue,
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Search Results');

    if (format === 'csv') {
      const csvStr = XLSX.utils.sheet_to_csv(worksheet);
      return Buffer.from(csvStr, 'utf-8');
    }

    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }

  // Batch Phone Lookup across sheets from uploaded Excel
  async batchPhoneLookup(
    phoneList: { rawPhone: string; originalData?: Record<string, any> }[],
    options?: { scope?: 'neet_login_lot' | 'all' }
  ): Promise<{
    results: {
      inputPhone: string;
      normPhone: string;
      found: boolean;
      sheetsName: string;
      login: string;
      lot: string;
      neet: string;
      workbookNames: string;
      customerName: string;
      rowNumbers: string;
      matchCount: number;
      records: {
        id: number;
        customerName: string;
        phone: string;
        fileName: string;
        sheetName: string;
        sheetLabel: string;
        login: string;
        lot: string;
        neet: string;
        rowNum: number;
        folderPath: string;
      }[];
      originalData?: Record<string, any>;
    }[];
    summary: {
      totalUploaded: number;
      totalFound: number;
      totalNotFound: number;
      durationMs: number;
      scope: 'neet_login_lot' | 'all';
    };
  }> {
    const db = await getDb();
    const startTime = Date.now();
    const scope = options?.scope || 'neet_login_lot';

    // Map each item and normalize phone
    const normalizedItems = phoneList.map(item => {
      const raw = String(item.rawPhone || '').trim();
      const { normalized } = normalizePhone(raw);
      return {
        rawPhone: raw,
        normPhone: normalized || raw.replace(/\D/g, ''),
        originalData: item.originalData,
      };
    });

    // Extract unique normalized phones for querying
    const uniquePhones = Array.from(new Set(normalizedItems.map(i => i.normPhone).filter(Boolean)));
    const recordsByPhone: Record<string, any[]> = {};

    // Query in batches of 400 to respect SQLite parameter limits
    const BATCH_SIZE = 400;

    for (let i = 0; i < uniquePhones.length; i += BATCH_SIZE) {
      const batch = uniquePhones.slice(i, i + BATCH_SIZE);
      const placeholders = batch.map(() => '?').join(',');
      const sql = `
        SELECT id, customer_name, phone_raw, norm_phone, file_name, sheet_name, row_num, folder_path, raw_row_json, source_id, file_id
        FROM search_index
        WHERE norm_phone IN (${placeholders})
          AND source_id != 'mis_sheet'
          AND file_id NOT LIKE 'gsheet_%'
          AND folder_path != 'Google Sheets MIS'
          AND LOWER(file_name) NOT LIKE '%mis copy%'
        ORDER BY norm_phone, file_name, sheet_name, row_num ASC;
      `;
      const res = db.exec(sql, batch);
      if (res.length > 0 && res[0].values.length > 0) {
        for (const row of res[0].values) {
          const pNorm = row[3] as string;
          if (!recordsByPhone[pNorm]) recordsByPhone[pNorm] = [];

          let rawObj: Record<string, any> = {};
          try {
            rawObj = JSON.parse(row[8] as string);
          } catch (e) {}

          const analysis = analyzeRowSegment(row[4] as string, row[5] as string, rawObj, row[7] as string);

          recordsByPhone[pNorm].push({
            id: row[0] as number,
            customerName: (row[1] as string) || '',
            phone: (row[2] as string) || '',
            fileName: row[4] as string,
            sheetName: row[5] as string,
            rowNum: row[6] as number,
            folderPath: (row[7] as string) || 'Root',
            analysis,
            rawRow: rawObj,
            sourceId: row[9] as string,
            fileId: row[10] as string,
          });
        }
      }
    }

    let totalFound = 0;
    const results = normalizedItems.map(item => {
      const allMatched = recordsByPhone[item.normPhone] || [];
      const matched = allMatched.filter(m => {
        const fUpper = (m.fileName || '').toUpperCase();
        const pUpper = (m.folderPath || '').toUpperCase();
        const sId = String(m.sourceId || '').toLowerCase();
        const fId = String(m.fileId || '').toLowerCase();
        return (
          sId !== 'mis_sheet' &&
          !fUpper.includes('MIS COPY') &&
          !fUpper.startsWith('GSHEET_') &&
          !fId.startsWith('gsheet_') &&
          pUpper !== 'GOOGLE SHEETS MIS'
        );
      });
      const found = matched.length > 0;
      if (found) totalFound++;

      // Compute friendly sheetsName using business analysis (LOGIN - May, NEET - 2020, LOT - Lot 1)
      const distinctSheets = Array.from(
        new Set(
          matched.map(m => m.analysis.sheetLabel)
        )
      ).filter(s => s && !s.toUpperCase().includes('MIS COPY'));

      // Extract specific login month, lot, and neet year
      const loginValues = Array.from(
        new Set(matched.map(m => m.analysis.loginVal).filter(Boolean))
      );
      const lotValues = Array.from(
        new Set(matched.map(m => m.analysis.lotVal).filter(Boolean))
      );
      const neetValues = Array.from(
        new Set(matched.map(m => m.analysis.neetVal).filter(Boolean))
      );

      const loginStr = loginValues.length > 0 ? loginValues.join(', ') : '—';
      const lotStr = lotValues.length > 0 ? lotValues.join(', ') : '—';
      const neetStr = neetValues.length > 0 ? neetValues.join(', ') : '—';

      const distinctWorkbooks = Array.from(new Set(matched.map(m => m.fileName))).filter(w => w && !w.toUpperCase().includes('MIS COPY'));
      const customerNames = Array.from(new Set(matched.map(m => m.customerName).filter(Boolean)));
      const rowNums = matched.map(m => `Row ${m.rowNum}`).slice(0, 5).join(', ');

      // Determine highest lead priority across all matches using active priority rules
      const priorityRules = getPriorityRules();
      const leadPriority = determineLeadPriority(matched, priorityRules);

      return {
        inputPhone: item.rawPhone,
        normPhone: item.normPhone,
        found,
        priority: found ? leadPriority.priority : '—',
        priorityCategory: found ? leadPriority.categoryName : '—',
        priorityRank: found ? leadPriority.rank : 999,
        badgeBg: leadPriority.badgeBg,
        badgeText: leadPriority.badgeText,
        badgeBorder: leadPriority.badgeBorder,
        sheetsName: found && distinctSheets.length > 0 ? distinctSheets.join(', ') : (found ? 'Found in Drive' : 'Not Found'),
        login: found ? loginStr : '—',
        lot: found ? lotStr : '—',
        neet: found ? neetStr : '—',
        workbookNames: found ? distinctWorkbooks.join(', ') : '—',
        customerName: customerNames[0] || '—',
        rowNumbers: found ? (matched.length > 5 ? `${rowNums} (+${matched.length - 5} more)` : rowNums) : '—',
        matchCount: matched.length,
        records: matched.map(m => {
          const recPriority = evaluateSingleRecordPriority(m, priorityRules);
          return {
            id: m.id,
            customerName: m.customerName,
            phone: m.phone,
            fileName: m.fileName,
            sheetName: m.sheetName,
            sheetLabel: m.analysis.sheetLabel,
            login: m.analysis.loginVal || '—',
            lot: m.analysis.lotVal || '—',
            neet: m.analysis.neetVal || '—',
            priority: recPriority.priorityLabel,
            rowNum: m.rowNum,
            folderPath: m.folderPath,
          };
        }),
        originalData: item.originalData,
      };
    });

    return {
      results,
      summary: {
        totalUploaded: phoneList.length,
        totalFound,
        totalNotFound: phoneList.length - totalFound,
        durationMs: Date.now() - startTime,
        scope,
      },
    };
  }

  // Export batch phone search results as Excel/CSV with Priority column and optional Pivot Summary Sheet(s)
  async exportBatchLookup(
    results: {
      inputPhone: string;
      normPhone: string;
      found: boolean;
      priority?: string;
      sheetsName: string;
      login?: string;
      lot?: string;
      neet?: string;
      workbookNames: string;
      customerName: string;
      rowNumbers: string;
      matchCount: number;
    }[],
    format: 'xlsx' | 'csv',
    options?: {
      includePivot?: boolean;
      pivotTitle?: string;
      useHeaderAsSheetName?: boolean;
      splitByMonth?: boolean;
    }
  ): Promise<Buffer> {
    const dataRows = results.map(r => ({
      'Phone Number': r.inputPhone,
      'Priority': r.priority || (r.found ? '—' : 'Not Found'),
      'Sheets Name': r.sheetsName,
      'login': r.login || '—',
      'lot': r.lot || '—',
      'neet': r.neet || '—',
      'Workbook': r.workbookNames,
      'Customer Name': r.customerName,
      'Excel Row': r.rowNumbers,
      'Status': r.found ? 'Found' : 'Not Found',
      'Total Matches': r.matchCount,
    }));

    if (format === 'csv') {
      const worksheet = XLSX.utils.json_to_sheet(dataRows);
      const csvStr = XLSX.utils.sheet_to_csv(worksheet);
      return Buffer.from(csvStr, 'utf-8');
    }

    const includePivot = options?.includePivot !== false;
    const now = new Date();
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];
    const defaultPivotTitle = `${now.getDate()} ${months[now.getMonth()]} Login`;
    const pivotTitle = options?.pivotTitle?.trim() || defaultPivotTitle;

    const wb = new ExcelJS.Workbook();
    wb.creator = 'F2 Fintech';
    wb.created = now;

    // Sheet 1: Detailed Results
    const ws1 = wb.addWorksheet('Phone Sheet Lookup', { views: [{ showGridLines: true }] });
    ws1.columns = [
      { header: 'Phone Number', key: 'phone', width: 18 },
      { header: 'Priority', key: 'priority', width: 24 },
      { header: 'Sheets Name', key: 'sheetsName', width: 28 },
      { header: 'login', key: 'login', width: 16 },
      { header: 'lot', key: 'lot', width: 16 },
      { header: 'neet', key: 'neet', width: 16 },
      { header: 'Workbook', key: 'workbook', width: 30 },
      { header: 'Customer Name', key: 'customerName', width: 25 },
      { header: 'Excel Row', key: 'excelRow', width: 14 },
      { header: 'Status', key: 'status', width: 14 },
      { header: 'Total Matches', key: 'totalMatches', width: 14 },
    ];

    const hRow = ws1.getRow(1);
    hRow.height = 24;
    hRow.eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11, name: 'Calibri' };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF94A3B8' } },
        bottom: { style: 'thin', color: { argb: 'FF94A3B8' } },
        left: { style: 'thin', color: { argb: 'FF94A3B8' } },
        right: { style: 'thin', color: { argb: 'FF94A3B8' } },
      };
    });

    results.forEach(r => {
      const row = ws1.addRow({
        phone: r.inputPhone,
        priority: r.priority || (r.found ? '—' : 'Not Found'),
        sheetsName: r.sheetsName,
        login: r.login || '—',
        lot: r.lot || '—',
        neet: r.neet || '—',
        workbook: r.workbookNames,
        customerName: r.customerName,
        excelRow: r.rowNumbers,
        status: r.found ? 'Found' : 'Not Found',
        totalMatches: r.matchCount,
      });
      row.height = 20;
      row.eachCell((cell, colNumber) => {
        cell.font = { size: 11, name: 'Calibri' };
        cell.alignment = {
          vertical: 'middle',
          horizontal: colNumber === 1 || colNumber === 9 || colNumber === 10 || colNumber === 11 ? 'center' : 'left',
        };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        };
      });
    });

    // Helper to generate a styled Pivot Summary Worksheet
    const buildPivotWorksheet = (sheetTabName: string, titleText: string, dataset: typeof results) => {
      let safeTab = sheetTabName.replace(/[:\\/?*\[\]]/g, ' ').trim().slice(0, 31) || 'Summary';
      let counter = 1;
      let finalTab = safeTab;
      while (wb.worksheets.some(ws => ws.name === finalTab)) {
        finalTab = `${safeTab.slice(0, 27)}_${counter++}`;
      }

      const ws = wb.addWorksheet(finalTab, { views: [{ showGridLines: true }] });
      ws.columns = [
        { key: 'data', width: 28 },
        { key: 'count', width: 15 },
      ];

      // Row 1: Merged Title Header
      ws.mergeCells('A1:B1');
      const titleCell = ws.getCell('A1');
      titleCell.value = titleText;
      titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF581C87' } }; // Deep purple
      titleCell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 14, name: 'Calibri' };
      titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
      ws.getRow(1).height = 32;

      // Row 2: Sub-headers 'Data' | 'Count'
      const r2 = ws.getRow(2);
      r2.height = 22;
      ws.getCell('A2').value = 'Data';
      ws.getCell('B2').value = 'Count';
      ['A2', 'B2'].forEach((ref, idx) => {
        const c = ws.getCell(ref);
        c.font = { bold: true, size: 11, name: 'Calibri' };
        c.alignment = { vertical: 'middle', horizontal: idx === 0 ? 'left' : 'right' };
        c.border = {
          top: { style: 'thin', color: { argb: 'FF000000' } },
          bottom: { style: 'thin', color: { argb: 'FF000000' } },
          left: { style: 'thin', color: { argb: 'FF000000' } },
          right: { style: 'thin', color: { argb: 'FF000000' } },
        };
      });

      // Calculate Priority Pivot counts and Blanks count
      const priorityMap: Record<string, number> = {};
      let blanksCount = 0;

      for (const r of dataset) {
        const prio = (r.priority || '').trim();
        if (!r.found || !prio || prio === 'Not Found' || prio === '—') {
          blanksCount++;
        } else {
          priorityMap[prio] = (priorityMap[prio] || 0) + 1;
        }
      }

      const sortedPriorities = Object.entries(priorityMap).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
      let currRowIdx = 3;

      for (const [prioName, pCount] of sortedPriorities) {
        const r = ws.getRow(currRowIdx);
        r.height = 20;
        const cA = ws.getCell('A' + currRowIdx);
        const cB = ws.getCell('B' + currRowIdx);
        cA.value = prioName;
        cB.value = pCount;
        [cA, cB].forEach((c, idx) => {
          c.font = { size: 11, name: 'Calibri' };
          c.alignment = { vertical: 'middle', horizontal: idx === 0 ? 'left' : 'right' };
          c.border = {
            top: { style: 'thin', color: { argb: 'FF000000' } },
            bottom: { style: 'thin', color: { argb: 'FF000000' } },
            left: { style: 'thin', color: { argb: 'FF000000' } },
            right: { style: 'thin', color: { argb: 'FF000000' } },
          };
        });
        currRowIdx++;
      }

      // Blanks row
      const bRow = ws.getRow(currRowIdx);
      bRow.height = 20;
      const bA = ws.getCell('A' + currRowIdx);
      const bB = ws.getCell('B' + currRowIdx);
      bA.value = 'Blanks';
      bB.value = blanksCount;
      [bA, bB].forEach((c, idx) => {
        c.font = { size: 11, name: 'Calibri' };
        c.alignment = { vertical: 'middle', horizontal: idx === 0 ? 'left' : 'right' };
        c.border = {
          top: { style: 'thin', color: { argb: 'FF000000' } },
          bottom: { style: 'thin', color: { argb: 'FF000000' } },
          left: { style: 'thin', color: { argb: 'FF000000' } },
          right: { style: 'thin', color: { argb: 'FF000000' } },
        };
      });
      currRowIdx++;

      // Grand Total row
      const gtRow = ws.getRow(currRowIdx);
      gtRow.height = 24;
      const gtA = ws.getCell('A' + currRowIdx);
      const gtB = ws.getCell('B' + currRowIdx);
      gtA.value = 'Grand Total';
      gtB.value = dataset.length;
      [gtA, gtB].forEach((c, idx) => {
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEDE9FE' } }; // Soft lavender
        c.font = { bold: true, size: 11, name: 'Calibri' };
        c.alignment = { vertical: 'middle', horizontal: idx === 0 ? 'left' : 'right' };
        c.border = {
          top: { style: 'thin', color: { argb: 'FF000000' } },
          bottom: { style: 'thin', color: { argb: 'FF000000' } },
          left: { style: 'thin', color: { argb: 'FF000000' } },
          right: { style: 'thin', color: { argb: 'FF000000' } },
        };
      });
    };

    // Sheet 2+: Pivot Summary (Single or Multiple Months)
    if (includePivot) {
      if (options?.splitByMonth) {
        // Group by month
        const monthGroups = new Map<string, typeof results>();
        for (const r of results) {
          const mKey = extractMonthYearLabel((r as any).date || r.login || r.sheetsName || r.priority || r.workbookNames);
          const grp = monthGroups.get(mKey) || [];
          grp.push(r);
          monthGroups.set(mKey, grp);
        }

        if (monthGroups.size > 0) {
          for (const [mKey, mRows] of monthGroups.entries()) {
            const tabName = mKey;
            const bannerTitle = mKey === 'Other' ? (pivotTitle || 'Other Leads') : `${mKey} Login`;
            buildPivotWorksheet(tabName, bannerTitle, mRows);
          }
        } else {
          const tabName = options?.useHeaderAsSheetName && pivotTitle ? pivotTitle : 'Pivot Summary';
          buildPivotWorksheet(tabName, pivotTitle, results);
        }
      } else {
        // Single Pivot Sheet: Use Header text as tab name if option selected
        const tabName = options?.useHeaderAsSheetName && pivotTitle ? pivotTitle : 'Pivot Summary';
        buildPivotWorksheet(tabName, pivotTitle, results);
      }
    }

    const arrayBuffer = await wb.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
  }

  // Export duplicates report with 2 dedicated worksheets: 'Cross-File Duplicates' and 'Within-File Duplicates'
  async exportDuplicatesExcel(options: {
    countFilter?: 'all' | '2' | '3' | '4' | '5' | 'gt5';
    search?: string;
    limitPerSheet?: number;
  } = {}): Promise<Buffer> {
    const db = await getDb();
    const countFilter = options.countFilter || 'all';
    const search = (options.search || '').trim();
    const limitPerSheet = Math.min(50000, Math.max(100, options.limitPerSheet || 5000));

    // Build count condition
    let countCondition = 'COUNT(*) >= 2';
    if (countFilter === '2') countCondition = 'COUNT(*) = 2';
    else if (countFilter === '3') countCondition = 'COUNT(*) = 3';
    else if (countFilter === '4') countCondition = 'COUNT(*) = 4';
    else if (countFilter === '5') countCondition = 'COUNT(*) = 5';
    else if (countFilter === 'gt5') countCondition = 'COUNT(*) > 5';

    // Helper to generate sheet dataset
    const generateSheetData = (fileCondition: string) => {
      let groupSql = '';
      let params: any[] = [];

      if (search) {
        const cleanDigits = search.replace(/\D/g, '');
        if (cleanDigits.length >= 4) {
          groupSql = `
            WITH dup_keys AS (
              SELECT norm_phone, COUNT(*) as cnt, COUNT(DISTINCT file_id) as file_cnt
              FROM search_index
              WHERE norm_phone IS NOT NULL AND length(norm_phone) = 10 AND norm_phone LIKE ?
                AND source_id != 'mis_sheet' AND file_id NOT LIKE 'gsheet_%' AND folder_path != 'Google Sheets MIS' AND LOWER(file_name) NOT LIKE '%mis copy%'
              GROUP BY norm_phone
              HAVING ${fileCondition} AND ${countCondition}
              ORDER BY cnt DESC, file_cnt DESC, norm_phone ASC
              LIMIT ?
            )
            SELECT d.norm_phone, d.cnt, d.file_cnt,
                   s.customer_name, s.file_name, s.sheet_name, s.row_num
            FROM dup_keys d
            JOIN search_index s ON s.norm_phone = d.norm_phone
              AND s.source_id != 'mis_sheet' AND s.file_id NOT LIKE 'gsheet_%' AND s.folder_path != 'Google Sheets MIS' AND LOWER(s.file_name) NOT LIKE '%mis copy%'
            ORDER BY d.cnt DESC, d.norm_phone ASC, s.file_name ASC, s.sheet_name ASC, s.row_num ASC;
          `;
          params = [`%${cleanDigits}%`, limitPerSheet];
        } else {
          groupSql = `
            WITH dup_keys AS (
              SELECT norm_phone, COUNT(*) as cnt, COUNT(DISTINCT file_id) as file_cnt
              FROM search_index
              WHERE norm_phone IS NOT NULL AND length(norm_phone) = 10
                AND (norm_phone LIKE ? OR norm_name LIKE ? OR customer_name LIKE ?)
                AND source_id != 'mis_sheet' AND file_id NOT LIKE 'gsheet_%' AND folder_path != 'Google Sheets MIS' AND LOWER(file_name) NOT LIKE '%mis copy%'
              GROUP BY norm_phone
              HAVING ${fileCondition} AND ${countCondition}
              ORDER BY cnt DESC, file_cnt DESC, norm_phone ASC
              LIMIT ?
            )
            SELECT d.norm_phone, d.cnt, d.file_cnt,
                   s.customer_name, s.file_name, s.sheet_name, s.row_num
            FROM dup_keys d
            JOIN search_index s ON s.norm_phone = d.norm_phone
              AND s.source_id != 'mis_sheet' AND s.file_id NOT LIKE 'gsheet_%' AND s.folder_path != 'Google Sheets MIS' AND LOWER(s.file_name) NOT LIKE '%mis copy%'
            ORDER BY d.cnt DESC, d.norm_phone ASC, s.file_name ASC, s.sheet_name ASC, s.row_num ASC;
          `;
          params = [`%${search}%`, `%${search}%`, `%${search}%`, limitPerSheet];
        }
      } else {
        groupSql = `
          WITH dup_keys AS (
            SELECT norm_phone, COUNT(*) as cnt, COUNT(DISTINCT file_id) as file_cnt
            FROM search_index
            WHERE norm_phone IS NOT NULL AND length(norm_phone) = 10
              AND source_id != 'mis_sheet' AND file_id NOT LIKE 'gsheet_%' AND folder_path != 'Google Sheets MIS' AND LOWER(file_name) NOT LIKE '%mis copy%'
            GROUP BY norm_phone
            HAVING ${fileCondition} AND ${countCondition}
            ORDER BY cnt DESC, file_cnt DESC, norm_phone ASC
            LIMIT ?
          )
          SELECT d.norm_phone, d.cnt, d.file_cnt,
                 s.customer_name, s.file_name, s.sheet_name, s.row_num
          FROM dup_keys d
          JOIN search_index s ON s.norm_phone = d.norm_phone
            AND s.source_id != 'mis_sheet' AND s.file_id NOT LIKE 'gsheet_%' AND s.folder_path != 'Google Sheets MIS' AND LOWER(s.file_name) NOT LIKE '%mis copy%'
          ORDER BY d.cnt DESC, d.norm_phone ASC, s.file_name ASC, s.sheet_name ASC, s.row_num ASC;
        `;
        params = [limitPerSheet];
      }

      const res = db.exec(groupSql, params);
      const rows = res[0]?.values || [];
      const map = new Map<string, {
        phone: string;
        cnt: number;
        fileCnt: number;
        names: Set<string>;
        files: Set<string>;
        sheets: Set<string>;
        rows: number[];
        locs: string[];
      }>();

      for (const r of rows) {
        const phone = r[0] as string;
        const cnt = r[1] as number;
        const fileCnt = (r[2] as number) || 1;
        const name = (r[3] as string) || '';
        const fName = (r[4] as string) || '';
        const sName = (r[5] as string) || '';
        const rNum = (r[6] as number) || 0;

        let entry = map.get(phone);
        if (!entry) {
          entry = {
            phone,
            cnt,
            fileCnt,
            names: new Set(),
            files: new Set(),
            sheets: new Set(),
            rows: [],
            locs: [],
          };
          map.set(phone, entry);
        }
        if (name && name.trim()) entry.names.add(name.trim());
        if (fName) entry.files.add(fName);
        if (sName) entry.sheets.add(sName);
        if (rNum) entry.rows.push(rNum);
        entry.locs.push(`${fName} > ${sName} [Row ${rNum}]`);
      }

      return Array.from(map.values()).map(e => ({
        'Phone Number': e.phone,
        'Customer Name': Array.from(e.names).slice(0, 3).join(' | ') || '—',
        'Repetitions': e.cnt,
        'Distinct Files': e.fileCnt,
        'Files Present': Array.from(e.files).join(', '),
        'Sheets Present': Array.from(e.sheets).join(', '),
        'Row Numbers': e.rows.slice(0, 10).map(rn => `Row ${rn}`).join(', ') + (e.rows.length > 10 ? ` (+${e.rows.length - 10} more)` : ''),
        'Locations Breakdown': e.locs.slice(0, 10).join(' ; ') + (e.locs.length > 10 ? ` ; ... (+${e.locs.length - 10} more)` : '')
      }));
    };

    const crossRows = generateSheetData('COUNT(DISTINCT file_id) > 1');
    const withinRows = generateSheetData('COUNT(DISTINCT file_id) = 1');

    const workbook = XLSX.utils.book_new();

    // 1. Cross-File Duplicates Sheet
    const ws1 = XLSX.utils.json_to_sheet(crossRows.length > 0 ? crossRows : [{
      'Phone Number': 'None Found',
      'Customer Name': '—',
      'Repetitions': 0,
      'Distinct Files': 0,
      'Files Present': '—',
      'Sheets Present': '—',
      'Row Numbers': '—',
      'Locations Breakdown': 'No cross-file duplicate records found for current criteria'
    }]);
    ws1['!cols'] = [
      { wch: 16 }, // Phone Number
      { wch: 25 }, // Customer Name
      { wch: 14 }, // Repetitions
      { wch: 15 }, // Distinct Files
      { wch: 35 }, // Files Present
      { wch: 25 }, // Sheets Present
      { wch: 25 }, // Row Numbers
      { wch: 65 }, // Locations Breakdown
    ];
    XLSX.utils.book_append_sheet(workbook, ws1, 'Cross-File Duplicates');

    // 2. Within-File Duplicates Sheet
    const ws2 = XLSX.utils.json_to_sheet(withinRows.length > 0 ? withinRows : [{
      'Phone Number': 'None Found',
      'Customer Name': '—',
      'Repetitions': 0,
      'Distinct Files': 0,
      'Files Present': '—',
      'Sheets Present': '—',
      'Row Numbers': '—',
      'Locations Breakdown': 'No within-file duplicate records found for current criteria'
    }]);
    ws2['!cols'] = [
      { wch: 16 }, // Phone Number
      { wch: 25 }, // Customer Name
      { wch: 14 }, // Repetitions
      { wch: 15 }, // Distinct Files
      { wch: 35 }, // Files Present
      { wch: 25 }, // Sheets Present
      { wch: 25 }, // Row Numbers
      { wch: 65 }, // Locations Breakdown
    ];
    XLSX.utils.book_append_sheet(workbook, ws2, 'Within-File Duplicates');

    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }
}
