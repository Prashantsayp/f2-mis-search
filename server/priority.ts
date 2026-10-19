import * as fs from 'fs';
import * as path from 'path';

export interface LeadPriorityRule {
  id: string;
  rank: number; // 1 = highest priority
  name: string;
  categoryKey: string;
  description: string;
  filePatterns: string[];
  folderPatterns: string[];
  neetYearOrder: 'desc' | 'asc'; // for NEET: desc = 23, 22, 20 etc. (higher year first)
  color: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
}

export const DEFAULT_PRIORITY_RULES: LeadPriorityRule[] = [
  {
    id: 'team_x',
    rank: 1,
    name: 'TEAM X',
    categoryKey: 'team_x',
    description: 'TEAM X workfile & directory (e.g. TEAM X IMG, TEAM X DENTAL)',
    filePatterns: ['TEAM X', 'TEAMX', 'TEAM_X'],
    folderPatterns: ['TEAM X', 'TEAMX', 'TEAM_X'],
    neetYearOrder: 'desc',
    color: '#8b5cf6',
    badgeBg: 'bg-violet-500/15',
    badgeText: 'text-violet-400',
    badgeBorder: 'border-violet-500/30',
  },
  {
    id: 'file_jan',
    rank: 2,
    name: 'Jan.xlsx',
    categoryKey: 'file_jan',
    description: 'Jan.xlsx workfile in DOCTORS / f2 Leads (P1 > P2 > P3 > P4 > P5)',
    filePatterns: ['Jan.xlsx', 'JAN.xlsx', 'Jan', 'JAN'],
    folderPatterns: ['f2 Leads', 'f2'],
    neetYearOrder: 'desc',
    color: '#10b981',
    badgeBg: 'bg-emerald-500/15',
    badgeText: 'text-emerald-400',
    badgeBorder: 'border-emerald-500/30',
  },
  {
    id: 'file_may',
    rank: 3,
    name: 'MAY.xlsx',
    categoryKey: 'file_may',
    description: 'MAY.xlsx workfile in DOCTORS / f2 Leads (P1 > P2 > P3 > P4 > P5)',
    filePatterns: ['MAY.xlsx', 'May.xlsx', 'MAY', 'May'],
    folderPatterns: ['f2 Leads', 'f2'],
    neetYearOrder: 'desc',
    color: '#059669',
    badgeBg: 'bg-emerald-500/15',
    badgeText: 'text-emerald-400',
    badgeBorder: 'border-emerald-500/30',
  },
  {
    id: 'neet',
    rank: 4,
    name: 'NEET.xlsx',
    categoryKey: 'neet',
    description: 'NEET.xlsx workfile in DOCTORS / Neet (ordered by year 23, 22, 20, 19, 15...)',
    filePatterns: ['NEET.xlsx', 'NEET'],
    folderPatterns: ['Neet'],
    neetYearOrder: 'desc',
    color: '#a855f7',
    badgeBg: 'bg-purple-500/15',
    badgeText: 'text-purple-400',
    badgeBorder: 'border-purple-500/30',
  },
  {
    id: 'fresh_data_21k',
    rank: 5,
    name: 'Fresh Data 21k.xlsx',
    categoryKey: 'fresh_data_21k',
    description: 'Fresh Data 21k.xlsx workfile in DOCTORS / Neet support data',
    filePatterns: ['Fresh Data 21k.xlsx', 'Fresh Data 21k', '21k'],
    folderPatterns: ['Neet support data', 'sample neet'],
    neetYearOrder: 'desc',
    color: '#06b6d4',
    badgeBg: 'bg-cyan-500/15',
    badgeText: 'text-cyan-400',
    badgeBorder: 'border-cyan-500/30',
  },
  {
    id: 'fresh_data_30k',
    rank: 6,
    name: 'Fresh Data 30k.xlsx',
    categoryKey: 'fresh_data_30k',
    description: 'Fresh Data 30k.xlsx workfile in DOCTORS / Neet support data',
    filePatterns: ['Fresh Data 30k.xlsx', 'Fresh Data 30k', '30k'],
    folderPatterns: ['Neet support data', 'sample neet'],
    neetYearOrder: 'desc',
    color: '#3b82f6',
    badgeBg: 'bg-blue-500/15',
    badgeText: 'text-blue-400',
    badgeBorder: 'border-blue-500/30',
  },
  {
    id: 'tata_points',
    rank: 7,
    name: 'Tata Points Main.xlsx',
    categoryKey: 'tata_points',
    description: 'Tata Points Main.xlsx workfile in DOCTORS / Tata Points',
    filePatterns: ['Tata Points Main.xlsx', 'Tata Points Main', 'Tata Points', 'Tata'],
    folderPatterns: ['Tata Points', 'Tata'],
    neetYearOrder: 'desc',
    color: '#eab308',
    badgeBg: 'bg-yellow-500/15',
    badgeText: 'text-yellow-400',
    badgeBorder: 'border-yellow-500/30',
  },
  {
    id: 'login',
    rank: 8,
    name: 'LOGIN.xlsx',
    categoryKey: 'login',
    description: 'LOGIN.xlsx workfile in DOCTORS / Login with month (Jan, May, June...)',
    filePatterns: ['LOGIN.xlsx', 'LOGIN'],
    folderPatterns: ['Login'],
    neetYearOrder: 'desc',
    color: '#f97316',
    badgeBg: 'bg-orange-500/15',
    badgeText: 'text-orange-400',
    badgeBorder: 'border-orange-500/30',
  },
  {
    id: 'icic_login',
    rank: 9,
    name: 'ICICI BANK LOGIN DATA Updated.xlsx',
    categoryKey: 'icic_login',
    description: 'ICICI BANK LOGIN DATA Updated.xlsx workfile in PL folder',
    filePatterns: ['ICICI BANK LOGIN DATA Updated.xlsx', 'ICICI BANK LOGIN DATA', 'ICICI', 'ICIC'],
    folderPatterns: ['PL', 'ICIC LOGIN', 'ICICI LOGIN', 'ICICI'],
    neetYearOrder: 'desc',
    color: '#ec4899',
    badgeBg: 'bg-pink-500/15',
    badgeText: 'text-pink-400',
    badgeBorder: 'border-pink-500/30',
  },
  {
    id: 'lot',
    rank: 10,
    name: 'LOT.xlsx',
    categoryKey: 'lot',
    description: 'LOT.xlsx workfile in DOCTORS / lot with lot number (Lot 1, Lot 2, Lot 3...)',
    filePatterns: ['LOT.xlsx', 'LOT'],
    folderPatterns: ['lot'],
    neetYearOrder: 'desc',
    color: '#f59e0b',
    badgeBg: 'bg-amber-500/15',
    badgeText: 'text-amber-400',
    badgeBorder: 'border-amber-500/30',
  },
  {
    id: 'directory',
    rank: 11,
    name: 'Consolidated Directories.xlsx',
    categoryKey: 'directory',
    description: 'Consolidated Directories.xlsx workfile in DOCTORS / Directory',
    filePatterns: ['Consolidated Directories.xlsx', 'Consolidated Directories', 'Directory'],
    folderPatterns: ['Directory', 'Consolidated Directories'],
    neetYearOrder: 'desc',
    color: '#94a3b8',
    badgeBg: 'bg-slate-500/15',
    badgeText: 'text-slate-400',
    badgeBorder: 'border-slate-500/30',
  },
  {
    id: 'file_bl',
    rank: 12,
    name: 'BL',
    categoryKey: 'bl',
    description: 'BL workfile in BL folder (Business Loan directory)',
    filePatterns: ['BL', 'BL.xlsx'],
    folderPatterns: ['BL'],
    neetYearOrder: 'desc',
    color: '#14b8a6',
    badgeBg: 'bg-teal-500/15',
    badgeText: 'text-teal-400',
    badgeBorder: 'border-teal-500/30',
  },
];

const CONFIG_DIR = './data/config';
const CONFIG_FILE = path.join(CONFIG_DIR, 'priority_rules.json');

/**
 * Checks if a name, path, or identifier belongs to an excluded category:
 * - MIS copy / Master MIS files or sheets
 * - Connected Google Sheets
 * - Internal cache files or session files
 * These must NEVER appear in the Main Directory priority rules list!
 */
export function isExcludedPriorityItem(nameOrId: string): boolean {
  if (!nameOrId) return true;
  const s = String(nameOrId).toLowerCase().trim();
  return (
    s === 'sample_neet' ||
    s === 'file_doctor_list' ||
    s === 'doctor_list' ||
    s.includes('mis copy') ||
    s.includes('master mis') ||
    s.includes('copy of master') ||
    s.startsWith('gsheet_') ||
    s.includes('google sheets mis') ||
    s.includes('f2_tickets') ||
    s.includes('session.json') ||
    s.includes('cache')
  );
}

export function isValidPriorityRule(r: LeadPriorityRule): boolean {
  if (!r) return false;
  if (isExcludedPriorityItem(r.id) || isExcludedPriorityItem(r.name) || isExcludedPriorityItem(r.categoryKey)) {
    return false;
  }
  if (r.description && isExcludedPriorityItem(r.description)) {
    return false;
  }
  return true;
}

export function loadPriorityRules(): LeadPriorityRule[] {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = fs.readFileSync(CONFIG_FILE, 'utf-8');
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const validRules = parsed
          .filter(isValidPriorityRule)
          .sort((a: any, b: any) => a.rank - b.rank)
          .map((r: any, idx: number) => {
            const item = { ...r, rank: idx + 1 };
            if (item.categoryKey === 'neet') {
              const order = item.neetYearOrder || 'desc';
              item.description =
                order === 'asc'
                  ? 'NEET.xlsx (ordered by year 15, 19, 20, 22, 23... - Older batches first)'
                  : 'NEET.xlsx (ordered by year 23, 22, 20, 19, 15... - Recent batches first)';
            } else if (item.categoryKey === 'login') {
              item.description = 'LOGIN.xlsx with month (e.g. Login Jan, Login May, Login June...)';
            } else if (item.categoryKey === 'lot') {
              item.description = 'LOT.xlsx with lot number (e.g. Lot 1, Lot 2, Lot 3, Lot 4)';
            }
            return item;
          });

        if (validRules.length !== parsed.length) {
          try {
            fs.writeFileSync(CONFIG_FILE, JSON.stringify(validRules, null, 2), 'utf-8');
          } catch (writeErr) {
            console.error('Failed to rewrite clean priority rules:', writeErr);
          }
        }
        return validRules;
      }
    }
  } catch (err) {
    console.error('Failed to load priority rules from file, using defaults:', err);
  }
  return [...DEFAULT_PRIORITY_RULES];
}

let activeRules: LeadPriorityRule[] = loadPriorityRules();

// Save custom rules
export function savePriorityRules(rules: LeadPriorityRule[]): LeadPriorityRule[] {
  try {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
    // Strictly filter out any excluded items (e.g. mis copy) and re-index ranks 1..N
    const sorted = [...rules]
      .filter(isValidPriorityRule)
      .sort((a, b) => a.rank - b.rank)
      .map((r, idx) => {
        const item = { ...r, rank: idx + 1 };
        if (item.categoryKey === 'neet') {
          const order = item.neetYearOrder || 'desc';
          item.description =
            order === 'asc'
              ? 'NEET.xlsx (ordered by year 15, 19, 20, 22, 23... - Older batches first)'
              : 'NEET.xlsx (ordered by year 23, 22, 20, 19, 15... - Recent batches first)';
        } else if (item.categoryKey === 'login') {
          item.description = 'LOGIN.xlsx with month (e.g. Login Jan, Login May, Login June...)';
        } else if (item.categoryKey === 'lot') {
          item.description = 'LOT.xlsx with lot number (e.g. Lot 1, Lot 2, Lot 3, Lot 4)';
        }
        return item;
      });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(sorted, null, 2), 'utf-8');
    activeRules = sorted;
    return activeRules;
  } catch (err) {
    console.error('Failed to save priority rules:', err);
    throw err;
  }
}

// Reset rules to default
export function resetPriorityRules(): LeadPriorityRule[] {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      fs.unlinkSync(CONFIG_FILE);
    }
  } catch (err) {}
  activeRules = [...DEFAULT_PRIORITY_RULES];
  return activeRules;
}

// Get current active rules
export function getPriorityRules(): LeadPriorityRule[] {
  activeRules = activeRules.filter(isValidPriorityRule);
  return activeRules;
}

const MIS_CONFIG_FILE = path.join(CONFIG_DIR, 'mis_priority_rules.json');
let activeMisRules: LeadPriorityRule[] | null = null;

// Get priority rules specifically for MIS Search Book
export function getMisPriorityRules(): LeadPriorityRule[] {
  if (activeMisRules) return activeMisRules.filter(isValidPriorityRule);
  try {
    if (fs.existsSync(MIS_CONFIG_FILE)) {
      const data = fs.readFileSync(MIS_CONFIG_FILE, 'utf-8');
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed) && parsed.length > 0) {
        activeMisRules = parsed.filter(isValidPriorityRule);
        return activeMisRules;
      }
    }
  } catch (err) {
    console.error('Failed to read MIS priority rules:', err);
  }
  // Default to global rules if MIS specific rules not yet customized
  return [...getPriorityRules().filter(isValidPriorityRule)];
}

// Save separate priority rules for MIS Search Book
export function saveMisPriorityRules(rules: LeadPriorityRule[]): LeadPriorityRule[] {
  try {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
    const sorted = [...rules]
      .filter(isValidPriorityRule)
      .sort((a, b) => a.rank - b.rank)
      .map((r, idx) => ({ ...r, rank: idx + 1 }));
    fs.writeFileSync(MIS_CONFIG_FILE, JSON.stringify(sorted, null, 2), 'utf-8');
    activeMisRules = sorted;
    return activeMisRules;
  } catch (err) {
    console.error('Failed to save MIS priority rules:', err);
    throw err;
  }
}

// Reset MIS priority rules to match current global rules
export function resetMisPriorityRules(): LeadPriorityRule[] {
  try {
    if (fs.existsSync(MIS_CONFIG_FILE)) {
      fs.unlinkSync(MIS_CONFIG_FILE);
    }
  } catch (err) {}
  activeMisRules = [...getPriorityRules()];
  return activeMisRules;
}

export interface CategoryTypeConfig {
  id: string;
  name: string;
  description?: string;
  fileOrFolderPattern: string;
  columnNames: string[];
  outputFormat: string;
  rank: number;
  color: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  isActive: boolean;
  isSystem?: boolean;
}

export const DEFAULT_CATEGORY_TYPES: CategoryTypeConfig[] = [
  {
    id: 'team_x',
    name: 'TEAM X',
    description: 'Extracts category (e.g. IMG, DENTAL, MDS) from CATEGORY/Section column in TEAM X directory/files',
    fileOrFolderPattern: 'TEAM X',
    columnNames: ['CATEGORY', 'Category', 'Section', 'cat', 'specialty', 'speciality', 'dept', 'lead category', 'category (mentioned in the sheet)'],
    outputFormat: 'TEAM X {val}',
    rank: 1,
    color: '#8b5cf6',
    badgeBg: 'bg-violet-500/15',
    badgeText: 'text-violet-400',
    badgeBorder: 'border-violet-500/30',
    isActive: true,
    isSystem: true,
  },
  {
    id: 'lot',
    name: 'LOT',
    description: 'Extracts lot number (e.g. Lot 1, Lot 2, Lot 3) from lot/lots column in LOT files',
    fileOrFolderPattern: 'LOT',
    columnNames: ['lot', 'lots', 'LOT', 'Lot', 'LOT NO', 'Lot No', 'lot_no'],
    outputFormat: 'Lot {val}',
    rank: 8,
    color: '#f59e0b',
    badgeBg: 'bg-amber-500/15',
    badgeText: 'text-amber-400',
    badgeBorder: 'border-amber-500/30',
    isActive: true,
    isSystem: true,
  },
  {
    id: 'login',
    name: 'LOGIN',
    description: 'Extracts month/year (e.g. Jan, May, 2026) from year/month/login column in LOGIN files',
    fileOrFolderPattern: 'LOGIN',
    columnNames: ['year', 'Year', 'month', 'Month', 'login', 'Login', 'LOGIN', 'Date'],
    outputFormat: 'Login {val}',
    rank: 6,
    color: '#f97316',
    badgeBg: 'bg-orange-500/15',
    badgeText: 'text-orange-400',
    badgeBorder: 'border-orange-500/30',
    isActive: true,
    isSystem: true,
  },
  {
    id: 'f2_leads',
    name: 'F2 Leads',
    description: 'Extracts P1, P2, P3, P4, P5 from category/priority column or sheet tabs in F2 Leads',
    fileOrFolderPattern: 'f2 Leads',
    columnNames: ['category', 'Category', 'priority', 'Priority', 'p', 'P', 'lead category'],
    outputFormat: 'F2 Leads {val}',
    rank: 2,
    color: '#10b981',
    badgeBg: 'bg-emerald-500/15',
    badgeText: 'text-emerald-400',
    badgeBorder: 'border-emerald-500/30',
    isActive: true,
    isSystem: true,
  },
  {
    id: 'neet',
    name: 'NEET',
    description: 'Extracts year (23, 22, 20, 19, 15...) from NEET batches in NEET files',
    fileOrFolderPattern: 'NEET',
    columnNames: ['year', 'Year', 'batch', 'Batch', 'neet year', 'YEAR'],
    outputFormat: 'NEET {val}',
    rank: 3,
    color: '#a855f7',
    badgeBg: 'bg-purple-500/15',
    badgeText: 'text-purple-400',
    badgeBorder: 'border-purple-500/30',
    isActive: true,
    isSystem: true,
  },
];

const CATEGORY_CONFIG_FILE = path.join(CONFIG_DIR, 'category_types.json');

export function loadCategoryTypes(): CategoryTypeConfig[] {
  try {
    if (fs.existsSync(CATEGORY_CONFIG_FILE)) {
      const data = fs.readFileSync(CATEGORY_CONFIG_FILE, 'utf-8');
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (err) {
    console.error('Failed to load category types from file, using defaults:', err);
  }
  return [...DEFAULT_CATEGORY_TYPES];
}

let activeCategoryTypes: CategoryTypeConfig[] = loadCategoryTypes();

export function saveCategoryTypes(types: CategoryTypeConfig[]): CategoryTypeConfig[] {
  try {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
    fs.writeFileSync(CATEGORY_CONFIG_FILE, JSON.stringify(types, null, 2), 'utf-8');
    activeCategoryTypes = types;
    return activeCategoryTypes;
  } catch (err) {
    console.error('Failed to save category types:', err);
    throw err;
  }
}

export function resetCategoryTypes(): CategoryTypeConfig[] {
  try {
    if (fs.existsSync(CATEGORY_CONFIG_FILE)) {
      fs.unlinkSync(CATEGORY_CONFIG_FILE);
    }
  } catch (err) {}
  activeCategoryTypes = [...DEFAULT_CATEGORY_TYPES];
  return activeCategoryTypes;
}

export function getCategoryTypes(): CategoryTypeConfig[] {
  return activeCategoryTypes;
}

export function addCategoryType(newType: Omit<CategoryTypeConfig, 'id'> & { id?: string }): CategoryTypeConfig[] {
  const id = newType.id || `custom_cat_${Date.now()}`;
  const existingIdx = activeCategoryTypes.findIndex(c => c.id === id);
  const entry: CategoryTypeConfig = {
    ...newType,
    id,
    isActive: newType.isActive !== undefined ? newType.isActive : true,
    isSystem: false,
  };
  if (existingIdx >= 0) {
    activeCategoryTypes[existingIdx] = entry;
  } else {
    activeCategoryTypes.push(entry);
  }
  return saveCategoryTypes(activeCategoryTypes);
}

export function deleteCategoryType(id: string): CategoryTypeConfig[] {
  activeCategoryTypes = activeCategoryTypes.filter(c => c.id !== id);
  return saveCategoryTypes(activeCategoryTypes);
}

export interface RecordPriorityEvaluation {
  ruleId: string;
  categoryName: string;
  priorityLabel: string;
  effectiveRank: number;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
}

/**
 * Extracts category from F2 Leads (e.g. P1, P2, P3, P4, P5)
 * Sources checked:
 * 1. Analysis f2Category if already computed
 * 2. rawRow column "category", "Category", "CATEGORY", "priority", "PRIORITY", "lead category", etc.
 * 3. sheetName (e.g. MAY.xlsx has sheets "P1", "P2", "P3", "P4")
 * 4. fileName
 */
export function extractF2Category(record: {
  fileName?: string;
  folderPath?: string;
  sheetName?: string;
  rawRow?: Record<string, any>;
  analysis?: { f2Category?: string };
}): string | null {
  if (record.analysis?.f2Category) {
    return record.analysis.f2Category;
  }

  // 1. Check rawRow
  if (record.rawRow && typeof record.rawRow === 'object') {
    const candidateKeys = [
      'category', 'Category', 'CATEGORY',
      'priority', 'Priority', 'PRIORITY',
      'lead category', 'Lead Category', 'LEAD CATEGORY',
      'lead_category', 'Lead_Category',
      'p', 'P'
    ];
    for (const key of candidateKeys) {
      if (record.rawRow[key] !== undefined && record.rawRow[key] !== null) {
        const val = String(record.rawRow[key]).trim();
        if (val) {
          const pMatch = val.match(/\b(P\s*\d+)\b/i);
          if (pMatch) {
            return pMatch[1].replace(/\s+/g, '').toUpperCase();
          }
          if (/^\d+$/.test(val)) {
            return `P${val}`;
          }
          if (/^P[A-Z0-9]+$/i.test(val)) {
            return val.toUpperCase();
          }
        }
      }
    }

    for (const [colName, val] of Object.entries(record.rawRow)) {
      if (!val) continue;
      const colLower = colName.toLowerCase().trim();
      if (colLower.includes('category') || colLower === 'priority') {
        const strVal = String(val).trim();
        const pMatch = strVal.match(/\b(P\s*\d+)\b/i);
        if (pMatch) {
          return pMatch[1].replace(/\s+/g, '').toUpperCase();
        }
        if (/^\d+$/.test(strVal)) {
          return `P${strVal}`;
        }
      }
    }
  }

  // 2. Check sheetName (e.g. MAY.xlsx has sheets P1, P2, P3, P4)
  if (record.sheetName) {
    const sTrim = record.sheetName.trim();
    const pMatch = sTrim.match(/\b(P\s*\d+)\b/i);
    if (pMatch) {
      return pMatch[1].replace(/\s+/g, '').toUpperCase();
    }
    if (/^\d+$/.test(sTrim)) {
      return `P${sTrim}`;
    }
  }

  // 3. Check fileName
  if (record.fileName) {
    const pMatch = record.fileName.match(/\b(P\s*\d+)\b/i);
    if (pMatch) {
      return pMatch[1].replace(/\s+/g, '').toUpperCase();
    }
  }

  return null;
}

/**
 * Extract category for TEAM X directory / files.
 * Looks in:
 * 1. rawRow['CATEGORY'] or columns matching category/section (e.g. IMG, DENTAL, MDS)
 * 2. sheetName (e.g. IMG, Dental, MDS)
 * 3. fileName
 */
export function extractTeamXCategory(record: {
  fileName?: string;
  folderPath?: string;
  sheetName?: string;
  rawRow?: Record<string, any>;
}): string | null {
  // 1. Check rawRow for category column or section
  if (record.rawRow && typeof record.rawRow === 'object') {
    const candidateKeys = [
      'category', 'Category', 'CATEGORY',
      'section', 'Section', 'SECTION',
      'cat', 'Cat', 'CAT',
      'lead category', 'Lead Category', 'LEAD CATEGORY',
      'specialty', 'Specialty', 'SPECIALTY',
      'speciality', 'Speciality', 'SPECIALITY',
      'dept', 'Dept', 'DEPT',
      'department', 'Department',
      'stream', 'Stream', 'STREAM',
      'group', 'Group', 'GROUP',
      'type', 'Type', 'TYPE',
      'team x category', 'Team X Category', 'TEAM X CATEGORY',
      'category (mentioned in the sheet)', 'Category (mentioned in the sheet)'
    ];
    for (const key of candidateKeys) {
      if (record.rawRow[key] !== undefined && record.rawRow[key] !== null) {
        const val = String(record.rawRow[key]).trim();
        if (val && val !== '-' && val !== '—') {
          const cleanVal = val.replace(/^team[\s_-]*x[\s:-]*/i, '').trim();
          return (cleanVal || val).toUpperCase();
        }
      }
    }

    // Check all keys containing 'category' or 'section'
    for (const [colName, val] of Object.entries(record.rawRow)) {
      if (!val) continue;
      const colLower = colName.toLowerCase().trim();
      if (colLower.includes('category') || colLower.includes('section')) {
        const strVal = String(val).trim();
        if (strVal && strVal !== '-' && strVal !== '—') {
          const cleanVal = strVal.replace(/^team[\s_-]*x[\s:-]*/i, '').trim();
          return (cleanVal || strVal).toUpperCase();
        }
      }
    }
  }

  // 2. Check sheetName (e.g. IMG, Dental, MDS, or "TEAM X IMG")
  if (record.sheetName) {
    const sTrim = record.sheetName.trim();
    if (!/^sheet\s*\d+$/i.test(sTrim) && sTrim.length > 0) {
      const clean = sTrim.replace(/^team[\s_-]*x[\s:-]*/i, '').trim();
      if (clean) {
        return clean.toUpperCase();
      }
    }
  }

  // 3. Check fileName
  if (record.fileName) {
    const fTrim = record.fileName.replace(/\.xlsx?$|\.xlsm?$/i, '').trim();
    const clean = fTrim.replace(/^team[\s_-]*x[\s:-]*/i, '').trim();
    if (clean && !/^team[\s_-]*x$/i.test(fTrim)) {
      return clean.toUpperCase();
    }
  }

  return null;
}

/**
 * Format sheet name for TEAM X directory / files.
 * If category is present (e.g. IMG), returns "TEAM X IMG".
 */
export function formatTeamXSheetName(
  sheetName: string | undefined,
  fileName?: string,
  folderPath?: string,
  rawRow?: Record<string, any>
): string {
  const sName = (sheetName || 'Sheet1').trim();
  const fName = String(fileName || '').toUpperCase();
  const fPath = String(folderPath || '').toUpperCase();

  if (fName.includes('MIS COPY') || fPath === 'GOOGLE SHEETS MIS' || fName.startsWith('GSHEET_')) {
    return sName;
  }

  // Check custom category types
  const customCatTypes = getCategoryTypes().filter(c => c.isActive && !c.isSystem);
  for (const catType of customCatTypes) {
    const patUpper = (catType.fileOrFolderPattern || '').toUpperCase().trim();
    const isMatch =
      patUpper === '*' ||
      (patUpper && (fPath.includes(patUpper) || fName.includes(patUpper) || sName.toUpperCase().includes(patUpper)));

    if (isMatch && rawRow && typeof rawRow === 'object') {
      let extractedVal = '';
      for (const colName of catType.columnNames) {
        if (rawRow[colName] !== undefined && rawRow[colName] !== null) {
          const v = String(rawRow[colName]).trim();
          if (v && v !== '-' && v !== '—') {
            extractedVal = v;
            break;
          }
        }
        const colLower = colName.toLowerCase().trim();
        for (const [k, v] of Object.entries(rawRow)) {
          if (!v) continue;
          if (k.toLowerCase().trim() === colLower || k.toLowerCase().replace(/[\s_\-]+/g, '') === colLower.replace(/[\s_\-]+/g, '')) {
            const strV = String(v).trim();
            if (strV && strV !== '-' && strV !== '—') {
              extractedVal = strV;
              break;
            }
          }
        }
        if (extractedVal) break;
      }

      if (extractedVal) {
        const cleanVal = extractedVal.replace(new RegExp(`^${catType.name}[\\s_:-]*`, 'i'), '').trim();
        const finalVal = cleanVal || extractedVal;
        const formatTpl = catType.outputFormat || `${catType.name} {val}`;
        return formatTpl.replace(/\{val\}|\{category\}|\{col\}/gi, finalVal).toUpperCase();
      }
    }
  }

  const isTx =
    fPath.includes('TEAM X') ||
    fPath.includes('TEAMX') ||
    fPath.includes('TEAM_X') ||
    fName.includes('TEAM X') ||
    fName.includes('TEAMX') ||
    fName.includes('TEAM_X') ||
    sName.toUpperCase().includes('TEAM X') ||
    (rawRow && Object.keys(rawRow).some(k => /team[\s_-]*x/i.test(k)));

  if (!isTx) return sName;

  const cat = extractTeamXCategory({ fileName, folderPath, sheetName, rawRow });
  if (cat) {
    return `TEAM X ${cat}`;
  }
  if (sName && !/^sheet\s*\d+$/i.test(sName)) {
    const clean = sName.replace(/^team[\s_-]*x[\s:-]*/i, '').trim();
    return `TEAM X ${clean || sName}`;
  }
  return 'TEAM X';
}

/**
 * Classifies a single matched record against priority rules.
 */
export function evaluateSingleRecordPriority(
  record: {
    fileName: string;
    folderPath?: string;
    sheetName?: string;
    analysis?: { neetVal?: string; loginVal?: string; lotVal?: string; f2Category?: string };
    rawRow?: Record<string, any>;
  },
  rules: LeadPriorityRule[] = activeRules
): RecordPriorityEvaluation {
  const fName = String(record.fileName || '').trim();
  const fUpper = fName.toUpperCase();
  const folder = String(record.folderPath || '').trim();
  const folderUpper = folder.toUpperCase();

  // Helper to find rule by categoryKey or id
  const getRule = (key: string): LeadPriorityRule => {
    return rules.find(r => r.categoryKey === key || r.id === key) || {
      id: key,
      rank: 99,
      name: key,
      categoryKey: key,
      description: '',
      filePatterns: [],
      folderPatterns: [],
      neetYearOrder: 'desc',
      color: '#94a3b8',
      badgeBg: 'bg-slate-500/15',
      badgeText: 'text-slate-400',
      badgeBorder: 'border-slate-500/30',
    };
  };

  // Check any active custom category type rules configured by user
  const customCatTypes = getCategoryTypes().filter(c => c.isActive && !c.isSystem);
  for (const catType of customCatTypes) {
    const patUpper = (catType.fileOrFolderPattern || '').toUpperCase().trim();
    const isMatch =
      patUpper === '*' ||
      (patUpper && (folderUpper.includes(patUpper) || fUpper.includes(patUpper) || (record.sheetName && record.sheetName.toUpperCase().includes(patUpper))));

    if (isMatch && record.rawRow && typeof record.rawRow === 'object') {
      let extractedVal = '';
      for (const colName of catType.columnNames) {
        if (record.rawRow[colName] !== undefined && record.rawRow[colName] !== null) {
          const v = String(record.rawRow[colName]).trim();
          if (v && v !== '-' && v !== '—') {
            extractedVal = v;
            break;
          }
        }
        const colLower = colName.toLowerCase().trim();
        for (const [k, v] of Object.entries(record.rawRow)) {
          if (!v) continue;
          if (k.toLowerCase().trim() === colLower || k.toLowerCase().replace(/[\s_\-]+/g, '') === colLower.replace(/[\s_\-]+/g, '')) {
            const strV = String(v).trim();
            if (strV && strV !== '-' && strV !== '—') {
              extractedVal = strV;
              break;
            }
          }
        }
        if (extractedVal) break;
      }

      if (extractedVal) {
        const cleanVal = extractedVal.replace(new RegExp(`^${catType.name}[\\s_:-]*`, 'i'), '').trim();
        const finalVal = cleanVal || extractedVal;
        const formatTpl = catType.outputFormat || `${catType.name} {val}`;
        const label = formatTpl.replace(/\{val\}|\{category\}|\{col\}/gi, finalVal).toUpperCase();
        return {
          ruleId: catType.id,
          categoryName: catType.name,
          priorityLabel: label,
          effectiveRank: catType.rank || 5,
          badgeBg: catType.badgeBg || 'bg-indigo-500/15',
          badgeText: catType.badgeText || 'text-indigo-400',
          badgeBorder: catType.badgeBorder || 'border-indigo-500/30',
        };
      }
    }
  }

  // 0. TEAM X (directory TEAM X, or file TEAM X)
  const isTeamX =
    folderUpper.includes('TEAM X') ||
    folderUpper.includes('TEAMX') ||
    folderUpper.includes('TEAM_X') ||
    fUpper.includes('TEAM X') ||
    fUpper.includes('TEAMX') ||
    fUpper.includes('TEAM_X') ||
    (record as any).folderId === '1f1smdvAA0UZGJZfbOPG0s1mxtRdV-Ok8';

  if (isTeamX) {
    const rule = getRule('team_x');
    const cat = extractTeamXCategory(record);
    const priorityLabel = cat ? `TEAM X ${cat}` : 'TEAM X';
    const categoryName = cat ? `TEAM X ${cat}` : (rule.name || 'TEAM X');

    return {
      ruleId: rule.id || 'team_x',
      categoryName,
      priorityLabel,
      effectiveRank: rule.rank || 1,
      badgeBg: rule.badgeBg || 'bg-violet-500/15',
      badgeText: rule.badgeText || 'text-violet-400',
      badgeBorder: rule.badgeBorder || 'border-violet-500/30',
    };
  }

  // 1. Fresh Data 21k (checked before generic sample neet)
  if (
    fUpper.includes('FRESH DATA 21K') ||
    fUpper.includes('21K')
  ) {
    const rule = getRule('fresh_data_21k');
    return {
      ruleId: rule.id,
      categoryName: rule.name,
      priorityLabel: 'Fresh Data 21k',
      effectiveRank: rule.rank,
      badgeBg: rule.badgeBg,
      badgeText: rule.badgeText,
      badgeBorder: rule.badgeBorder,
    };
  }

  // 2. Fresh Data 30k
  if (
    fUpper.includes('FRESH DATA 30K') ||
    fUpper.includes('30K')
  ) {
    const rule = getRule('fresh_data_30k');
    return {
      ruleId: rule.id,
      categoryName: rule.name,
      priorityLabel: 'Fresh Data 30k',
      effectiveRank: rule.rank,
      badgeBg: rule.badgeBg,
      badgeText: rule.badgeText,
      badgeBorder: rule.badgeBorder,
    };
  }

  // 3a. Jan.xlsx (in DOCTORS / f2 Leads)
  if (
    fUpper === 'JAN.XLSX' ||
    fUpper === 'JAN' ||
    fUpper.startsWith('JAN.')
  ) {
    const rule = getRule('file_jan') || getRule('f2_leads');
    const f2Cat = extractF2Category(record);
    const priorityLabel = f2Cat ? `Jan ${f2Cat}` : 'Jan.xlsx';
    const categoryName = f2Cat ? `Jan ${f2Cat}` : (rule.name || 'Jan.xlsx');
    let catOffset = 0.50;
    if (f2Cat) {
      const pNumMatch = f2Cat.match(/\d+/);
      if (pNumMatch) {
        const pNum = parseInt(pNumMatch[0], 10);
        catOffset = Math.min(0.49, pNum * 0.01);
      }
    }
    return {
      ruleId: rule.id || 'file_jan',
      categoryName,
      priorityLabel,
      effectiveRank: (rule.rank || 2) + catOffset,
      badgeBg: rule.badgeBg || 'bg-emerald-500/15',
      badgeText: rule.badgeText || 'text-emerald-400',
      badgeBorder: rule.badgeBorder || 'border-emerald-500/30',
    };
  }

  // 3b. MAY.xlsx (in DOCTORS / f2 Leads)
  if (
    fUpper === 'MAY.XLSX' ||
    fUpper === 'MAY' ||
    fUpper.startsWith('MAY.')
  ) {
    const rule = getRule('file_may') || getRule('f2_leads');
    const f2Cat = extractF2Category(record);
    const priorityLabel = f2Cat ? `May ${f2Cat}` : 'MAY.xlsx';
    const categoryName = f2Cat ? `May ${f2Cat}` : (rule.name || 'MAY.xlsx');
    let catOffset = 0.50;
    if (f2Cat) {
      const pNumMatch = f2Cat.match(/\d+/);
      if (pNumMatch) {
        const pNum = parseInt(pNumMatch[0], 10);
        catOffset = Math.min(0.49, pNum * 0.01);
      }
    }
    return {
      ruleId: rule.id || 'file_may',
      categoryName,
      priorityLabel,
      effectiveRank: (rule.rank || 3) + catOffset,
      badgeBg: rule.badgeBg || 'bg-emerald-500/15',
      badgeText: rule.badgeText || 'text-emerald-400',
      badgeBorder: rule.badgeBorder || 'border-emerald-500/30',
    };
  }

  // 3c. F2 Leads generic (folder f2 Leads)
  if (
    folderUpper.includes('F2 LEADS') ||
    folderUpper.includes('F2') ||
    fUpper.includes('F2 LEADS')
  ) {
    const rule = getRule('file_jan') || getRule('f2_leads');
    const f2Cat = extractF2Category(record);
    const priorityLabel = f2Cat ? `F2 Leads ${f2Cat}` : 'F2 Leads';
    const categoryName = f2Cat ? `F2 Leads ${f2Cat}` : rule.name;
    let catOffset = 0.50;
    if (f2Cat) {
      const pNumMatch = f2Cat.match(/\d+/);
      if (pNumMatch) {
        const pNum = parseInt(pNumMatch[0], 10);
        catOffset = Math.min(0.49, pNum * 0.01);
      }
    }
    return {
      ruleId: rule.id,
      categoryName,
      priorityLabel,
      effectiveRank: (rule.rank || 2) + catOffset,
      badgeBg: rule.badgeBg,
      badgeText: rule.badgeText,
      badgeBorder: rule.badgeBorder,
    };
  }

  // 4. NEET (Exact NEET.xlsx or NEET folder)
  if (
    fUpper === 'NEET.XLSX' ||
    fUpper.startsWith('NEET.') ||
    folderUpper === 'NEET'
  ) {
    const rule = getRule('neet');
    // Extract year from analysis, rawRow, or sheetName (e.g. 20, 22, 23, 2015, 2020, 2022, 2023)
    let yearNum = 0;
    let yearStr = '';
    if (record.analysis?.neetVal) {
      const match = record.analysis.neetVal.match(/\b(20\d\d|19\d\d|[12]\d)\b/);
      if (match) {
        let y = parseInt(match[1], 10);
        if (y < 100) y = 2000 + y;
        yearNum = y;
        yearStr = match[1];
      }
    }
    if (!yearNum && record.rawRow) {
      for (const key of ['Year', 'year', 'YEAR', 'Batch', 'batch', 'Passing Year', 'neet']) {
        const val = record.rawRow[key];
        if (val !== undefined && val !== null && String(val).trim()) {
          const match = String(val).match(/\b(20\d\d|19\d\d|[12]\d)\b/);
          if (match) {
            let y = parseInt(match[1], 10);
            if (y < 100) y = 2000 + y;
            yearNum = y;
            yearStr = match[1];
            break;
          }
        }
      }
    }
    if (!yearNum && record.sheetName) {
      const match = record.sheetName.match(/\b(20\d\d|19\d\d|[12]\d)\b/);
      if (match) {
        let y = parseInt(match[1], 10);
        if (y < 100) y = 2000 + y;
        yearNum = y;
        yearStr = match[1];
      }
    }

    // Determine tie-breaker rank for NEET years
    // asc: earlier years have lower rank number (e.g. 2015 -> 0.15, 2020 -> 0.20, 2023 -> 0.23) -> 2015 wins over 2023
    // desc: recent years have lower rank number (e.g. 2025 -> 0.10, 2023 -> 0.12, 2020 -> 0.15) -> 2023 wins over 2020
    const order = rule.neetYearOrder || 'desc';
    let yearOffset = 0.50;
    if (yearNum > 0) {
      const boundedYear = Math.max(2000, Math.min(2035, yearNum));
      if (order === 'asc') {
        // Ascending: earlier year gets lower rank offset -> higher priority
        yearOffset = (boundedYear - 2000) * 0.01;
      } else {
        // Descending: recent year gets lower rank offset -> higher priority
        yearOffset = (2035 - boundedYear) * 0.01;
      }
    }

    const shortYear = yearNum >= 2000 && yearNum < 2100 ? String(yearNum).slice(-2) : (yearStr || '');
    const priorityLabel = shortYear ? `NEET ${shortYear}` : 'NEET';

    return {
      ruleId: rule.id,
      categoryName: rule.name,
      priorityLabel,
      effectiveRank: rule.rank + Math.max(0.01, Math.min(0.99, yearOffset)),
      badgeBg: rule.badgeBg,
      badgeText: rule.badgeText,
      badgeBorder: rule.badgeBorder,
    };
  }

  // 5. Tata Points
  if (
    folderUpper.includes('TATA') ||
    fUpper.includes('TATA')
  ) {
    const rule = getRule('tata_points');
    return {
      ruleId: rule.id,
      categoryName: rule.name,
      priorityLabel: 'Tata Points',
      effectiveRank: rule.rank,
      badgeBg: rule.badgeBg,
      badgeText: rule.badgeText,
      badgeBorder: rule.badgeBorder,
    };
  }

  // 6. ICIC LOGIN (must check before generic login)
  if (
    folderUpper.includes('ICIC') ||
    fUpper.includes('ICICI') ||
    fUpper.includes('ICIC')
  ) {
    const rule = getRule('icic_login');
    return {
      ruleId: rule.id,
      categoryName: rule.name,
      priorityLabel: 'ICIC LOGIN',
      effectiveRank: rule.rank,
      badgeBg: rule.badgeBg,
      badgeText: rule.badgeText,
      badgeBorder: rule.badgeBorder,
    };
  }

  // 7. Login (Exact LOGIN.xlsx or Login folder, not ICICI)
  if (
    fUpper === 'LOGIN.XLSX' ||
    fUpper.startsWith('LOGIN.') ||
    folderUpper === 'LOGIN'
  ) {
    const rule = getRule('login');
    let monthStr = '';
    if (record.analysis?.loginVal) {
      const clean = record.analysis.loginVal.replace(/^login[\s-]*/i, '').trim();
      if (clean) monthStr = clean;
    }
    if (!monthStr && record.rawRow) {
      for (const key of ['Login', 'login', 'LOGIN', 'Month', 'month', 'MONTH']) {
        const val = record.rawRow[key];
        if (val !== undefined && val !== null && String(val).trim()) {
          const clean = String(val).replace(/^login[\s-]*/i, '').trim();
          if (clean) {
            monthStr = clean;
            break;
          }
        }
      }
    }
    if (!monthStr && record.sheetName) {
      const match = record.sheetName.match(/\b(Jan|Feb|Mar|March|Apr|April|May|Jun|June|Jul|July|Aug|August|Sep|Sept|September|Oct|October|Nov|November|Dec|December)\b/i);
      if (match) {
        monthStr = match[1];
      }
    }

    if (monthStr) {
      monthStr = monthStr.charAt(0).toUpperCase() + monthStr.slice(1);
    }

    const monthMap: Record<string, number> = {
      jan: 1, feb: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6,
      june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9,
      september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12
    };
    const mNum = monthStr ? monthMap[monthStr.toLowerCase()] : 0;
    const monthOffset = mNum > 0 ? ((13 - mNum) * 0.01) : 0.05;

    const priorityLabel = monthStr ? `Login ${monthStr}` : 'Login';
    return {
      ruleId: rule.id,
      categoryName: rule.name,
      priorityLabel,
      effectiveRank: rule.rank + monthOffset,
      badgeBg: rule.badgeBg,
      badgeText: rule.badgeText,
      badgeBorder: rule.badgeBorder,
    };
  }

  // 8. Lot
  if (
    fUpper === 'LOT.XLSX' ||
    fUpper.startsWith('LOT.') ||
    folderUpper === 'LOT'
  ) {
    const rule = getRule('lot');
    let lotStr = '';
    if (record.analysis?.lotVal) {
      const numMatch = record.analysis.lotVal.match(/\d+/);
      if (numMatch) {
        lotStr = numMatch[0];
      } else {
        const clean = record.analysis.lotVal.replace(/^lot[\s-]*/i, '').trim();
        if (clean) lotStr = clean;
      }
    }
    if (!lotStr && record.rawRow) {
      for (const key of ['lots', 'Lots', 'LOTS', 'lot', 'Lot', 'LOT']) {
        const val = record.rawRow[key];
        if (val !== undefined && val !== null && String(val).trim()) {
          const numMatch = String(val).match(/\d+/);
          if (numMatch) {
            lotStr = numMatch[0];
            break;
          } else {
            const clean = String(val).replace(/^lot[\s-]*/i, '').trim();
            if (clean) {
              lotStr = clean;
              break;
            }
          }
        }
      }
    }
    if (!lotStr && record.sheetName) {
      const numMatch = record.sheetName.match(/\b(?:lot[\s-]*)?(\d+)\b/i);
      if (numMatch) {
        lotStr = numMatch[1];
      }
    }

    const lotNum = parseInt(lotStr, 10);
    const lotOffset = !isNaN(lotNum) && lotNum > 0 ? (lotNum * 0.01) : 0.05;

    const priorityLabel = lotStr ? `Lot ${lotStr}` : 'Lot';
    return {
      ruleId: rule.id,
      categoryName: rule.name,
      priorityLabel,
      effectiveRank: rule.rank + lotOffset,
      badgeBg: rule.badgeBg,
      badgeText: rule.badgeText,
      badgeBorder: rule.badgeBorder,
    };
  }

  // 9. DIRECTORY
  if (
    folderUpper.includes('DIRECTORY') ||
    fUpper.includes('DIRECTORY') ||
    fUpper.includes('CONSOLIDATED')
  ) {
    const rule = getRule('directory');
    return {
      ruleId: rule.id,
      categoryName: rule.name,
      priorityLabel: 'DIRECTORY',
      effectiveRank: rule.rank,
      badgeBg: rule.badgeBg,
      badgeText: rule.badgeText,
      badgeBorder: rule.badgeBorder,
    };
  }

  // 10. BL (Workfile BL in BL directory)
  if (
    fUpper === 'BL' ||
    fUpper === 'BL.XLSX' ||
    fUpper.startsWith('BL.') ||
    folderUpper === 'BL'
  ) {
    const rule = getRule('file_bl') || getRule('dir_bl') || getRule('bl');
    return {
      ruleId: rule.id || 'file_bl',
      categoryName: rule.name || 'BL',
      priorityLabel: 'BL',
      effectiveRank: rule.rank || 12,
      badgeBg: rule.badgeBg || 'bg-teal-500/15',
      badgeText: rule.badgeText || 'text-teal-400',
      badgeBorder: rule.badgeBorder || 'border-teal-500/30',
    };
  }

  // Dynamic rule matching for any custom directories, files, or sheets added to priority rules
  for (const rule of rules) {
    if (rule.id === 'default' || rule.id === 'custom') continue;
    const matchFolder = rule.folderPatterns && rule.folderPatterns.length > 0 &&
      rule.folderPatterns.some((p: string) => {
        const pUp = p.toUpperCase().trim();
        return pUp && (folderUpper === pUp || folderUpper.includes(pUp) || pUp.includes(folderUpper));
      });
    const matchFile = rule.filePatterns && rule.filePatterns.length > 0 &&
      rule.filePatterns.some((p: string) => {
        const pUp = p.toUpperCase().trim();
        return pUp && (fUpper === pUp || fUpper.includes(pUp) || fUpper.replace(/\.XLSX?$|\.XLSM?$/i, '').includes(pUp));
      });

    if (matchFolder || matchFile) {
      return {
        ruleId: rule.id,
        categoryName: rule.name,
        priorityLabel: rule.name,
        effectiveRank: rule.rank,
        badgeBg: rule.badgeBg || 'bg-slate-500/15',
        badgeText: rule.badgeText || 'text-slate-400',
        badgeBorder: rule.badgeBorder || 'border-slate-500/30',
      };
    }
  }

  // Fallback for any other file
  const baseName = fName.replace(/\.xlsx?$|\.xlsm?$/i, '') || 'Other';
  return {
    ruleId: 'custom',
    categoryName: baseName,
    priorityLabel: baseName,
    effectiveRank: 50,
    badgeBg: 'bg-slate-500/15',
    badgeText: 'text-slate-400',
    badgeBorder: 'border-slate-500/30',
  };
}

/**
 * Determine the overall highest priority for a phone that may appear in multiple records/sheets.
 * Example: if present in Lot (rank 8), Login (rank 6), and Fresh Data 21k (rank 3),
 * this selects Fresh Data 21k (lowest effectiveRank number).
 */
export function determineLeadPriority(
  matchedRecords: {
    fileName: string;
    folderPath?: string;
    sheetName?: string;
    analysis?: { neetVal?: string; loginVal?: string; lotVal?: string };
    rawRow?: Record<string, any>;
  }[],
  rules: LeadPriorityRule[] = activeRules
): {
  priority: string;
  categoryName: string;
  ruleId: string;
  rank: number;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  matchingFiles: string[];
  matchingCategories: string[];
} {
  // Filter out any MIS COPY or connected customer sheets from priority evaluation!
  const validRecords = (matchedRecords || []).filter(r => {
    const fUpper = (r.fileName || '').toUpperCase();
    const pUpper = (r.folderPath || '').toUpperCase();
    return fUpper !== 'MIS COPY' && !fUpper.startsWith('GSHEET_') && pUpper !== 'GOOGLE SHEETS MIS';
  });

  if (validRecords.length === 0) {
    return {
      priority: '—',
      categoryName: 'Not Found',
      ruleId: 'none',
      rank: 999,
      badgeBg: 'bg-slate-800/50',
      badgeText: 'text-slate-500',
      badgeBorder: 'border-slate-800',
      matchingFiles: [],
      matchingCategories: [],
    };
  }

  let bestEval: RecordPriorityEvaluation | null = null;
  const matchingFilesSet = new Set<string>();
  const matchingCategoriesSet = new Set<string>();

  for (const record of validRecords) {
    if (record.fileName) matchingFilesSet.add(record.fileName);
    const evaluation = evaluateSingleRecordPriority(record, rules);
    if (evaluation.categoryName) matchingCategoriesSet.add(evaluation.categoryName);
    if (!bestEval || evaluation.effectiveRank < bestEval.effectiveRank) {
      bestEval = evaluation;
    }
  }

  return {
    priority: bestEval ? bestEval.priorityLabel : '—',
    categoryName: bestEval ? bestEval.categoryName : '—',
    ruleId: bestEval ? bestEval.ruleId : 'none',
    rank: bestEval ? Math.floor(bestEval.effectiveRank) : 999,
    badgeBg: bestEval ? bestEval.badgeBg : 'bg-slate-800/50',
    badgeText: bestEval ? bestEval.badgeText : 'text-slate-500',
    badgeBorder: bestEval ? bestEval.badgeBorder : 'border-slate-800',
    matchingFiles: Array.from(matchingFilesSet),
    matchingCategories: Array.from(matchingCategoriesSet),
  };
}

const DYNAMIC_PALETTE = [
  { color: '#0ea5e9', bg: 'bg-sky-500/15', text: 'text-sky-400', border: 'border-sky-500/30' },
  { color: '#8b5cf6', bg: 'bg-violet-500/15', text: 'text-violet-400', border: 'border-violet-500/30' },
  { color: '#ec4899', bg: 'bg-pink-500/15', text: 'text-pink-400', border: 'border-pink-500/30' },
  { color: '#f59e0b', bg: 'bg-amber-500/15', text: 'text-amber-400', border: 'border-amber-500/30' },
  { color: '#10b981', bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/30' },
  { color: '#06b6d4', bg: 'bg-cyan-500/15', text: 'text-cyan-400', border: 'border-cyan-500/30' },
  { color: '#6366f1', bg: 'bg-indigo-500/15', text: 'text-indigo-400', border: 'border-indigo-500/30' },
  { color: '#14b8a6', bg: 'bg-teal-500/15', text: 'text-teal-400', border: 'border-teal-500/30' },
  { color: '#d946ef', bg: 'bg-fuchsia-500/15', text: 'text-fuchsia-400', border: 'border-fuchsia-500/30' },
  { color: '#f97316', bg: 'bg-orange-500/15', text: 'text-orange-400', border: 'border-orange-500/30' },
];

/**
 * Dynamically synchronize active rules with all discovered directories and files.
 * If any directory or file in the system is not covered by existing rules, it gets appended
 * AT THE LAST of the priority list so users have full control.
 */
export function syncPriorityRulesWithDirectoriesAndFiles(
  directories: string[] = [],
  files: string[] = []
): { rules: LeadPriorityRule[]; addedCount: number; newlyAdded: string[] } {
  let changed = false;
  let addedCount = 0;
  const newlyAdded: string[] = [];

  // Filter out any stale rules or excluded items (e.g. mis copy, master mis, etc.)
  let currentRules = activeRules.filter(isValidPriorityRule);
  if (currentRules.length !== activeRules.length) {
    changed = true;
  }

  // 1. Synchronize Directories (Folders) - ONLY main directory folders
  for (const dirName of directories) {
    const dTrimmed = (dirName || '').trim();
    if (!dTrimmed || dTrimmed === '/' || dTrimmed.toLowerCase() === 'root' || dTrimmed.toLowerCase().includes('cache')) continue;
    if (isExcludedPriorityItem(dTrimmed)) continue;

    const cleanName = dTrimmed.replace(/^[\\/]+|[\\/]+$/g, '').split(/[\\/]/).pop() || dTrimmed;
    if (isExcludedPriorityItem(cleanName)) continue;
    const dUpper = cleanName.toUpperCase().trim();
    if (!dUpper) continue;

    const id = `dir_${cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;

    // Check if covered by any existing rule
    const isCovered = currentRules.some((r) => {
      if (r.id === id) return true;
      if (r.name.toUpperCase().trim() === dUpper) return true;
      // Core system rules matching
      if (r.id === 'directory') return dUpper === 'DIRECTORY' || dUpper === 'CONSOLIDATED DIRECTORIES';
      if (r.id === 'team_x') return dUpper === 'TEAM X' || dUpper === 'TEAMX' || dUpper === 'TEAM_X';
      if (r.id === 'f2_leads') return dUpper === 'F2 LEADS' || dUpper === 'F2';
      if (r.id === 'neet') return dUpper === 'NEET' || dUpper === 'NEET SUPPORT DATA';
      if (r.id === 'tata_points') return dUpper === 'TATA POINTS' || dUpper === 'TATA';
      if (r.id === 'icic_login') return dUpper.includes('ICIC');
      if (r.id === 'login') return dUpper === 'LOGIN' || dUpper === 'LOGIN DATA';
      if (r.id === 'lot') return dUpper === 'LOT';
      if (r.id === 'fresh_data_21k') return dUpper.includes('21K');
      if (r.id === 'fresh_data_30k') return dUpper.includes('30K');

      if (r.folderPatterns && r.folderPatterns.some((p) => p.toUpperCase().trim() === dUpper)) return true;
      return false;
    });

    if (!isCovered) {
      if (currentRules.some((r) => r.id === id)) continue;

      const style = DYNAMIC_PALETTE[currentRules.length % DYNAMIC_PALETTE.length];
      const newRule: LeadPriorityRule = {
        id,
        rank: currentRules.length + 1, // ALWAYS ADDED AT THE LAST
        name: cleanName,
        categoryKey: id,
        description: `Directory: ${cleanName}`,
        filePatterns: [cleanName],
        folderPatterns: [cleanName, dTrimmed],
        neetYearOrder: 'desc',
        color: style.color,
        badgeBg: style.bg,
        badgeText: style.text,
        badgeBorder: style.border,
      };
      currentRules.push(newRule);
      changed = true;
      addedCount++;
      newlyAdded.push(`Directory: ${cleanName}`);
    }
  }

  // 2. Synchronize Files - ONLY main directory files
  for (const fileName of files) {
    const fTrimmed = (fileName || '').trim();
    if (!fTrimmed || isExcludedPriorityItem(fTrimmed)) continue;

    const fUpper = fTrimmed.toUpperCase();
    if (fUpper.includes('MIS COPY') || fUpper.includes('MASTER MIS') || fUpper.startsWith('GSHEET_')) continue;

    const noExt = fUpper.replace(/\.XLSX?$|\.XLSM?$/i, '');
    if (isExcludedPriorityItem(noExt)) continue;

    const id = `file_${noExt.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
    const isCovered = currentRules.some((r) => {
      const rUp = r.name.toUpperCase().trim();
      const rId = (r.id || '').toUpperCase().trim();
      if (rUp === fUpper || rUp === noExt) return true;
      if (rId === id.toUpperCase() || rId === `FILE_${noExt.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`.toUpperCase()) return true;
      if (fUpper === 'JAN.XLSX' && (r.id === 'file_jan' || rUp === 'JAN.XLSX')) return true;
      if (fUpper === 'MAY.XLSX' && (r.id === 'file_may' || rUp === 'MAY.XLSX')) return true;
      if (fUpper === 'BL' && (r.id === 'file_bl' || rUp === 'BL')) return true;
      if (r.filePatterns && r.filePatterns.some((p) => {
        const pUp = p.toUpperCase().trim();
        return pUp === fUpper || pUp === noExt;
      })) return true;
      return false;
    });

    if (!isCovered) {
      const cleanName = fTrimmed;
      if (currentRules.some((r) => r.id === id || r.name.toUpperCase() === fUpper)) continue;

      const style = DYNAMIC_PALETTE[currentRules.length % DYNAMIC_PALETTE.length];
      const newRule: LeadPriorityRule = {
        id,
        rank: currentRules.length + 1, // ALWAYS ADDED AT THE LAST
        name: cleanName,
        categoryKey: id,
        description: `Workfile: ${cleanName}`,
        filePatterns: [fTrimmed, cleanName, noExt],
        folderPatterns: [],
        neetYearOrder: 'desc',
        color: style.color,
        badgeBg: style.bg,
        badgeText: style.text,
        badgeBorder: style.border,
      };
      currentRules.push(newRule);
      changed = true;
      addedCount++;
      newlyAdded.push(`Workfile: ${cleanName}`);
    }
  }

  if (changed) {
    currentRules = currentRules.filter(isValidPriorityRule).map((r, idx) => ({ ...r, rank: idx + 1 }));
    savePriorityRules(currentRules);
  }

  activeRules = currentRules;
  return { rules: activeRules, addedCount, newlyAdded };
}

/**
 * Synchronize MIS priority rules with all discovered directories, MIS sheets, and workbooks.
 * Any new sheet or directory not covered is automatically added AT THE LAST.
 */
export function syncMisPriorityRulesWithSources(
  directories: string[] = [],
  sheets: string[] = [],
  files: string[] = []
): { rules: LeadPriorityRule[]; addedCount: number; newlyAdded: string[] } {
  let changed = false;
  let addedCount = 0;
  const newlyAdded: string[] = [];

  let currentRules = getMisPriorityRules().filter(isValidPriorityRule);
  if (currentRules.length !== (activeMisRules || []).length) {
    changed = true;
  }

  // 1. Synchronize Directories
  for (const dirName of directories) {
    const dTrimmed = (dirName || '').trim();
    if (!dTrimmed || dTrimmed === '/' || dTrimmed.toLowerCase() === 'root' || dTrimmed.toLowerCase().includes('cache')) continue;
    if (isExcludedPriorityItem(dTrimmed)) continue;

    const cleanName = dTrimmed.replace(/^[\\/]+|[\\/]+$/g, '').split(/[\\/]/).pop() || dTrimmed;
    if (isExcludedPriorityItem(cleanName)) continue;
    const dUpper = cleanName.toUpperCase().trim();
    if (!dUpper) continue;

    const id = `mis_dir_${cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;

    const isCovered = currentRules.some((r) => {
      if (r.id === id) return true;
      if (r.name.toUpperCase().trim() === dUpper) return true;
      // Core system rules matching
      if (r.id === 'directory') return dUpper === 'DIRECTORY' || dUpper === 'CONSOLIDATED DIRECTORIES';
      if (r.id === 'team_x') return dUpper === 'TEAM X' || dUpper === 'TEAMX' || dUpper === 'TEAM_X';
      if (r.id === 'f2_leads') return dUpper === 'F2 LEADS' || dUpper === 'F2';
      if (r.id === 'neet') return dUpper === 'NEET' || dUpper === 'NEET SUPPORT DATA';
      if (r.id === 'tata_points') return dUpper === 'TATA POINTS' || dUpper === 'TATA';
      if (r.id === 'icic_login') return dUpper.includes('ICIC');
      if (r.id === 'login') return dUpper === 'LOGIN' || dUpper === 'LOGIN DATA';
      if (r.id === 'lot') return dUpper === 'LOT';
      if (r.id === 'fresh_data_21k') return dUpper.includes('21K');
      if (r.id === 'fresh_data_30k') return dUpper.includes('30K');

      if (r.folderPatterns && r.folderPatterns.some((p) => p.toUpperCase().trim() === dUpper)) return true;
      return false;
    });

    if (!isCovered) {
      if (currentRules.some((r) => r.id === id)) continue;

      const style = DYNAMIC_PALETTE[currentRules.length % DYNAMIC_PALETTE.length];
      const newRule: LeadPriorityRule = {
        id,
        rank: currentRules.length + 1, // ALWAYS AT THE LAST
        name: cleanName,
        categoryKey: id,
        description: `Directory: ${cleanName}`,
        filePatterns: [cleanName],
        folderPatterns: [cleanName, dTrimmed],
        neetYearOrder: 'desc',
        color: style.color,
        badgeBg: style.bg,
        badgeText: style.text,
        badgeBorder: style.border,
      };
      currentRules.push(newRule);
      changed = true;
      addedCount++;
      newlyAdded.push(`Directory: ${cleanName}`);
    }
  }

  // 2. Synchronize MIS Sheets
  for (const sheetName of sheets) {
    const sTrimmed = (sheetName || '').trim();
    if (isExcludedPriorityItem(sTrimmed)) continue;
    const sUpper = sTrimmed.toUpperCase();
    if (!sUpper || sUpper.startsWith('GSHEET_') || sUpper.includes('SUMMARY') || sUpper.includes('PIVOT') || sUpper.includes('MIS COPY')) continue;

    const isCovered = currentRules.some((r) => {
      if (r.name.toUpperCase().trim() === sUpper) return true;
      return (
        r.filePatterns &&
        r.filePatterns.some((p) => {
          const pUp = p.toUpperCase().trim();
          return sUpper.includes(pUp) || pUp.includes(sUpper);
        })
      );
    });

    if (!isCovered) {
      const id = `mis_sheet_${sTrimmed.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
      if (currentRules.some((r) => r.id === id)) continue;

      const style = DYNAMIC_PALETTE[currentRules.length % DYNAMIC_PALETTE.length];
      const newRule: LeadPriorityRule = {
        id,
        rank: currentRules.length + 1, // ALWAYS AT THE LAST
        name: sTrimmed,
        categoryKey: id,
        description: `MIS Sheet: ${sTrimmed}`,
        filePatterns: [sTrimmed],
        folderPatterns: [],
        neetYearOrder: 'desc',
        color: style.color,
        badgeBg: style.bg,
        badgeText: style.text,
        badgeBorder: style.border,
      };
      currentRules.push(newRule);
      changed = true;
      addedCount++;
      newlyAdded.push(`Sheet: ${sTrimmed}`);
    }
  }

  // 3. Synchronize Files
  for (const fileName of files) {
    const fTrimmed = (fileName || '').trim();
    if (!fTrimmed || isExcludedPriorityItem(fTrimmed)) continue;

    const fUpper = fTrimmed.toUpperCase();
    if (fUpper.includes('MIS COPY') || fUpper.includes('MASTER MIS') || fUpper.startsWith('GSHEET_')) continue;

    const noExt = fUpper.replace(/\.XLSX?$|\.XLSM?$/i, '');
    if (isExcludedPriorityItem(noExt)) continue;

    const id = `mis_file_${noExt.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
    const isCovered = currentRules.some((r) => {
      const rUp = r.name.toUpperCase().trim();
      const rId = (r.id || '').toUpperCase().trim();
      if (rUp === fUpper || rUp === noExt) return true;
      if (rId === id.toUpperCase() || rId === `FILE_${noExt.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`.toUpperCase()) return true;
      if (fUpper === 'JAN.XLSX' && (r.id === 'file_jan' || rUp === 'JAN.XLSX')) return true;
      if (fUpper === 'MAY.XLSX' && (r.id === 'file_may' || rUp === 'MAY.XLSX')) return true;
      if (fUpper === 'BL' && (r.id === 'file_bl' || r.id === 'mis_dir_bl' || rUp === 'BL')) return true;
      if (r.filePatterns && r.filePatterns.some((p) => {
        const pUp = p.toUpperCase().trim();
        return pUp === fUpper || pUp === noExt;
      })) return true;
      return false;
    });

    if (!isCovered) {
      const cleanName = fTrimmed;
      if (currentRules.some((r) => r.id === id || r.name.toUpperCase() === fUpper)) continue;

      const style = DYNAMIC_PALETTE[currentRules.length % DYNAMIC_PALETTE.length];
      const newRule: LeadPriorityRule = {
        id,
        rank: currentRules.length + 1, // ALWAYS AT THE LAST
        name: cleanName,
        categoryKey: id,
        description: `Workfile: ${cleanName}`,
        filePatterns: [fTrimmed, cleanName, noExt],
        folderPatterns: [],
        neetYearOrder: 'desc',
        color: style.color,
        badgeBg: style.bg,
        badgeText: style.text,
        badgeBorder: style.border,
      };
      currentRules.push(newRule);
      changed = true;
      addedCount++;
      newlyAdded.push(`Workfile: ${cleanName}`);
    }
  }

  if (changed) {
    currentRules = currentRules.filter(isValidPriorityRule).map((r, idx) => ({ ...r, rank: idx + 1 }));
    saveMisPriorityRules(currentRules);
  }

  return { rules: activeMisRules || currentRules, addedCount, newlyAdded };
}

/**
 * Backward compatibility wrapper
 */
export function syncPriorityRulesWithFiles(fileNames: string[]): LeadPriorityRule[] {
  const result = syncPriorityRulesWithDirectoriesAndFiles([], fileNames);
  return result.rules;
}

// Initial load
loadPriorityRules();
