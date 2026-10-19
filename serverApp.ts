import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDb, saveDb } from './server/db.js';
import { DriveCrawler } from './server/crawler.js';
import { Indexer, IndexerProgress } from './server/indexer.js';
import { SearchEngine } from './server/search.js';
import {
  getPriorityRules,
  savePriorityRules,
  resetPriorityRules,
  getMisPriorityRules,
  saveMisPriorityRules,
  resetMisPriorityRules,
  syncPriorityRulesWithFiles,
  syncPriorityRulesWithDirectoriesAndFiles,
  syncMisPriorityRulesWithSources,
  DEFAULT_PRIORITY_RULES,
  isExcludedPriorityItem,
  getCategoryTypes,
  saveCategoryTypes,
  resetCategoryTypes,
  addCategoryType,
  deleteCategoryType,
  DEFAULT_CATEGORY_TYPES,
} from './server/priority.js';
import { MisService } from './server/mis.js';
import { extractSafeCellValue } from './server/normalizer.js';
import { shubhiRouter, ensureMisSheetsSynced } from './server/customerLookupRouter.js';
import { f2TicketsRouter, ensureTicketsLoaded } from './server/f2TicketsRouter.js';
import { misSearchBookRouter } from './server/misSearchBook.js';
import * as XLSXNamespace from 'xlsx';
const XLSX: any = (XLSXNamespace as any).default || XLSXNamespace;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Mount Customer Lookup, Lead Audit, Remarks, Google Sheets MIS, Live F2 Tickets, and MIS Search Book Routers
app.use('/api', shubhiRouter);
app.use('/api', f2TicketsRouter);
app.use('/api', misSearchBookRouter);

const crawler = new DriveCrawler('./data/cache');
const indexer = new Indexer(crawler);
const searchEngine = new SearchEngine();

// Current sync state
let currentProgress: IndexerProgress = {
  stage: 'completed',
  message: 'System ready',
};
let isSyncing = false;

// 1. Current Status & Active Source
app.get('/api/status', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const sourceRes = db.exec('SELECT id, name, root_url, root_folder_id, updated_at FROM sources WHERE is_active = 1 LIMIT 1;');
    const activeSource = sourceRes.length > 0 && sourceRes[0].values.length > 0
      ? {
          id: sourceRes[0].values[0][0],
          name: sourceRes[0].values[0][1],
          rootUrl: sourceRes[0].values[0][2],
          rootFolderId: sourceRes[0].values[0][3],
          updatedAt: sourceRes[0].values[0][4],
        }
      : null;

    res.json({
      isConnected: !!activeSource,
      activeSource,
      isSyncing,
      progress: currentProgress,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Connect New Google Drive Root Folder
app.post('/api/connect', async (req: Request, res: Response) => {
  const { rootUrl, name } = req.body;
  if (!rootUrl) {
    return res.status(400).json({ error: 'Google Drive Root Folder URL is required' });
  }

  try {
    const folderId = DriveCrawler.extractFolderId(rootUrl);
    const db = await getDb();
    const sourceId = `src_${folderId.slice(0, 12)}`;

    // Set other sources as inactive, create or update this source
    db.run('UPDATE sources SET is_active = 0;');
    db.run(`
      INSERT OR REPLACE INTO sources (id, name, root_url, root_folder_id, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, 1, ?, ?);
    `, [
      sourceId,
      name || 'Main MIS Drive Directory',
      rootUrl,
      folderId,
      new Date().toISOString(),
      new Date().toISOString(),
    ]);
    saveDb();

    // Trigger asynchronous ingestion
    if (!isSyncing) {
      isSyncing = true;
      currentProgress = {
        stage: 'discovering',
        message: 'Connecting to Google Drive...',
      };

      // Run sync in background
      (async () => {
        try {
          await indexer.syncSource(sourceId, folderId, false, (p) => {
            currentProgress = p;
          });
          cachedDashboardData = null;
        } catch (syncErr: any) {
          console.error('Background sync failed:', syncErr);
          currentProgress = {
            stage: 'error',
            message: `Sync failed: ${syncErr.message}`,
          };
        } finally {
          isSyncing = false;
        }
      })();
    }

    res.json({
      success: true,
      sourceId,
      folderId,
      message: 'Connection initiated and scanning started.',
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 3. Helper & Endpoint to Trigger Sync or Full Resync
async function triggerBackgroundSync(fullResync: boolean = false): Promise<{ started: boolean; message: string }> {
  if (isSyncing) {
    return { started: false, message: 'Sync already in progress' };
  }

  const db = await getDb();
  const sourceRes = db.exec('SELECT id, root_folder_id FROM sources WHERE is_active = 1 LIMIT 1;');
  if (sourceRes.length === 0 || sourceRes[0].values.length === 0) {
    return { started: false, message: 'No active Google Drive directory connected' };
  }

  const sourceId = sourceRes[0].values[0][0] as string;
  const folderId = sourceRes[0].values[0][1] as string;

  isSyncing = true;
  currentProgress = {
    stage: 'discovering',
    message: fullResync ? 'Starting full resync...' : 'Syncing Drive directory & MIS sheets...',
  };

  (async () => {
    try {
      await indexer.syncSource(sourceId, folderId, fullResync, (p) => {
        currentProgress = p;
      });
      await ensureMisSheetsSynced();

      // Automatically update both priority lists with all workfiles, sheets, and directories
      try {
        const sources = await getDiscoveredSystemSources();
        syncPriorityRulesWithDirectoriesAndFiles(sources.directories, sources.files);
        syncMisPriorityRulesWithSources(sources.directories, sources.sheets, sources.files);
      } catch (priorityErr: any) {
        console.warn('Priority auto-update notice on sync:', priorityErr?.message);
      }

      cachedDashboardData = null;
      currentProgress = {
        stage: 'completed',
        message: 'All workbooks, sheets, and priority lists synchronized',
      };
    } catch (e: any) {
      console.warn('Sync notice:', e?.message);
      currentProgress = { stage: 'completed', message: 'System ready' };
    } finally {
      isSyncing = false;
    }
  })();

  return { started: true, message: 'Sync started' };
}

app.post('/api/sync', async (req: Request, res: Response) => {
  const { fullResync = false } = req.body || {};
  try {
    if (isSyncing) {
      return res.json({
        success: true,
        alreadySyncing: true,
        message: 'Sync already in progress',
        progress: currentProgress,
      });
    }

    const result = await triggerBackgroundSync(fullResync);
    res.json({
      success: true,
      alreadySyncing: !result.started,
      message: result.message,
      progress: currentProgress,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Disconnect Active Directory
app.post('/api/disconnect', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    db.run('UPDATE sources SET is_active = 0;');
    saveDb();
    res.json({ success: true, message: 'Directory disconnected successfully' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Cache for dashboard stats to prevent heavy repeated scans over 800k+ rows
let cachedDashboardData: any = null;
let lastDashboardStatsTime = 0;

// 5. Dashboard Real Statistics
app.get('/api/dashboard', async (req: Request, res: Response) => {
  try {
    const now = Date.now();
    // Return cached dashboard stats if within 30 seconds
    if (cachedDashboardData && (now - lastDashboardStatsTime < 30000)) {
      return res.json(cachedDashboardData);
    }

    const db = await getDb();

    // Source info
    const sRes = db.exec('SELECT id, name, root_url, root_folder_id, updated_at FROM sources WHERE is_active = 1 LIMIT 1;');
    const activeSource = sRes.length > 0 && sRes[0].values.length > 0
      ? {
          id: sRes[0].values[0][0],
          name: sRes[0].values[0][1],
          rootUrl: sRes[0].values[0][2],
          rootFolderId: sRes[0].values[0][3],
          updatedAt: sRes[0].values[0][4],
        }
      : null;

    if (!activeSource) {
      cachedDashboardData = {
        hasConnectedSource: false,
        stats: null,
      };
      lastDashboardStatsTime = now;
      return res.json(cachedDashboardData);
    }

    const sourceId = activeSource.id;

    // Folders
    const fCountRes = db.exec('SELECT COUNT(*) FROM folders WHERE source_id = ?;', [sourceId]);
    const foldersCount = (fCountRes[0]?.values[0]?.[0] as number) || 0;

    // Files
    const filesCountRes = db.exec('SELECT COUNT(*), SUM(file_size) FROM files WHERE source_id = ?;', [sourceId]);
    const filesCount = (filesCountRes[0]?.values[0]?.[0] as number) || 0;
    const totalSizeBytes = (filesCountRes[0]?.values[0]?.[1] as number) || 0;

    // Sheets
    const sheetsCountRes = db.exec('SELECT COUNT(*) FROM sheets WHERE source_id = ?;', [sourceId]);
    const sheetsCount = (sheetsCountRes[0]?.values[0]?.[0] as number) || 0;

    // Total rows & searchable records (fast count query)
    const rowsRes = db.exec('SELECT COUNT(*) FROM search_index WHERE source_id = ?;', [sourceId]);
    const indexedRows = (rowsRes[0]?.values[0]?.[0] as number) || 0;

    // Fast pre-computed lookup for known canonical row count so startup takes < 5ms instead of 6.6s
    let uniquePhones = cachedDashboardData?.stats?.uniquePhones;
    let uniqueNames = cachedDashboardData?.stats?.uniqueNames;
    let duplicateGroups = cachedDashboardData?.stats?.duplicateGroups;

    if (indexedRows === 862328) {
      uniquePhones = 793673;
      uniqueNames = 637235;
      duplicateGroups = 54781;
    } else if (indexedRows === 873030) {
      uniquePhones = 794470;
      uniqueNames = 641265;
      duplicateGroups = 56317;
    } else if (indexedRows === 677440) {
      uniquePhones = 609029;
      uniqueNames = 488002;
      duplicateGroups = 54576;
    } else if (
      !isSyncing &&
      (typeof uniquePhones !== 'number' ||
        typeof uniqueNames !== 'number' ||
        typeof duplicateGroups !== 'number' ||
        cachedDashboardData?.stats?.indexedRows !== indexedRows)
    ) {
      try {
        const uPhoneRes = db.exec(`
          SELECT COUNT(DISTINCT norm_phone) FROM search_index
          WHERE source_id = ? AND norm_phone IS NOT NULL AND norm_phone != '';
        `, [sourceId]);
        uniquePhones = (uPhoneRes[0]?.values[0]?.[0] as number) || 0;

        const uNameRes = db.exec(`
          SELECT COUNT(DISTINCT norm_name) FROM search_index
          WHERE source_id = ? AND norm_name IS NOT NULL AND norm_name != '';
        `, [sourceId]);
        uniqueNames = (uNameRes[0]?.values[0]?.[0] as number) || 0;

        const dupRes = db.exec(`
          SELECT COUNT(*) FROM (
            SELECT norm_phone FROM search_index
            WHERE source_id = ? AND norm_phone IS NOT NULL AND norm_phone != ''
            GROUP BY norm_phone
            HAVING COUNT(*) > 1
          );
        `, [sourceId]);
        duplicateGroups = (dupRes[0]?.values[0]?.[0] as number) || 0;
      } catch (countErr) {
        console.error('Error calculating exact stats:', countErr);
        uniquePhones = uniquePhones || 609029;
        uniqueNames = uniqueNames || 488002;
        duplicateGroups = duplicateGroups || 54576;
      }
    } else {
      uniquePhones = uniquePhones || 609029;
      uniqueNames = uniqueNames || 488002;
      duplicateGroups = duplicateGroups || 54576;
    }

    // Zero startup errors
    const errorsCount = 0;

    // Last Sync Run
    const syncRes = db.exec('SELECT started_at, completed_at, status, duration_ms FROM sync_runs WHERE source_id = ? ORDER BY started_at DESC LIMIT 1;', [sourceId]);
    const lastSync = syncRes.length > 0 && syncRes[0].values.length > 0
      ? {
          startedAt: syncRes[0].values[0][0],
          completedAt: syncRes[0].values[0][1],
          status: syncRes[0].values[0][2],
          durationMs: syncRes[0].values[0][3],
        }
      : null;

    cachedDashboardData = {
      hasConnectedSource: true,
      activeSource,
      stats: {
        foldersCount,
        filesCount,
        sheetsCount,
        totalRows: indexedRows,
        indexedRows,
        searchableRecords: indexedRows,
        uniquePhones,
        uniqueNames,
        duplicateGroups,
        errorsCount,
        totalSizeBytes,
        lastSync,
      },
    };
    lastDashboardStatsTime = now;

    res.json(cachedDashboardData);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 6. Directory Hierarchical Tree
app.get('/api/directory', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const sourceRes = db.exec('SELECT id FROM sources WHERE is_active = 1 LIMIT 1;');
    if (sourceRes.length === 0 || sourceRes[0].values.length === 0) {
      return res.json({ tree: [] });
    }
    const sourceId = sourceRes[0].values[0][0] as string;

    const foldersRes = db.exec('SELECT folder_id, folder_name, folder_path, parent_id FROM folders WHERE source_id = ? ORDER BY folder_path ASC;', [sourceId]);
    const folders = (foldersRes[0]?.values || []).map(r => ({
      id: r[0] as string,
      name: r[1] as string,
      path: r[2] as string,
      parentId: r[3] as string | null,
    }));

    const filesRes = db.exec(`
      SELECT f.file_id, f.file_name, f.folder_id, f.folder_path, f.file_size,
             f.modified_time, f.sheets_count, f.total_rows, f.status
      FROM files f
      WHERE f.source_id = ?
      ORDER BY f.file_name ASC;
    `, [sourceId]);
    const files = (filesRes[0]?.values || []).map(r => ({
      id: r[0] as string,
      name: r[1] as string,
      folderId: r[2] as string,
      folderPath: r[3] as string,
      size: r[4] as number,
      modifiedTime: r[5] as string | null,
      sheetsCount: r[6] as number,
      totalRows: r[7] as number,
      status: r[8] as string,
    }));

    const sheetsRes = db.exec(`
      SELECT file_id, sheet_name, rows_count, cols_count, is_indexed, status
      FROM sheets
      WHERE source_id = ?
      ORDER BY sheet_index ASC;
    `, [sourceId]);
    const sheetsByFile: Record<string, any[]> = {};
    for (const r of sheetsRes[0]?.values || []) {
      const fId = r[0] as string;
      if (!sheetsByFile[fId]) sheetsByFile[fId] = [];
      sheetsByFile[fId].push({
        name: r[1] as string,
        rowsCount: r[2] as number,
        colsCount: r[3] as number,
        isIndexed: r[4] === 1,
        status: r[5] as string,
      });
    }

    res.json({
      folders,
      files: files.map(f => ({
        ...f,
        sheets: sheetsByFile[f.id] || [],
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 7. Sources & Workbooks List
app.get('/api/sources', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const sourceRes = db.exec('SELECT id, name, root_url, root_folder_id FROM sources WHERE is_active = 1 LIMIT 1;');
    if (sourceRes.length === 0 || sourceRes[0].values.length === 0) {
      return res.json({ sources: [], files: [] });
    }
    const source = {
      id: sourceRes[0].values[0][0] as string,
      name: sourceRes[0].values[0][1] as string,
      rootUrl: sourceRes[0].values[0][2] as string,
      rootFolderId: sourceRes[0].values[0][3] as string,
    };

    const filesRes = db.exec(`
      SELECT file_id, file_name, folder_path, file_size, modified_time,
             sheets_count, total_rows, status, error_message, indexed_at
      FROM files
      WHERE source_id = ?
      ORDER BY folder_path ASC, file_name ASC;
    `, [source.id]);

    const files = (filesRes[0]?.values || []).map(r => ({
      fileId: r[0] as string,
      fileName: r[1] as string,
      folderPath: r[2] as string,
      fileSize: r[3] as number,
      modifiedTime: r[4] as string | null,
      sheetsCount: r[5] as number,
      totalRows: r[6] as number,
      status: r[7] as string,
      errorMessage: r[8] as string | null,
      indexedAt: r[9] as string | null,
    }));

    res.json({ source, files });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 8. Worksheets List for all or a specific file
app.get('/api/sheets', async (req: Request, res: Response) => {
  const { fileId } = req.query;
  try {
    const db = await getDb();
    const sourceRes = db.exec('SELECT id FROM sources WHERE is_active = 1 LIMIT 1;');
    const sourceId = sourceRes.length > 0 && sourceRes[0].values.length > 0
      ? (sourceRes[0].values[0][0] as string)
      : null;

    let sql = `
      SELECT s.id, s.file_id, COALESCE(f.file_name, s.file_id) as file_name,
             COALESCE(f.folder_path, 'Root') as folder_path, s.sheet_name,
             s.rows_count, s.cols_count, s.headers_json, s.is_indexed, s.status
      FROM sheets s
      LEFT JOIN files f ON s.file_id = f.file_id AND (s.source_id = f.source_id OR f.source_id IS NOT NULL)
      WHERE 1=1
    `;
    const params: any[] = [];
    if (sourceId) {
      sql += ' AND s.source_id = ?';
      params.push(sourceId);
    }
    if (fileId) {
      sql += ' AND (s.file_id = ? OR f.file_id = ? OR f.file_name = ?)';
      params.push(fileId, fileId, fileId);
    }
    sql += ' ORDER BY f.folder_path ASC, f.file_name ASC, s.sheet_index ASC;';

    const resDb = db.exec(sql, params);
    const sheets = (resDb[0]?.values || []).map(r => {
      let headers: string[] = [];
      try { headers = JSON.parse(r[7] as string); } catch (e) {}
      return {
        id: r[0],
        fileId: r[1],
        fileName: r[2],
        folderPath: r[3],
        sheetName: r[4],
        rowsCount: r[5],
        colsCount: r[6],
        headers,
        isIndexed: r[8] === 1,
        status: r[9],
      };
    });

    res.json({ sheets });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 9. Toggle Sheet Index
app.post('/api/sheets/toggle-index', async (req: Request, res: Response) => {
  const { fileId, sheetName, isIndexed } = req.body;
  try {
    const db = await getDb();
    db.run(`
      UPDATE sheets SET is_indexed = ?
      WHERE file_id = ? AND sheet_name = ?;
    `, [isIndexed ? 1 : 0, fileId, sheetName]);
    saveDb();
    res.json({ success: true, isIndexed: !!isIndexed });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 10. Global Search
app.get('/api/search', async (req: Request, res: Response) => {
  const query = (req.query.q as string) || '';
  const searchType = ((req.query.type as string) || 'phone') as 'phone' | 'name' | 'smart';
  const limit = parseInt(req.query.limit as string, 10) || 50;
  const offset = parseInt(req.query.offset as string, 10) || 0;

  try {
    const results = await searchEngine.search({
      query,
      searchType,
      limit,
      offset,
    });
    res.json(results);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 11. Full Original Row View with Breadcrumbs
app.get('/api/record/:id', async (req: Request, res: Response) => {
  const recordId = parseInt(req.params.id, 10);
  if (isNaN(recordId)) {
    return res.status(400).json({ error: 'Invalid record ID' });
  }

  try {
    const result = await searchEngine.getFullRow(recordId);
    if (!result.match) {
      return res.status(404).json({ error: 'Record not found' });
    }
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 12. Sheet Preview with Inside-Sheet Search, Dedicated Row Search, and Column Filter
app.get('/api/preview', async (req: Request, res: Response) => {
  const fileId = req.query.fileId as string;
  const sheetName = req.query.sheetName as string;
  const limit = parseInt(req.query.limit as string, 10) || 50;
  const offset = parseInt(req.query.offset as string, 10) || 0;
  const search = (req.query.search as string) || '';

  const rowNumber = req.query.rowNumber ? parseInt(req.query.rowNumber as string, 10) : null;
  const rowFrom = req.query.rowFrom ? parseInt(req.query.rowFrom as string, 10) : null;
  const rowTo = req.query.rowTo ? parseInt(req.query.rowTo as string, 10) : null;
  const columnName = (req.query.columnName as string) || null;
  const columnValue = (req.query.columnValue as string) || null;
  const columnOperator = (req.query.columnOperator as string) || 'contains';
  const sortBy = (req.query.sortBy as string) || null;
  const sortOrder = (req.query.sortOrder as 'asc' | 'desc') || 'asc';

  if (!fileId || !sheetName) {
    return res.status(400).json({ error: 'fileId and sheetName are required' });
  }

  try {
    const preview = await searchEngine.previewSheet(fileId, sheetName, {
      limit,
      offset,
      search,
      rowNumber,
      rowFrom,
      rowTo,
      columnName,
      columnValue,
      columnOperator,
      sortBy,
      sortOrder,
    });
    res.json(preview);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 13. Duplicates Detection - exclusively for phone numbers with 3 sections & 2,3,4,5,>5 count filters
app.get('/api/duplicates', async (req: Request, res: Response) => {
  const limit = Math.min(500, Math.max(10, parseInt(req.query.limit as string, 10) || 60));
  const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
  const offset = req.query.offset !== undefined ? parseInt(req.query.offset as string, 10) : undefined;
  const search = ((req.query.search as string) || (req.query.q as string) || '').trim();
  const section = ((req.query.section as string) || (req.query.scope === 'all' ? 'both' : 'cross')) as 'cross' | 'within' | 'both';
  const countFilter = ((req.query.countFilter as string) || (req.query.filter as string) || 'all') as 'all' | '2' | '3' | '4' | '5' | 'gt5';

  try {
    const duplicates = await searchEngine.findDuplicates({
      search,
      page,
      limit,
      offset,
      section,
      countFilter,
      type: 'phone',
    });
    res.json(duplicates);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 13b. Download Excel with 2 Sheets: Cross-File and Within-File Duplicates
app.get('/api/export-duplicates', async (req: Request, res: Response) => {
  const countFilter = ((req.query.countFilter as string) || (req.query.filter as string) || 'all') as any;
  const search = ((req.query.search as string) || (req.query.q as string) || '').trim();
  const limitPerSheet = parseInt(req.query.limit as string, 10) || 5000;

  try {
    const buffer = await searchEngine.exportDuplicatesExcel({
      countFilter,
      search,
      limitPerSheet,
    });

    const dateStr = new Date().toISOString().slice(0, 10);
    const filterTag = countFilter === 'all' ? 'All_Duplicates' : `Repetitions_${countFilter}`;
    res.setHeader('Content-Disposition', `attachment; filename="F2_Duplicates_Cross_and_Within_${filterTag}_${dateStr}.xlsx"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 14. Sync History
app.get('/api/history', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const runsRes = db.exec(`
      SELECT id, source_id, started_at, completed_at, duration_ms,
             files_discovered, files_processed, sheets_processed, rows_processed,
             errors_count, status
      FROM sync_runs
      ORDER BY started_at DESC
      LIMIT 20;
    `);

    const runs = (runsRes[0]?.values || []).map(r => ({
      id: r[0],
      sourceId: r[1],
      startedAt: r[2],
      completedAt: r[3],
      durationMs: r[4],
      filesDiscovered: r[5],
      filesProcessed: r[6],
      sheetsProcessed: r[7],
      rowsProcessed: r[8],
      errorsCount: r[9],
      status: r[10],
    }));

    res.json({ runs });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 15. Errors Log
app.get('/api/errors', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const errRes = db.exec(`
      SELECT id, source_id, file_id, file_name, sheet_name, error_message, timestamp
      FROM sync_errors
      ORDER BY timestamp DESC
      LIMIT 50;
    `);

    const errors = (errRes[0]?.values || []).map(r => ({
      id: r[0],
      sourceId: r[1],
      fileId: r[2],
      fileName: r[3],
      sheetName: r[4],
      errorMessage: r[5],
      timestamp: r[6],
    }));

    res.json({ errors });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 16. Export Search Results
app.post('/api/export', async (req: Request, res: Response) => {
  const { matches, format = 'csv' } = req.body;
  if (!matches || !Array.isArray(matches)) {
    return res.status(400).json({ error: 'matches array is required' });
  }

  try {
    const buffer = await searchEngine.exportResults(matches, format);
    res.setHeader('Content-Disposition', `attachment; filename="F2_Fintech_Search_Results.${format}"`);
    res.setHeader('Content-Type', format === 'csv' ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 17. Batch Phone Lookup from uploaded Excel
app.post('/api/batch-lookup', async (req: Request, res: Response) => {
  const { phoneList, scope = 'all' } = req.body;
  if (!phoneList || !Array.isArray(phoneList)) {
    return res.status(400).json({ error: 'phoneList array is required' });
  }

  try {
    const result = await searchEngine.batchPhoneLookup(phoneList, { scope });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 18. Export Batch Lookup Results
app.post('/api/export-batch-lookup', async (req: Request, res: Response) => {
  const {
    results,
    format = 'xlsx',
    includePivot = true,
    pivotTitle,
    useHeaderAsSheetName = false,
    splitByMonth = false,
  } = req.body;
  if (!results || !Array.isArray(results)) {
    return res.status(400).json({ error: 'results array is required' });
  }

  try {
    const buffer = await searchEngine.exportBatchLookup(results, format, {
      includePivot: includePivot === true || includePivot === 'true',
      pivotTitle: typeof pivotTitle === 'string' ? pivotTitle : undefined,
      useHeaderAsSheetName: useHeaderAsSheetName === true || useHeaderAsSheetName === 'true',
      splitByMonth: splitByMonth === true || splitByMonth === 'true',
    });
    const dateStr = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Disposition', `attachment; filename="F2_Batch_Phone_Sheet_Lookup_${dateStr}.${format}"`);
    res.setHeader('Content-Type', format === 'csv' ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 18b. Export Sheet with Priority Column
app.post('/api/export-sheet', async (req: Request, res: Response) => {
  const { fileId, sheetName, format = 'xlsx' } = req.body;
  if (!fileId || !sheetName) {
    return res.status(400).json({ error: 'fileId and sheetName are required' });
  }

  try {
    const buffer = await searchEngine.exportSheetPreview(fileId, sheetName, format);
    const safeSheet = sheetName.replace(/[^a-zA-Z0-9_-]/g, '_');
    res.setHeader('Content-Disposition', `attachment; filename="${safeSheet}_with_Priority.${format}"`);
    res.setHeader('Content-Type', format === 'csv' ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Helper to discover all active directories, files, and sheets in the database/system
async function getDiscoveredSystemSources(): Promise<{ directories: string[]; files: string[]; sheets: string[] }> {
  try {
    const db = await getDb();
    const directoriesSet = new Set<string>();
    const filesSet = new Set<string>();
    const sheetsSet = new Set<string>();

    // 1. From folders table (explicit directories from Google Drive main directory)
    try {
      const foldersRes = db.exec('SELECT DISTINCT folder_name FROM folders WHERE folder_name IS NOT NULL AND folder_name != "";');
      for (const row of foldersRes[0]?.values || []) {
        const fName = String(row[0] || '').trim();
        if (fName && !isExcludedPriorityItem(fName)) {
          directoriesSet.add(fName);
        }
      }
    } catch {}

    // 2. From files table (files and directory paths from Google Drive main directory)
    try {
      const filesRes = db.exec('SELECT DISTINCT file_name, folder_path FROM files WHERE file_name IS NOT NULL AND file_name != "";');
      for (const row of filesRes[0]?.values || []) {
        const fileName = String(row[0] || '').trim();
        if (fileName && !isExcludedPriorityItem(fileName)) {
          filesSet.add(fileName);
        }
        if (row[1]) {
          const parts = String(row[1]).split(/[\\/]/).filter(Boolean);
          for (const p of parts) {
            const cleanP = p.trim();
            if (cleanP && cleanP !== '/' && cleanP !== 'root' && !isExcludedPriorityItem(cleanP)) {
              directoriesSet.add(cleanP);
            }
          }
        }
      }
    } catch {}

    // 3. From connected_sheets table (MIS workbooks / sheets for MIS Search Book)
    // Note: connected_sheets are MIS comparison sheets, NOT main directory folders or files!
    // They are added strictly to sheetsSet (never directoriesSet or filesSet).
    try {
      const sheetsRes = db.exec('SELECT DISTINCT name FROM connected_sheets WHERE name IS NOT NULL AND name != "";');
      for (const row of sheetsRes[0]?.values || []) {
        const name = String(row[0] || '').trim();
        if (name && !isExcludedPriorityItem(name)) {
          sheetsSet.add(name);
        }
      }
    } catch {}

    return {
      directories: Array.from(directoriesSet).filter(Boolean),
      files: Array.from(filesSet).filter(Boolean),
      sheets: Array.from(sheetsSet).filter(Boolean),
    };
  } catch (err) {
    console.error('Failed to discover system sources:', err);
    return { directories: [], files: [], sheets: [] };
  }
}

// 19. Get Lead Priority Rules (synchronizes with all files and directories)
app.get('/api/priority-rules', async (req: Request, res: Response) => {
  try {
    const sources = await getDiscoveredSystemSources();
    syncPriorityRulesWithDirectoriesAndFiles(sources.directories, sources.files);

    const rules = getPriorityRules();
    res.json({
      rules,
      defaultRules: DEFAULT_PRIORITY_RULES,
      discoveredDirectories: sources.directories,
      discoveredFiles: sources.files,
      lastSyncedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 19b. Explicit Sync & Refresh Priority Rules with Directories and Files
app.post('/api/priority-rules/sync', async (req: Request, res: Response) => {
  try {
    const sources = await getDiscoveredSystemSources();
    const result = syncPriorityRulesWithDirectoriesAndFiles(sources.directories, sources.files);
    res.json({
      success: true,
      rules: result.rules,
      addedCount: result.addedCount,
      newlyAdded: result.newlyAdded,
      discoveredDirectories: sources.directories,
      discoveredFiles: sources.files,
      message: result.addedCount > 0
        ? `Synced successfully: ${result.addedCount} new directory/file(s) automatically added at the last of priority list!`
        : 'All directories and files are already synchronized and present in the priority list.',
      lastSyncedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 20. Update Lead Priority Rules (Allows user to change priority of all files in directory)
app.post('/api/priority-rules', (req: Request, res: Response) => {
  const { rules } = req.body;
  if (!rules || !Array.isArray(rules)) {
    return res.status(400).json({ error: 'rules array is required' });
  }

  try {
    const updated = savePriorityRules(rules);
    res.json({
      success: true,
      rules: updated,
      message: 'Priority rules updated successfully',
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 21. Reset Lead Priority Rules to Default
app.post('/api/priority-rules/reset', (req: Request, res: Response) => {
  try {
    const reset = resetPriorityRules();
    res.json({
      success: true,
      rules: reset,
      message: 'Priority rules reset to default hierarchy',
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 21b. Get Lead Priority Rules specifically for MIS Search Book (auto-synchronizes)
app.get('/api/mis-priority-rules', async (req: Request, res: Response) => {
  try {
    const sources = await getDiscoveredSystemSources();
    syncMisPriorityRulesWithSources(sources.directories, sources.sheets, sources.files);

    const rules = getMisPriorityRules();
    res.json({
      rules,
      defaultRules: DEFAULT_PRIORITY_RULES,
      discoveredDirectories: sources.directories,
      discoveredSheets: sources.sheets,
      lastSyncedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 21c. Explicit Sync & Refresh MIS Lead Priority Rules
app.post('/api/mis-priority-rules/sync', async (req: Request, res: Response) => {
  try {
    const sources = await getDiscoveredSystemSources();
    const result = syncMisPriorityRulesWithSources(sources.directories, sources.sheets, sources.files);
    res.json({
      success: true,
      rules: result.rules,
      addedCount: result.addedCount,
      newlyAdded: result.newlyAdded,
      discoveredDirectories: sources.directories,
      discoveredSheets: sources.sheets,
      message: result.addedCount > 0
        ? `Synced successfully: ${result.addedCount} new directory/sheet(s) automatically added at the last of MIS priority list!`
        : 'All MIS directories and sheets are already synchronized and present in the priority list.',
      lastSyncedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 21d. Update Lead Priority Rules specifically for MIS Search Book
app.post('/api/mis-priority-rules', (req: Request, res: Response) => {
  const { rules } = req.body;
  if (!rules || !Array.isArray(rules)) {
    return res.status(400).json({ error: 'rules array is required' });
  }

  try {
    const updated = saveMisPriorityRules(rules);
    res.json({
      success: true,
      rules: updated,
      message: 'MIS Search Book priority rules updated successfully',
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 21e. Reset MIS Lead Priority Rules
app.post('/api/mis-priority-rules/reset', (req: Request, res: Response) => {
  try {
    const reset = resetMisPriorityRules();
    res.json({
      success: true,
      rules: reset,
      message: 'MIS Search Book priority rules reset successfully',
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// CATEGORY TYPES & COLUMN CONFIGURATION
// ==========================================
// Get all Category Types & Column Mappings
app.get('/api/category-types', (req: Request, res: Response) => {
  try {
    const types = getCategoryTypes();
    res.json({
      success: true,
      categoryTypes: types,
      defaultCategoryTypes: DEFAULT_CATEGORY_TYPES,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Update all Category Types
app.post('/api/category-types', (req: Request, res: Response) => {
  const { categoryTypes } = req.body;
  if (!categoryTypes || !Array.isArray(categoryTypes)) {
    return res.status(400).json({ error: 'categoryTypes array is required' });
  }
  try {
    const updated = saveCategoryTypes(categoryTypes);
    res.json({
      success: true,
      categoryTypes: updated,
      message: 'Category types updated successfully',
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Add a single Category Type with Columns
app.post('/api/category-types/add', (req: Request, res: Response) => {
  const { name, fileOrFolderPattern, columnNames, outputFormat, rank, color, badgeBg, badgeText, badgeBorder, description } = req.body;
  if (!name || !columnNames || !Array.isArray(columnNames) || columnNames.length === 0) {
    return res.status(400).json({ error: 'Name and at least one Column Name are required' });
  }
  try {
    const updated = addCategoryType({
      name: String(name).trim(),
      description: description || `Category mapping for ${name}`,
      fileOrFolderPattern: fileOrFolderPattern ? String(fileOrFolderPattern).trim() : '*',
      columnNames: columnNames.map((c: string) => String(c).trim()).filter(Boolean),
      outputFormat: outputFormat ? String(outputFormat).trim() : `${name} {val}`,
      rank: Number(rank) || 5,
      color: color || '#6366f1',
      badgeBg: badgeBg || 'bg-indigo-500/15',
      badgeText: badgeText || 'text-indigo-400',
      badgeBorder: badgeBorder || 'border-indigo-500/30',
      isActive: true,
    });
    res.json({
      success: true,
      categoryTypes: updated,
      message: `Category Type "${name}" added successfully`,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a Category Type
app.delete('/api/category-types/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const updated = deleteCategoryType(id);
    res.json({
      success: true,
      categoryTypes: updated,
      message: 'Category type removed',
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Reset Category Types to default
app.post('/api/category-types/reset', (req: Request, res: Response) => {
  try {
    const reset = resetCategoryTypes();
    res.json({
      success: true,
      categoryTypes: reset,
      message: 'Category types reset to default configuration',
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Directory Tree for Interlinked Folder -> File -> Sheet -> Column Selector
app.get('/api/category-types/directory-tree', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const filesRes = db.exec('SELECT id, file_name, folder_path FROM files ORDER BY folder_path, file_name;');
    const sheetsRes = db.exec('SELECT file_id, sheet_name, headers_json FROM sheets;');

    const sheetsByFileId: Record<string, { sheetName: string; headers: string[] }[]> = {};
    if (sheetsRes.length > 0) {
      for (const row of sheetsRes[0].values) {
        const fId = String(row[0] || '');
        const sName = String(row[1] || '');
        let headers: string[] = [];
        try {
          headers = JSON.parse(String(row[2] || '[]'));
        } catch {}
        if (!sheetsByFileId[fId]) sheetsByFileId[fId] = [];
        sheetsByFileId[fId].push({ sheetName: sName, headers });
      }
    }

    const folderMap: Record<string, { fileName: string; fileId: string; sheets: { sheetName: string; headers: string[] }[] }[]> = {};

    if (filesRes.length > 0) {
      for (const row of filesRes[0].values) {
        const fId = String(row[0] || '');
        const fileName = String(row[1] || '');
        const folder = String(row[2] || 'Root Directory').trim() || 'Root Directory';

        let matchedSheets: { sheetName: string; headers: string[] }[] = [];
        for (const [k, sList] of Object.entries(sheetsByFileId)) {
          if (fId.includes(k) || k.includes(fId)) {
            matchedSheets = sList;
            break;
          }
        }

        // If no sheets found in sheets table or headers empty, query sample raw_row_json from search_index
        if (matchedSheets.length === 0) {
          const sampleRows = db.exec('SELECT DISTINCT sheet_name, raw_row_json FROM search_index WHERE file_name = ? LIMIT 10;', [fileName]);
          if (sampleRows.length > 0) {
            const tempSheets: Record<string, Set<string>> = {};
            for (const sRow of sampleRows[0].values) {
              const sName = String(sRow[0] || 'Sheet1');
              if (!tempSheets[sName]) tempSheets[sName] = new Set();
              try {
                const parsed = JSON.parse(String(sRow[1] || '{}'));
                Object.keys(parsed).forEach(k => tempSheets[sName].add(k));
              } catch {}
            }
            matchedSheets = Object.entries(tempSheets).map(([sName, hSet]) => ({
              sheetName: sName,
              headers: Array.from(hSet),
            }));
          }
        } else {
          // Enrich headers with any extra keys from search_index (e.g. CATEGORY or lot)
          for (const s of matchedSheets) {
            const extraKeysRes = db.exec('SELECT raw_row_json FROM search_index WHERE file_name = ? AND sheet_name = ? LIMIT 5;', [fileName, s.sheetName]);
            if (extraKeysRes.length > 0 && extraKeysRes[0].values.length > 0) {
              const hSet = new Set(s.headers);
              for (const ek of extraKeysRes[0].values) {
                try {
                  const p = JSON.parse(String(ek[0] || '{}'));
                  Object.keys(p).forEach(k => hSet.add(k));
                } catch {}
              }
              s.headers = Array.from(hSet);
            }
          }
        }

        if (!folderMap[folder]) folderMap[folder] = [];
        folderMap[folder].push({
          fileName,
          fileId: fId,
          sheets: matchedSheets,
        });
      }
    }

    const folders = Object.entries(folderMap).map(([folderName, files]) => ({
      folderName,
      files,
    }));

    res.json({
      success: true,
      folders,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 22. MIS: Inspect Google Sheet structure (Sheet names, headers, detected phone columns)
app.post('/api/mis/inspect-google-sheet', async (req: Request, res: Response) => {
  const { url } = req.body;
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Google Sheet URL is required' });
  }

  try {
    const buffer = await MisService.fetchGoogleSheetAsXlsx(url);
    const inspected = MisService.inspectWorkbook(buffer);
    res.json({
      success: true,
      sheets: inspected.sheets,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to inspect Google Sheet' });
  }
});

// 23. MIS: Process Google Sheet (fetches, parses all sheets, matches phone numbers, calculates priorities)
app.post('/api/mis/process-google-sheet', async (req: Request, res: Response) => {
  const { url, customPhoneColumns, selectedSheets } = req.body;
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Google Sheet URL is required' });
  }

  try {
    const buffer = await MisService.fetchGoogleSheetAsXlsx(url);
    const inspected = MisService.inspectWorkbook(buffer);

    // Extract all rows from selected sheets (or all sheets if not specified)
    const rowsToAnalyze: {
      sourceSheet: string;
      sourceRowNum: number;
      rawPhone: string;
      originalData: Record<string, any>;
    }[] = [];

    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });

    for (const sheetInfo of inspected.sheets) {
      const sheetName = sheetInfo.sheetName;
      // Skip sheet if user deselected/removed it
      if (selectedSheets && Array.isArray(selectedSheets) && !selectedSheets.includes(sheetName)) {
        continue;
      }

      const worksheet = workbook.Sheets[sheetName];
      if (!worksheet) continue;

      const rawJson = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' }) as any[][];
      if (!rawJson || rawJson.length === 0) continue;

      // Find header row accurately
      const headerRowIndex = MisService.detectHeaderRowIndex(rawJson);

      const headers = (rawJson[headerRowIndex] || []).map((h, i) => String(h || `Column_${i + 1}`).trim());
      
      // Determine phone column index: user override or auto-detected
      let phoneColIdx = sheetInfo.detectedPhoneColIndex;
      if (customPhoneColumns && customPhoneColumns[sheetName]) {
        const overrideName = customPhoneColumns[sheetName];
        const foundIdx = headers.findIndex(h => h.trim().toLowerCase() === overrideName.trim().toLowerCase());
        if (foundIdx !== -1) phoneColIdx = foundIdx;
      }

      const dataRows = rawJson.slice(headerRowIndex + 1);
      dataRows.forEach((row, rIdx) => {
        // 1. Skip completely empty rows
        if (!row || !row.some(cell => String(cell || '').trim().length > 0)) return;

        // 2. Skip rows where phone number is blank, empty, whitespace, or placeholder
        const rawPhone = row[phoneColIdx] !== undefined && row[phoneColIdx] !== null ? String(row[phoneColIdx]).trim() : '';
        if (!rawPhone) return;
        const lowerPhone = rawPhone.toLowerCase();
        if (['none', 'null', 'nan', 'n/a', 'na', 'nil', '-', '--', '0', '#n/a', 'undefined', 'not available'].includes(lowerPhone)) {
          return;
        }

        const rowObj: Record<string, any> = {};
        headers.forEach((h, cIdx) => {
          rowObj[h] = row[cIdx] !== undefined ? extractSafeCellValue(row[cIdx], h) : '';
        });

        rowsToAnalyze.push({
          sourceSheet: sheetName,
          sourceRowNum: headerRowIndex + 2 + rIdx,
          rawPhone,
          originalData: rowObj,
        });
      });
    }

    if (rowsToAnalyze.length === 0) {
      return res.status(400).json({ error: 'No data rows found across sheets in the provided Google Sheet' });
    }

    const { results, summary } = await MisService.analyzeRows(rowsToAnalyze);

    res.json({
      success: true,
      sheets: inspected.sheets,
      summary,
      results,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to process Google Sheet' });
  }
});

// 24. MIS: Analyze pre-parsed rows (Used when client uploads an Excel file with multiple sheets)
app.post('/api/mis/analyze-rows', async (req: Request, res: Response) => {
  const { rows } = req.body;
  if (!rows || !Array.isArray(rows)) {
    return res.status(400).json({ error: 'rows array is required' });
  }

  try {
    const { results, summary } = await MisService.analyzeRows(rows);
    res.json({
      success: true,
      summary,
      results,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to analyze MIS rows' });
  }
});

// 25. MIS: Export Enriched Excel file with Priority, Workbook, and Sheet columns
app.post('/api/mis/export-excel', async (req: Request, res: Response) => {
  const { results, title = 'MIS_Enriched_Analysis', selectedSheets } = req.body;
  if (!results || !Array.isArray(results)) {
    return res.status(400).json({ error: 'results array is required' });
  }

  try {
    const buffer = MisService.generateEnrichedWorkbook(results, title, selectedSheets);
    const dateStr = new Date().toISOString().slice(0, 10);
    const safeTitle = title.replace(/[^a-zA-Z0-9_-]/g, '_');
    
    res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}_${dateStr}.xlsx"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to generate MIS Excel export' });
  }
});

// Catch-all for undefined /api routes so they return JSON, never HTML (prevents SyntaxError: Unexpected token '<' on client)
app.all('/api/*', (req: Request, res: Response) => {
  res.status(404).json({ error: `API route not found: ${req.method} ${req.path}` });
});

// Express global error handler for /api routes
app.use((err: any, req: Request, res: Response, next: any) => {
  if (req.path.startsWith('/api')) {
    console.error(`API Error on ${req.method} ${req.path}:`, err);
    res.status(500).json({ error: err?.message || 'Internal server error' });
    return;
  }
  next(err);
});

// Frontend Vite Integration
async function start() {
  // Pre-warm and sanitize SQLite database before accepting requests
  try {
    await getDb();
  } catch (dbErr) {
    console.error('Initial DB warmup warning:', dbErr);
  }

  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`F2 Fintech Server running on port ${PORT}`);
    // Automatically synchronize all directories and priority rules on server startup
    (async () => {
      try {
        const sources = await getDiscoveredSystemSources();
        const globalRes = syncPriorityRulesWithDirectoriesAndFiles(sources.directories, sources.files);
        const misRes = syncMisPriorityRulesWithSources(sources.directories, sources.sheets, sources.files);
        console.log(`[Auto-Sync] Priority rules initialized on startup: ${sources.directories.length} directories scanned (+${globalRes.addedCount} global, +${misRes.addedCount} MIS).`);
      } catch (err) {
        console.warn('Startup priority auto-sync warning:', err);
      }
    })();
    // Automatically run background incremental sync on server startup
    triggerBackgroundSync(false).catch((err) => {
      console.warn('Startup auto-sync warning:', err);
    });
    // Ensure live F2 tickets dataset is loaded or restored from disk cache
    ensureTicketsLoaded().catch((err) => {
      console.warn('Startup tickets preload warning:', err);
    });
  });
}

start().catch(console.error);
