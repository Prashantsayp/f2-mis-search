import { Router, Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import * as XLSXNamespace from 'xlsx';
const XLSX: any = (XLSXNamespace as any).default || XLSXNamespace;
import { standardizeProvider } from './standardizeProvider.js';

export const f2TicketsRouter = Router();

const F2_TICKETS_BASE_URL = 'https://admin.f2fintech.in/api/v1/get-all-tickets';
const F2_TICKET_DETAIL_BASE_URL = 'https://admin.f2fintech.in/api/v1/get-ticket-with-detail';
const F2_TICKET_ACTIVITIES_BASE_URL = 'https://admin.f2fintech.in/api/v1/get-ticket-activities';
const DEFAULT_START_DATE = '2000-01-01';
const DEFAULT_END_DATE = '2099-12-31';
// Page batch size used to retrieve all pages rapidly while still verifying every page until empty
const PAGE_BATCH_SIZE = 1000;
const TICKETS_CACHE_PATH = path.resolve(process.cwd(), 'data/cache/f2_tickets_session.json');

export interface TicketDetailSessionEntry {
  ticketId: string;
  fetchedAt: string;
  endpointUrl: string;
  httpStatus: number;
  statusCode: number;
  message: string;
  data: Record<string, any>;
  documentsCount: number;
}

// In-memory session cache for ticket detail responses (never stored on disk or database)
const ticketDetailMemoryCache = new Map<string, TicketDetailSessionEntry>();

export interface PageProbeLog {
  page: number;
  url: string;
  httpStatus: number;
  apiStatusCode: number;
  resultsReturned: number;
  uniqueAdded: number;
  duplicatesSkipped: number;
  apiReportedCount: number | null;
  apiReportedPages: number | null;
}

export interface InMemoryTicketsSession {
  records: Record<string, any>[];
  fetchedAt: string | null;
  pagesFetched: number;
  duplicatesRemoved: number;
  apiReportedCount: number | null;
  apiReportedPages: number | null;
  statusCode: number | null;
  statusMessage: string | null;
  stopReason: string | null;
  appliedStartDate: string;
  appliedEndDate: string;
  rawMetadataSample: Record<string, any> | null;
  pageLogs: PageProbeLog[];
}

// In-memory store for tickets with disk persistence fallback
let memorySession: InMemoryTicketsSession = {
  records: [],
  fetchedAt: null,
  pagesFetched: 0,
  duplicatesRemoved: 0,
  apiReportedCount: null,
  apiReportedPages: null,
  statusCode: null,
  statusMessage: null,
  stopReason: null,
  appliedStartDate: DEFAULT_START_DATE,
  appliedEndDate: DEFAULT_END_DATE,
  rawMetadataSample: null,
  pageLogs: [],
};

export function tryLoadTicketsCache(): boolean {
  try {
    if (fs.existsSync(TICKETS_CACHE_PATH)) {
      const raw = fs.readFileSync(TICKETS_CACHE_PATH, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed?.records) && parsed.records.length > 0) {
        memorySession = parsed;
        console.log(`[f2TicketsRouter] Successfully restored ${parsed.records.length} tickets from disk cache (${parsed.fetchedAt || 'previously fetched'}).`);
        return true;
      }
    }
  } catch (err) {
    console.warn('[f2TicketsRouter] Failed to load tickets from disk cache:', err);
  }
  return false;
}

export function trySaveTicketsCache(session: InMemoryTicketsSession): void {
  try {
    const dir = path.dirname(TICKETS_CACHE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(TICKETS_CACHE_PATH, JSON.stringify(session), 'utf-8');
    console.log(`[f2TicketsRouter] Persisted ${session.records.length} tickets to disk cache at ${TICKETS_CACHE_PATH}`);
  } catch (err) {
    console.warn('[f2TicketsRouter] Failed to persist tickets to disk cache:', err);
  }
}

// Automatically load from disk cache on initialization
tryLoadTicketsCache();

let activeFetchPromise: Promise<InMemoryTicketsSession> | null = null;
let activeFetchKey: string | null = null;

async function fetchSinglePage(
  page: number,
  startDate: string,
  endDate: string
): Promise<{
  url: string;
  httpStatus: number;
  statusCode: number;
  message: string;
  results: Record<string, any>[];
  count: number | null;
  pages: number | null;
  rawMetadata: Record<string, any>;
}> {
  const params = new URLSearchParams({
    companyId: '101',
    page: String(page),
    startDate,
    endDate,
    limit: String(PAGE_BATCH_SIZE),
  });

  const url = `${F2_TICKETS_BASE_URL}?${params.toString()}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(90000),
  });

  if (!response.ok) {
    throw new Error(`F2 Fintech API responded with HTTP ${response.status} on page ${page}`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error(`F2 Fintech API returned non-JSON response (${contentType}) on page ${page}`);
  }

  const payload: any = await response.json();
  const dataNode = payload?.data;

  const results: Record<string, any>[] = Array.isArray(dataNode?.results)
    ? dataNode.results
    : Array.isArray(payload?.results)
    ? payload.results
    : Array.isArray(dataNode)
    ? dataNode
    : Array.isArray(payload)
    ? payload
    : [];

  const count = typeof dataNode?.count === 'number' ? dataNode.count : null;
  const pages = typeof dataNode?.pages === 'number' ? dataNode.pages : null;

  // Capture exact non-results pagination metadata returned by the API
  const dataMetadata: Record<string, any> = {};
  if (dataNode && typeof dataNode === 'object' && !Array.isArray(dataNode)) {
    for (const [k, v] of Object.entries(dataNode)) {
      if (k !== 'results') {
        dataMetadata[k] = v;
      } else if (Array.isArray(v)) {
        dataMetadata['results.length'] = v.length;
      }
    }
  }

  const rawMetadata: Record<string, any> = {
    statusCode: payload?.statusCode ?? response.status,
    message: payload?.message ?? null,
    data: dataMetadata,
  };

  return {
    url,
    httpStatus: response.status,
    statusCode: typeof payload?.statusCode === 'number' ? payload.statusCode : response.status,
    message: typeof payload?.message === 'string' ? payload.message : 'OK',
    results,
    count,
    pages,
    rawMetadata,
  };
}

export async function fetchAllTicketsIntoMemory(
  startDate: string = DEFAULT_START_DATE,
  endDate: string = DEFAULT_END_DATE
): Promise<InMemoryTicketsSession> {
  const cleanStart = (startDate || DEFAULT_START_DATE).trim();
  const cleanEnd = (endDate || DEFAULT_END_DATE).trim();
  const fetchKey = `${cleanStart}__${cleanEnd}`;

  if (activeFetchPromise && activeFetchKey === fetchKey) {
    return activeFetchPromise;
  }

  activeFetchKey = fetchKey;
  activeFetchPromise = (async () => {
    try {
      const allRecords: Record<string, any>[] = [];
      const seenKeys = new Set<string>();
      const pageLogs: PageProbeLog[] = [];

      let pagesFetched = 0;
      let duplicatesRemoved = 0;
      let apiReportedCount: number | null = null;
      let apiReportedPages: number | null = null;
      let statusCode: number | null = null;
      let statusMessage = 'Tickets Retrieved Successfully';
      let stopReason = '';
      let rawMetadataSample: Record<string, any> | null = null;

      const processPagePayload = (
        pageNum: number,
        pageData: Awaited<ReturnType<typeof fetchSinglePage>>
      ): number => {
        pagesFetched += 1;
        statusCode = pageData.statusCode;
        if (pageData.message) statusMessage = pageData.message;
        if (pageData.count !== null) apiReportedCount = pageData.count;
        if (pageData.pages !== null) apiReportedPages = pageData.pages;
        if (!rawMetadataSample) rawMetadataSample = pageData.rawMetadata;

        let uniqueAdded = 0;
        let duplicatesOnPage = 0;

        for (const item of pageData.results) {
          if (!item || typeof item !== 'object') continue;
          const uniqueKey =
            item.ticketId !== undefined && item.ticketId !== null
              ? `ticket_${String(item.ticketId)}`
              : `raw_${JSON.stringify(item)}`;

          if (!seenKeys.has(uniqueKey)) {
            seenKeys.add(uniqueKey);
            // Preserve every field returned by the API verbatim, and add standardizedProvider
            item.standardizedProvider = standardizeProvider(
              item.applicationProvider ?? item.provider
            );
            allRecords.push(item);
            uniqueAdded += 1;
          } else {
            duplicatesOnPage += 1;
            duplicatesRemoved += 1;
          }
        }

        pageLogs.push({
          page: pageNum,
          url: pageData.url,
          httpStatus: pageData.httpStatus,
          apiStatusCode: pageData.statusCode,
          resultsReturned: pageData.results.length,
          uniqueAdded,
          duplicatesSkipped: duplicatesOnPage,
          apiReportedCount: pageData.count,
          apiReportedPages: pageData.pages,
        });

        return uniqueAdded;
      };

      // Step 1: Fetch page 1 to inspect pagination metadata
      const page1Data = await fetchSinglePage(1, cleanStart, cleanEnd);
      const page1Added = processPagePayload(1, page1Data);

      if (page1Data.results.length === 0) {
        stopReason = 'Page 1 returned an empty results array (0 records match date range).';
      } else {
        // Step 2: If API reports multiple pages, fetch pages 2..apiReportedPages in parallel batches of 4
        const targetPages = apiReportedPages !== null && apiReportedPages > 1 ? apiReportedPages : 1;
        let nextPageToFetch = 2;

        while (nextPageToFetch <= targetPages) {
          const batchPages: number[] = [];
          for (let i = 0; i < 4 && nextPageToFetch <= targetPages; i++, nextPageToFetch++) {
            batchPages.push(nextPageToFetch);
          }

          const batchResponses = await Promise.all(
            batchPages.map(async (p) => ({
              page: p,
              data: await fetchSinglePage(p, cleanStart, cleanEnd),
            }))
          );

          let anyEmpty = false;
          for (const { page, data } of batchResponses) {
            const added = processPagePayload(page, data);
            if (data.results.length === 0 || added === 0) {
              anyEmpty = true;
            }
          }
          if (anyEmpty) break;
        }

        // Step 3: Probe subsequent page(s) until the API confirms no more records exist
        let probePage = nextPageToFetch;
        while (true) {
          // If API reported both count and pages and we already reached both, probe 1 extra page to verify empty array
          const alreadyReachedReportedTotal =
            apiReportedCount !== null &&
            allRecords.length >= apiReportedCount &&
            apiReportedPages !== null &&
            probePage > apiReportedPages;

          const probeData = await fetchSinglePage(probePage, cleanStart, cleanEnd);
          const added = processPagePayload(probePage, probeData);

          if (probeData.results.length === 0) {
            stopReason = `Verified page=${probePage} returned results: [] (all ${allRecords.length} of ${apiReportedCount ?? allRecords.length} API records retrieved across ${probePage - 1} data page(s)).`;
            break;
          }

          if (added === 0) {
            stopReason = `Stopped at page=${probePage} because all ${probeData.results.length} returned records were duplicates already in memory.`;
            break;
          }

          if (alreadyReachedReportedTotal && probeData.results.length === 0) {
            stopReason = `Reached API reported count (${apiReportedCount}) and verified page=${probePage} is empty.`;
            break;
          }

          probePage += 1;
        }
      }

      memorySession = {
        records: allRecords,
        fetchedAt: new Date().toISOString(),
        pagesFetched,
        duplicatesRemoved,
        apiReportedCount,
        apiReportedPages,
        statusCode,
        statusMessage,
        stopReason,
        appliedStartDate: cleanStart,
        appliedEndDate: cleanEnd,
        rawMetadataSample,
        pageLogs,
      };

      trySaveTicketsCache(memorySession);

      return memorySession;
    } finally {
      activeFetchPromise = null;
      activeFetchKey = null;
    }
  })();

  return activeFetchPromise;
}

function extractRecordDateYMD(rec: Record<string, any>): string | null {
  // Check createdAt (e.g. "2026-10-02T06:31:26.000Z") or applicationDate (e.g. "2026-10-02")
  const rawCreated = rec.createdAt ? String(rec.createdAt).trim() : '';
  if (rawCreated && /^\d{4}-\d{2}-\d{2}/.test(rawCreated)) {
    return rawCreated.slice(0, 10);
  }
  const rawAppDate = rec.applicationDate ? String(rec.applicationDate).trim() : '';
  if (rawAppDate && /^\d{4}-\d{2}-\d{2}/.test(rawAppDate)) {
    return rawAppDate.slice(0, 10);
  }
  return null;
}

function filterInMemoryRecords(
  records: Record<string, any>[],
  rawQuery: string,
  field: string,
  filterStartDate?: string,
  filterEndDate?: string
): Record<string, any>[] {
  const trimmed = rawQuery.trim();
  const cleanStart = filterStartDate?.trim() || '';
  const cleanEnd = filterEndDate?.trim() || '';
  const hasDateFilter =
    (cleanStart && cleanStart !== DEFAULT_START_DATE) ||
    (cleanEnd && cleanEnd !== DEFAULT_END_DATE);

  const queryLower = trimmed.toLowerCase().replace(/\s+/g, ' ');
  const queryDigits = trimmed.replace(/\D/g, '');
  const queryLast10 = queryDigits.length >= 10 ? queryDigits.slice(-10) : queryDigits;
  const ticketIdClean = trimmed.replace(/^(tck-|#|ticket\s*)/i, '').trim().toLowerCase();

  return records.filter((rec) => {
    // 1. Date limiter check (if active)
    if (hasDateFilter) {
      const recYmd = extractRecordDateYMD(rec);
      if (recYmd) {
        if (cleanStart && recYmd < cleanStart) return false;
        if (cleanEnd && recYmd > cleanEnd) return false;
      }
    }

    // 2. Search query check
    if (!trimmed) return true;

    const rawTicketId =
      rec.ticketId !== undefined && rec.ticketId !== null ? String(rec.ticketId).trim() : '';
    const rawCustomerName =
      rec.customerName !== undefined && rec.customerName !== null
        ? String(rec.customerName).trim()
        : '';
    const rawCustomerContact =
      rec.customerContact !== undefined && rec.customerContact !== null
        ? String(rec.customerContact).trim()
        : '';

    const normName = rawCustomerName.toLowerCase().replace(/\s+/g, ' ');
    const contactDigits = rawCustomerContact.replace(/\D/g, '');
    const contactLast10 = contactDigits.length >= 10 ? contactDigits.slice(-10) : contactDigits;

    if (field === 'phone') {
      if (queryDigits) {
        return (
          contactDigits.includes(queryDigits) ||
          (queryLast10.length === 10 && contactLast10 === queryLast10) ||
          rawCustomerContact.toLowerCase().includes(queryLower)
        );
      }
      return rawCustomerContact.toLowerCase().includes(queryLower);
    }

    if (field === 'name') {
      return (
        normName.includes(queryLower) ||
        rawCustomerName.toLowerCase().includes(trimmed.toLowerCase())
      );
    }

    if (field === 'ticketId') {
      return (
        rawTicketId.toLowerCase() === ticketIdClean ||
        rawTicketId.toLowerCase().includes(ticketIdClean) ||
        (queryDigits.length > 0 && rawTicketId.includes(queryDigits))
      );
    }

    const matchesPhone =
      (queryDigits.length > 0 &&
        (contactDigits.includes(queryDigits) ||
          (queryLast10.length === 10 && contactLast10 === queryLast10))) ||
      rawCustomerContact.toLowerCase().includes(queryLower);

    const matchesName =
      normName.includes(queryLower) ||
      rawCustomerName.toLowerCase().includes(trimmed.toLowerCase());

    const matchesTicketId =
      rawTicketId.toLowerCase() === ticketIdClean ||
      rawTicketId.toLowerCase().includes(ticketIdClean) ||
      (queryDigits.length > 0 && rawTicketId.includes(queryDigits));

    return matchesPhone || matchesName || matchesTicketId;
  });
}

// 1. Force-fetch / refresh all pages from the F2 Fintech API into memory (with optional startDate & endDate)
f2TicketsRouter.post('/f2-tickets/fetch', async (req: Request, res: Response) => {
  const startDate = (req.body?.startDate as string) || DEFAULT_START_DATE;
  const endDate = (req.body?.endDate as string) || DEFAULT_END_DATE;

  try {
    const session = await fetchAllTicketsIntoMemory(startDate, endDate);
    res.json({
      success: true,
      fetchedAt: session.fetchedAt,
      pagesFetched: session.pagesFetched,
      duplicatesRemoved: session.duplicatesRemoved,
      apiReportedCount: session.apiReportedCount,
      apiReportedPages: session.apiReportedPages,
      statusCode: session.statusCode,
      statusMessage: session.statusMessage,
      stopReason: session.stopReason,
      appliedStartDate: session.appliedStartDate,
      appliedEndDate: session.appliedEndDate,
      rawMetadataSample: session.rawMetadataSample,
      pageLogs: session.pageLogs,
      totalInMemory: session.records.length,
      matchedCount: session.records.length,
      records: session.records,
    });
  } catch (err: any) {
    res.status(502).json({
      success: false,
      error: err.message || 'Failed to fetch tickets from F2 Fintech API',
    });
  }
});

// 2. Search or list all records from the in-memory dataset (auto-fetches all 6,462+ records if memory is empty)
f2TicketsRouter.get('/f2-tickets', async (req: Request, res: Response) => {
  const query = ((req.query.q as string) || (req.query.query as string) || '').trim();
  const field = ((req.query.field as string) || 'all').trim();
  const startDate = ((req.query.startDate as string) || '').trim();
  const endDate = ((req.query.endDate as string) || '').trim();
  const forceRefresh = req.query.refresh === 'true';

  try {
    if (forceRefresh || memorySession.fetchedAt === null) {
      await fetchAllTicketsIntoMemory(
        startDate || DEFAULT_START_DATE,
        endDate || DEFAULT_END_DATE
      );
    }

    const matchedRecords = filterInMemoryRecords(
      memorySession.records,
      query,
      field,
      startDate || undefined,
      endDate || undefined
    );

    res.json({
      success: true,
      searchQuery: query,
      searchField: field,
      fetchedAt: memorySession.fetchedAt,
      pagesFetched: memorySession.pagesFetched,
      duplicatesRemoved: memorySession.duplicatesRemoved,
      apiReportedCount: memorySession.apiReportedCount,
      apiReportedPages: memorySession.apiReportedPages,
      statusCode: memorySession.statusCode,
      statusMessage: memorySession.statusMessage,
      stopReason: memorySession.stopReason,
      appliedStartDate: memorySession.appliedStartDate,
      appliedEndDate: memorySession.appliedEndDate,
      rawMetadataSample: memorySession.rawMetadataSample,
      pageLogs: memorySession.pageLogs,
      totalInMemory: memorySession.records.length,
      matchedCount: matchedRecords.length,
      records: matchedRecords,
    });
  } catch (err: any) {
    res.status(502).json({
      success: false,
      error: err.message || 'Failed to retrieve or search F2 Fintech tickets',
    });
  }
});

// 3. Fetch complete live ticket details and all uploaded documents for a specific ticket ID
// Calls https://admin.f2fintech.in/api/v1/get-ticket-with-detail/{TICKET_ID}
f2TicketsRouter.get('/f2-tickets/detail/:ticketId', async (req: Request, res: Response) => {
  const rawTicketId = String(req.params.ticketId || '').trim();
  const cleanTicketId = rawTicketId.replace(/^(f2fin-|tck-|#|ticket\s*)/i, '').trim();
  const forceRefresh = req.query.refresh === 'true';

  if (!cleanTicketId) {
    return res.status(400).json({
      success: false,
      error: 'A valid Ticket ID is required.',
    });
  }

  try {
    if (!forceRefresh && ticketDetailMemoryCache.has(cleanTicketId)) {
      const cached = ticketDetailMemoryCache.get(cleanTicketId)!;
      return res.json({
        success: true,
        cachedInMemory: true,
        ...cached,
      });
    }

    const endpointUrl = `${F2_TICKET_DETAIL_BASE_URL}/${encodeURIComponent(cleanTicketId)}`;
    const response = await fetch(endpointUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(45000),
    });

    const contentType = response.headers.get('content-type') || '';
    let payload: any = null;
    if (contentType.includes('application/json')) {
      payload = await response.json();
    } else {
      const text = await response.text();
      throw new Error(
        `F2 Fintech Detail API returned non-JSON response (HTTP ${response.status}): ${text.slice(0, 180)}`
      );
    }

    if (response.status === 404 || payload?.statusCode === 404) {
      return res.status(404).json({
        success: false,
        ticketId: cleanTicketId,
        endpointUrl,
        httpStatus: 404,
        statusCode: 404,
        error: payload?.message || `Ticket with ID ${cleanTicketId} does not exist.`,
        rawResponse: payload,
      });
    }

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        ticketId: cleanTicketId,
        endpointUrl,
        httpStatus: response.status,
        statusCode: payload?.statusCode ?? response.status,
        error:
          payload?.message ||
          payload?.error ||
          `F2 Fintech Detail API responded with HTTP ${response.status}`,
        rawResponse: payload,
      });
    }

    const detailData: Record<string, any> =
      payload?.data && typeof payload.data === 'object' ? payload.data : payload || {};

    if (detailData && typeof detailData === 'object') {
      detailData.standardizedProvider = standardizeProvider(
        detailData.applicationProvider ?? detailData.provider
      );
    }

    const docsArray = Array.isArray(detailData.customerDocuments)
      ? detailData.customerDocuments
      : [];

    const entry: TicketDetailSessionEntry = {
      ticketId: String(detailData.ticketId ?? cleanTicketId),
      fetchedAt: new Date().toISOString(),
      endpointUrl,
      httpStatus: response.status,
      statusCode: typeof payload?.statusCode === 'number' ? payload.statusCode : response.status,
      message:
        typeof payload?.message === 'string'
          ? payload.message
          : 'Ticket with Details retrieved successfully',
      data: detailData,
      documentsCount: docsArray.length,
    };

    ticketDetailMemoryCache.set(cleanTicketId, entry);

    return res.json({
      success: true,
      cachedInMemory: false,
      ...entry,
    });
  } catch (err: any) {
    return res.status(502).json({
      success: false,
      ticketId: cleanTicketId,
      error: err.message || `Failed to fetch ticket details for Ticket ID ${cleanTicketId}`,
    });
  }
});

// 4. Fetch complete live ticket activities & remarks history for a specific ticket ID
// Calls https://admin.f2fintech.in/api/v1/get-ticket-activities/{TICKET_ID}
f2TicketsRouter.get('/f2-tickets/activities/:ticketId', async (req: Request, res: Response) => {
  const rawTicketId = String(req.params.ticketId || '').trim();
  const cleanTicketId = rawTicketId.replace(/^(f2fin-|tck-|#|ticket\s*)/i, '').trim();

  if (!cleanTicketId) {
    return res.status(400).json({
      success: false,
      error: 'A valid Ticket ID is required.',
    });
  }

  const endpointUrl = `${F2_TICKET_ACTIVITIES_BASE_URL}/${encodeURIComponent(cleanTicketId)}`;

  try {
    const response = await fetch(endpointUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(45000),
    });

    const contentType = response.headers.get('content-type') || '';
    let payload: any = null;
    if (contentType.includes('application/json')) {
      payload = await response.json();
    } else {
      const text = await response.text();
      throw new Error(
        `F2 Fintech Activities API returned non-JSON response (HTTP ${response.status}): ${text.slice(0, 180)}`
      );
    }

    if (response.status === 404 || payload?.statusCode === 404) {
      return res.status(404).json({
        success: false,
        ticketId: cleanTicketId,
        endpointUrl,
        httpStatus: 404,
        statusCode: 404,
        error: payload?.message || `Activities for Ticket ID ${cleanTicketId} not found.`,
        activities: [],
      });
    }

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        ticketId: cleanTicketId,
        endpointUrl,
        httpStatus: response.status,
        statusCode: payload?.statusCode ?? response.status,
        error:
          payload?.message ||
          payload?.error ||
          `F2 Fintech Activities API responded with HTTP ${response.status}`,
        activities: [],
      });
    }

    const rawActivities: Record<string, any>[] = Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload?.activities)
      ? payload.activities
      : Array.isArray(payload)
      ? payload
      : [];

    // Sanitize sensitive password hash from nested user object while preserving all other fields verbatim
    const sanitizedActivities = rawActivities.map((act) => {
      if (!act || typeof act !== 'object') return act;
      if (act.user && typeof act.user === 'object') {
        const { password, ...safeUser } = act.user;
        return {
          ...act,
          user: safeUser,
        };
      }
      return act;
    });

    // Sort chronologically (newest first by default based on created_at / id)
    sanitizedActivities.sort((a, b) => {
      const tA = a?.created_at ? Date.parse(String(a.created_at)) : 0;
      const tB = b?.created_at ? Date.parse(String(b.created_at)) : 0;
      if (!isNaN(tA) && !isNaN(tB) && tA !== tB) {
        return tB - tA;
      }
      return (Number(b?.id) || 0) - (Number(a?.id) || 0);
    });

    return res.json({
      success: true,
      ticketId: cleanTicketId,
      fetchedAt: new Date().toISOString(),
      endpointUrl,
      httpStatus: response.status,
      statusCode: typeof payload?.statusCode === 'number' ? payload.statusCode : response.status,
      message:
        typeof payload?.message === 'string'
          ? payload.message
          : 'Ticket activities retrieved successfully',
      activitiesCount: sanitizedActivities.length,
      activities: sanitizedActivities,
    });
  } catch (err: any) {
    return res.status(502).json({
      success: false,
      ticketId: cleanTicketId,
      endpointUrl,
      error: err.message || `Failed to fetch ticket activities for Ticket ID ${cleanTicketId}`,
      activities: [],
    });
  }
});

// 5. Proxy document endpoint to bypass CORS and X-Frame-Options/iframe embedding restrictions for PDF & Image viewing
f2TicketsRouter.get(['/f2-tickets/proxy-document', '/proxy-document'], async (req: Request, res: Response) => {
  const targetUrl = String(req.query.url || '').trim();
  const isDownload = req.query.download === '1' || req.query.download === 'true';
  const customFileName = String(req.query.filename || '').trim();

  if (!targetUrl || !/^https?:\/\//i.test(targetUrl)) {
    return res.status(400).json({ error: 'A valid http(s) document URL is required.' });
  }

  try {
    const upstreamRes = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(60000),
    });

    if (!upstreamRes.ok) {
      return res.status(upstreamRes.status).json({
        error: `Upstream document server responded with status ${upstreamRes.status}`,
      });
    }

    const contentType = upstreamRes.headers.get('content-type') || 'application/pdf';
    const contentLength = upstreamRes.headers.get('content-length');

    res.setHeader('Content-Type', contentType);
    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('X-Frame-Options', 'ALLOWALL');
    res.setHeader('Content-Security-Policy', 'frame-ancestors *');

    let fileName = customFileName;
    if (!fileName) {
      const parts = targetUrl.split('?')[0].split('/');
      fileName = parts[parts.length - 1] || 'document.pdf';
    }

    if (isDownload) {
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    } else {
      res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
    }

    const arrayBuffer = await upstreamRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    return res.send(buffer);
  } catch (err: any) {
    console.error('Error proxying document:', err);
    return res.status(502).json({ error: err.message || 'Failed to fetch document from source.' });
  }
});

// 5b. Online Excel Sheet Parser endpoint: fetches spreadsheet from storage and returns parsed sheets/rows
f2TicketsRouter.get(['/f2-tickets/preview-sheet', '/preview-sheet'], async (req: Request, res: Response) => {
  const targetUrl = String(req.query.url || '').trim();
  const customFileName = String(req.query.filename || '').trim();

  if (!targetUrl || !/^https?:\/\//i.test(targetUrl)) {
    return res.status(400).json({ success: false, error: 'A valid http(s) sheet URL is required.' });
  }

  try {
    const upstreamRes = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(60000),
    });

    if (!upstreamRes.ok) {
      return res.status(upstreamRes.status).json({
        success: false,
        error: `Upstream storage server responded with status ${upstreamRes.status}`,
      });
    }

    const arrayBuffer = await upstreamRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });

    const sheetNames: string[] = workbook.SheetNames || [];
    const sheetsData: Record<
      string,
      {
        headers: string[];
        rows: any[][];
        totalRows: number;
        totalCols: number;
      }
    > = {};

    for (const sName of sheetNames) {
      const worksheet = workbook.Sheets[sName];
      if (!worksheet) continue;
      const rawRows: any[][] = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        defval: '',
        blankrows: false,
      });

      if (!rawRows || rawRows.length === 0) {
        sheetsData[sName] = { headers: [], rows: [], totalRows: 0, totalCols: 0 };
        continue;
      }

      // Find first non-empty row as headers
      let headerRowIdx = 0;
      for (let i = 0; i < Math.min(rawRows.length, 5); i++) {
        if (
          Array.isArray(rawRows[i]) &&
          rawRows[i].some((cell: any) => cell !== null && cell !== undefined && String(cell).trim() !== '')
        ) {
          headerRowIdx = i;
          break;
        }
      }

      const headerRow = rawRows[headerRowIdx] || [];
      const dataRows = rawRows.slice(headerRowIdx + 1);

      let maxCols = headerRow.length;
      for (const row of dataRows) {
        if (Array.isArray(row) && row.length > maxCols) {
          maxCols = row.length;
        }
      }
      maxCols = Math.max(maxCols, 1);

      const headers = Array.from({ length: maxCols }, (_, idx) => {
        const val = headerRow[idx];
        if (val !== null && val !== undefined && String(val).trim() !== '') {
          return String(val).trim();
        }
        let letter = '';
        let num = idx;
        while (num >= 0) {
          letter = String.fromCharCode((num % 26) + 65) + letter;
          num = Math.floor(num / 26) - 1;
        }
        return `Col ${letter}`;
      });

      const normalizedRows = dataRows.map((r: any[]) => {
        const rowArr = Array.isArray(r) ? r : [];
        const padded: any[] = [];
        for (let c = 0; c < maxCols; c++) {
          const cell = rowArr[c];
          if (cell === null || cell === undefined) {
            padded.push('');
          } else if (cell instanceof Date) {
            padded.push(cell.toLocaleDateString('en-GB'));
          } else {
            padded.push(String(cell));
          }
        }
        return padded;
      });

      sheetsData[sName] = {
        headers,
        rows: normalizedRows,
        totalRows: normalizedRows.length,
        totalCols: headers.length,
      };
    }

    let fileName = customFileName;
    if (!fileName) {
      const parts = targetUrl.split('?')[0].split('/');
      fileName = parts[parts.length - 1] || 'sheet.xlsx';
    }

    return res.json({
      success: true,
      fileName,
      sheetNames,
      sheets: sheetsData,
    });
  } catch (err: any) {
    console.error('Error previewing sheet:', err);
    return res.status(502).json({
      success: false,
      error: err.message || 'Failed to parse sheet from source.',
    });
  }
});

// Helper function to ensure live tickets dataset is populated in memory
export async function ensureTicketsLoaded(): Promise<void> {
  if (memorySession.records.length === 0) {
    const loaded = tryLoadTicketsCache();
    if (loaded && memorySession.records.length > 0) return;
  }
  if (memorySession.records.length === 0 && activeFetchPromise === null) {
    try {
      await fetchAllTicketsIntoMemory(DEFAULT_START_DATE, DEFAULT_END_DATE);
    } catch (e) {
      console.warn('Auto tickets pre-fetch warning:', e);
    }
  }
}

// Lender equivalence comparator: matches abbreviations (e.g. ABCL, ABFL, Aditya Birla Capital)
// with full forms (e.g. Aditya Birla Finance) and handles common variations
export function areLendersEquivalent(rawA: any, rawB: any): boolean {
  if (!rawA || !rawB) return false;
  const sA = String(rawA).trim().toLowerCase();
  const sB = String(rawB).trim().toLowerCase();
  if (!sA || !sB) return false;
  if (sA === sB) return true;

  // Standardized category comparison
  const stdA = standardizeProvider(rawA);
  const stdB = standardizeProvider(rawB);
  if (
    stdA !== 'No Provider Available' &&
    stdA !== 'Other / Unmapped' &&
    stdB !== 'No Provider Available' &&
    stdB !== 'Other / Unmapped' &&
    stdA === stdB
  ) {
    return true;
  }

  // Synonym & abbreviation groups
  const synonymGroups: string[][] = [
    // 1. Aditya Birla / ABCL / ABFL / Aditya Birla Capital / Aditya Birla Finance
    ['aditya birla', 'adityabirla', 'abcl', 'abfl', 'aditya', 'birla capital', 'abcl pl', 'abcl bl', 'abcl login'],
    // 2. Tata Capital / TCFL / TCFSL
    ['tata', 'tata capital', 'tcfl', 'tcfsl'],
    // 3. Cholamandalam / Chola
    ['chola', 'cholamandalam', 'chola finance', 'chola mandalam'],
    // 4. Bajaj Finance / BFL / Bajaj Finserv
    ['bajaj', 'bajaj finance', 'bajaj finserv', 'bfl', 'bajaj market'],
    // 5. L&T Finance / LNT
    ['l&t', 'lnt', 'lt finance', 'l & t', 'l and t'],
    // 6. Godrej Capital
    ['godrej', 'goderej', 'godrej capital'],
    // 7. Poonawalla Fincorp / Poonawala / Magma
    ['poonawalla', 'poonawala', 'poonawala fincorp', 'magma fincorp'],
    // 8. InCred
    ['incred', 'incred financial'],
    // 9. Shriram Finance / STFC / SCUF
    ['shriram', 'shriram finance', 'stfc', 'scuf'],
    // 10. SMFG India Credit / Fullerton
    ['smfg', 'fullerton', 'smfg india'],
    // 11. HDFC Bank / HDB
    ['hdfc', 'hdb', 'hdfc bank'],
    // 12. ICICI Bank
    ['icici', 'icici bank'],
    // 13. Axis Bank
    ['axis', 'axis bank'],
    // 14. IDFC FIRST Bank
    ['idfc', 'idfc first', 'idfc first bank'],
    // 15. Kotak Mahindra Bank
    ['kotak', 'kotak mahindra'],
    // 16. State Bank of India / SBI
    ['sbi', 'state bank of india', 'state bank'],
    // 17. Bank of Baroda / BOB
    ['bob', 'bank of baroda'],
    // 18. Bank of India / BOI
    ['boi', 'bank of india'],
    // 19. Punjab National Bank / PNB
    ['pnb', 'punjab national bank', 'punjab national'],
    // 20. Canara Bank
    ['canara', 'canara bank'],
    // 21. IndusInd Bank
    ['indusind', 'indus ind'],
    // 22. Piramal Finance / Piramal Capital
    ['piramal', 'piramal finance', 'piramal capital'],
    // 23. Hero Fincorp
    ['hero', 'hero fincorp', 'herofincorp'],
    // 24. IIFL Finance
    ['iifl', 'iifl finance', 'india infoline'],
    // 25. DMI Finance
    ['dmi', 'dmi finance'],
    // 26. Credit Saison
    ['credit saison', 'saison'],
    // 27. Lendingkart
    ['lendingkart', 'lending cart'],
    // 28. Paysense
    ['paysense'],
    // 29. YES Bank
    ['yes bank', 'yes'],
  ];

  for (const group of synonymGroups) {
    const inA = group.some((k) => sA.includes(k) || k.includes(sA));
    const inB = group.some((k) => sB.includes(k) || k.includes(sB));
    if (inA && inB) return true;
  }

  // Cross substring match
  if (sA.length >= 4 && sB.includes(sA)) return true;
  if (sB.length >= 4 && sA.includes(sB)) return true;

  return false;
}

// 6. Match a customer entry (phone, lender, name, ticketId, loanAmount) against live F2 tickets
// Phone and Lender are primary parameters (with full ABCL <-> Aditya Birla equivalence),
// along with Ticket ID and Name verification.
export function findMatchingLiveTicket(params: {
  phone?: string;
  lender?: string;
  name?: string;
  ticketId?: string;
  loanAmount?: string | number;
}): any | null {
  const records = memorySession.records;
  if (!records || records.length === 0) return null;

  const rawPhone = String(params.phone || '').trim();
  const rawLender = String(params.lender || '').trim();
  const rawName = String(params.name || '').trim();
  const rawTicketId = String(params.ticketId || '').trim();
  const rawLoanAmount = params.loanAmount !== undefined && params.loanAmount !== null ? String(params.loanAmount) : '';

  const cleanPhoneDigits = rawPhone.replace(/\D/g, '');
  const cleanPhoneLast10 = cleanPhoneDigits.length >= 10 ? cleanPhoneDigits.slice(-10) : cleanPhoneDigits;
  
  // Only accept real ticket IDs (exclude synthetic auto-generated IDs like TCK-123 or REC-ABC)
  const isSyntheticTicketId = /^(tck-|rec-)\d+$/i.test(rawTicketId);
  const cleanTicketId = !isSyntheticTicketId
    ? rawTicketId.replace(/^(f2fin-|tck-|#|ticket\s*)/i, '').trim().toLowerCase()
    : '';

  const inputCleanName = rawName
    .toLowerCase()
    .replace(/^(dr\.?|mr\.?|mrs\.?|ms\.?|prof\.?|shri\.?|smt\.?)\s+/i, '')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const cleanAmountNum = parseFloat(rawLoanAmount.replace(/[^0-9.]/g, ''));

  let bestMatch: {
    ticket: Record<string, any>;
    score: number;
    reasons: string[];
    matchedParams: any;
  } | null = null;

  for (const t of records) {
    let score = 0;
    const reasons: string[] = [];
    const matchedParams = {
      phoneMatched: false,
      lenderMatched: false,
      nameMatched: false,
      ticketIdMatched: false,
      amountMatched: false,
    };

    const tTicketId = String(t.ticketId ?? '').trim().toLowerCase();
    const tContactDigits = String(t.customerContact || '').replace(/\D/g, '');
    const tContactLast10 = tContactDigits.length >= 10 ? tContactDigits.slice(-10) : tContactDigits;
    const tLenderRaw = String(t.applicationProvider || t.provider || '').trim();
    const tLenderStandardized = String(t.standardizedProvider || standardizeProvider(tLenderRaw)).trim();
    const tName = String(t.customerName || '')
      .toLowerCase()
      .replace(/^(dr\.?|mr\.?|mrs\.?|ms\.?|prof\.?|shri\.?|smt\.?)\s+/i, '')
      .replace(/[^a-z0-9]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const tAmountNum = parseFloat(String(t.applicationAmount || '').replace(/[^0-9.]/g, ''));

    // Parameter 1: Phone number match (Primary Parameter)
    if (cleanPhoneLast10.length === 10 && tContactLast10.length === 10) {
      if (cleanPhoneLast10 === tContactLast10) {
        score += 60;
        matchedParams.phoneMatched = true;
        reasons.push(`Phone number (${cleanPhoneLast10})`);
      }
    } else if (cleanPhoneDigits.length >= 7 && tContactDigits.includes(cleanPhoneDigits)) {
      score += 40;
      matchedParams.phoneMatched = true;
      reasons.push(`Phone number partial (${cleanPhoneDigits})`);
    }

    // Parameter 2: Lender match (Primary Parameter, handles ABCL <-> Aditya Birla Finance equivalence)
    if (rawLender && rawLender !== '—' && rawLender !== '-') {
      if (areLendersEquivalent(rawLender, tLenderRaw) || areLendersEquivalent(rawLender, tLenderStandardized)) {
        score += 40;
        matchedParams.lenderMatched = true;
        const displayLabel =
          rawLender.toLowerCase() !== tLenderStandardized.toLowerCase() && rawLender.toLowerCase() !== tLenderRaw.toLowerCase()
            ? `${rawLender.toUpperCase()} ➔ ${tLenderStandardized}`
            : tLenderStandardized || tLenderRaw;
        reasons.push(`Lender match (${displayLabel})`);
      }
    }

    // Parameter 3: Direct Ticket ID match (in most cases common between systems)
    if (cleanTicketId && tTicketId) {
      if (tTicketId === cleanTicketId || cleanTicketId.includes(tTicketId)) {
        score += 75;
        matchedParams.ticketIdMatched = true;
        reasons.push(`Direct Ticket ID #${t.ticketId}`);
      }
    }

    // Parameter 4: Customer Name match
    if (inputCleanName.length >= 3 && tName.length >= 3) {
      if (inputCleanName === tName) {
        score += 25;
        matchedParams.nameMatched = true;
        reasons.push(`Customer name exact match`);
      } else if (inputCleanName.includes(tName) || tName.includes(inputCleanName)) {
        score += 20;
        matchedParams.nameMatched = true;
        reasons.push(`Customer name partial match`);
      } else {
        const inputWords = inputCleanName.split(' ').filter((w) => w.length >= 3);
        const tWords = tName.split(' ').filter((w) => w.length >= 3);
        const matchingWords = inputWords.filter((w) => tWords.includes(w));
        if (matchingWords.length >= 2) {
          score += 18;
          matchedParams.nameMatched = true;
          reasons.push(`Name keywords (${matchingWords.join(', ')})`);
        } else if (matchingWords.length === 1 && inputWords.length <= 2) {
          score += 10;
          matchedParams.nameMatched = true;
          reasons.push(`Name keyword (${matchingWords[0]})`);
        }
      }
    }

    // Parameter 5: Loan Amount match (Bonus parameter)
    if (!isNaN(cleanAmountNum) && cleanAmountNum > 0 && !isNaN(tAmountNum) && tAmountNum > 0) {
      if (Math.abs(cleanAmountNum - tAmountNum) < 100) {
        score += 15;
        matchedParams.amountMatched = true;
        reasons.push(`Loan amount match (₹${Number(tAmountNum).toLocaleString('en-IN')})`);
      }
    }

    // Qualifying rule as requested:
    // 1. Phone matched AND Lender matched (Primary combination, e.g. Phone + ABCL/Aditya Birla)
    // 2. Direct Ticket ID matched
    // 3. Phone matched AND (Ticket ID matched OR Name matched)
    // 4. Phone matched alone (when phone is primary parameter and no competing lender conflict)
    // 5. Lender matched AND Name matched
    const isPrimaryPhoneLenderMatch = matchedParams.phoneMatched && matchedParams.lenderMatched;
    const isDirectTicketMatch = matchedParams.ticketIdMatched;
    const isPhoneWithNameOrTicket = matchedParams.phoneMatched && (matchedParams.nameMatched || matchedParams.ticketIdMatched);
    const isPhoneAlone = matchedParams.phoneMatched && score >= 55;
    const isLenderAndName = matchedParams.lenderMatched && matchedParams.nameMatched;

    const isQualifyingMatch =
      isPrimaryPhoneLenderMatch ||
      isDirectTicketMatch ||
      isPhoneWithNameOrTicket ||
      isPhoneAlone ||
      isLenderAndName;

    if (isQualifyingMatch && score >= 50) {
      // Bonus boost for primary phone+lender match
      if (isPrimaryPhoneLenderMatch) {
        score += 20;
      }
      if (!bestMatch || score > bestMatch.score) {
        bestMatch = { ticket: t, score, reasons, matchedParams };
      }
    }
  }

  if (!bestMatch) return null;

  const t = bestMatch.ticket;
  const tid = t.ticketId ?? '';
  return {
    matched: true,
    ticketId: tid,
    formattedTicketId: `F2FIN-${tid}`,
    customerName: t.customerName || '',
    customerContact: t.customerContact || '',
    customerEmail: t.customerEmail || undefined,
    customerLocation: t.customerLocation || undefined,
    customerState: t.customerState || undefined,
    applicationAmount: t.applicationAmount || undefined,
    applicationProvider: t.applicationProvider || undefined,
    standardizedProvider: t.standardizedProvider || standardizeProvider(t.applicationProvider),
    lookupLender: rawLender || undefined,
    loanCategory: t.loanCategory || undefined,
    loanType: t.loanType || undefined,
    ticketStatus: t.ticketStatus || undefined,
    loanStatus: t.loanStatus || undefined,
    applicationDate: t.applicationDate || undefined,
    createdAt: t.createdAt || undefined,
    matchScore: bestMatch.score,
    matchReasons: bestMatch.reasons,
    matchedParameters: bestMatch.matchedParams,
  };
}

// Check single match endpoint
f2TicketsRouter.get('/f2-tickets/check-match', async (req: Request, res: Response) => {
  await ensureTicketsLoaded();
  const phone = String(req.query.phone || '').trim();
  const lender = String(req.query.lender || '').trim();
  const name = String(req.query.name || '').trim();
  const ticketId = String(req.query.ticketId || '').trim();
  const loanAmount = req.query.loanAmount as string;

  const match = findMatchingLiveTicket({ phone, lender, name, ticketId, loanAmount });
  return res.json({
    success: true,
    matched: Boolean(match),
    match: match || null,
  });
});

// Batch match endpoint
f2TicketsRouter.post('/f2-tickets/check-matches', async (req: Request, res: Response) => {
  await ensureTicketsLoaded();
  const records = Array.isArray(req.body?.records) ? req.body.records : [];
  const matches: Record<string, any> = {};

  for (const r of records) {
    const key = String(r.id ?? r.phoneNumber ?? '');
    if (!key) continue;
    const match = findMatchingLiveTicket({
      phone: r.phoneNumber || r.phone,
      lender: r.lenderName || r.lender,
      name: r.customerName || r.name,
      ticketId: r.ticketId,
      loanAmount: r.loanAmount || r.amount,
    });
    if (match) {
      matches[key] = match;
      if (r.id) matches[String(r.id)] = match;
      if (r.phoneNumber) matches[String(r.phoneNumber)] = match;
      const cleanP10 = String(r.phoneNumber || '').replace(/\D/g, '').slice(-10);
      if (cleanP10.length === 10) {
        matches[cleanP10] = match;
      }
    }
  }

  return res.json({
    success: true,
    matches,
  });
});




