import * as fs from 'fs';
import initSqlJs from 'sql.js';
import * as XLSX from 'xlsx';
import { normalizePhone, normalizeName, normalizePan } from '../server/normalizer.js';

const ROOT_FOLDER_ID = '1xFVOGEiQNshKBpA8tQoedy9FfPTP4rjn';
const SOURCE_ID = 'src_1xFVOGEiQNsh';

async function syncNewHierarchy() {
  console.log('Loading SQLite database...');
  const SQL = await initSqlJs();
  const dbBuf = fs.readFileSync('data/db/fintech.sqlite');
  const db = new SQL.Database(dbBuf);

  // 1. Populate New Folders Hierarchy
  console.log('Updating folders table with 3-directory hierarchy (BL, DOCTORS, PL)...');
  db.run('DELETE FROM folders WHERE source_id = ?;', [SOURCE_ID]);

  const foldersToInsert = [
    // Top-Level Directories
    { id: '1ciaMYJ_K8c-JuUoW8im3xsDXhubSNuVm', name: 'BL', path: 'BL', parentId: ROOT_FOLDER_ID },
    { id: '1J1u0jZYH6LbqFE1GGTpe7U_awTW3f6b2', name: 'DOCTORS', path: 'DOCTORS', parentId: ROOT_FOLDER_ID },
    { id: '1FDQ8WbaJOXtUaIf09vt4TfeMePUrPxFJ', name: 'PL', path: 'PL', parentId: ROOT_FOLDER_ID },

    // Subdirectories of DOCTORS
    { id: '1DiVhmzm9SAd1LfcjCNmzLtHQGjYaM8x9', name: 'Directory', path: 'DOCTORS / Directory', parentId: '1J1u0jZYH6LbqFE1GGTpe7U_awTW3f6b2' },
    { id: '1i0xlql017GXkqGOyuhLJOdNd0CQTD61z', name: 'f2 Leads', path: 'DOCTORS / f2 Leads', parentId: '1J1u0jZYH6LbqFE1GGTpe7U_awTW3f6b2' },
    { id: '1jgXm7zV6dpxaHGMrpWwHDuHfl1f0rjX8', name: 'Login', path: 'DOCTORS / Login', parentId: '1J1u0jZYH6LbqFE1GGTpe7U_awTW3f6b2' },
    { id: '1RceF_gohT-TJwvIAcUmOJjJNIGdRkvjk', name: 'lot', path: 'DOCTORS / lot', parentId: '1J1u0jZYH6LbqFE1GGTpe7U_awTW3f6b2' },
    { id: '1-zOexLIGnV1MWUeaDbppEVr9BeyJqpOK', name: 'Neet', path: 'DOCTORS / Neet', parentId: '1J1u0jZYH6LbqFE1GGTpe7U_awTW3f6b2' },
    { id: '1klAcW7m0bBYj999MDLUadqJeePbIcGlW', name: 'Neet support data', path: 'DOCTORS / Neet support data', parentId: '1J1u0jZYH6LbqFE1GGTpe7U_awTW3f6b2' },
    { id: '1SmI46GKzvzUeH7UbgMJHPgu02fCydEdl', name: 'Tata Points', path: 'DOCTORS / Tata Points', parentId: '1J1u0jZYH6LbqFE1GGTpe7U_awTW3f6b2' },
    { id: '1f1smdvAA0UZGJZfbOPG0s1mxtRdV-Ok8', name: 'TEAM X', path: 'DOCTORS / TEAM X', parentId: '1J1u0jZYH6LbqFE1GGTpe7U_awTW3f6b2' },
  ];

  for (const f of foldersToInsert) {
    db.run(`
      INSERT OR REPLACE INTO folders (id, source_id, folder_id, folder_name, folder_path, parent_id)
      VALUES (?, ?, ?, ?, ?, ?);
    `, [`${SOURCE_ID}_${f.id}`, SOURCE_ID, f.id, f.name, f.path, f.parentId]);
  }

  // 2. Update existing files table with new folder_path and folder_id
  console.log('Updating files metadata...');
  // ICICI -> PL
  db.run(`
    UPDATE files
    SET folder_id = '1FDQ8WbaJOXtUaIf09vt4TfeMePUrPxFJ', folder_path = 'PL'
    WHERE file_name LIKE '%ICICI%';
  `);
  db.run(`
    UPDATE search_index
    SET folder_id = '1FDQ8WbaJOXtUaIf09vt4TfeMePUrPxFJ', folder_path = 'PL'
    WHERE file_name LIKE '%ICICI%';
  `);

  // DOCTORS files
  const doctorUpdates = [
    { pattern: '%Consolidated Directories%', folderId: '1DiVhmzm9SAd1LfcjCNmzLtHQGjYaM8x9', folderPath: 'DOCTORS / Directory' },
    { pattern: 'Jan.xlsx', folderId: '1i0xlql017GXkqGOyuhLJOdNd0CQTD61z', folderPath: 'DOCTORS / f2 Leads' },
    { pattern: 'MAY.xlsx', folderId: '1i0xlql017GXkqGOyuhLJOdNd0CQTD61z', folderPath: 'DOCTORS / f2 Leads' },
    { pattern: 'LOGIN.xlsx', folderId: '1jgXm7zV6dpxaHGMrpWwHDuHfl1f0rjX8', folderPath: 'DOCTORS / Login' },
    { pattern: 'LOT.xlsx', folderId: '1RceF_gohT-TJwvIAcUmOJjJNIGdRkvjk', folderPath: 'DOCTORS / lot' },
    { pattern: 'NEET.xlsx', folderId: '1-zOexLIGnV1MWUeaDbppEVr9BeyJqpOK', folderPath: 'DOCTORS / Neet' },
    { pattern: '%21k%', folderId: '1klAcW7m0bBYj999MDLUadqJeePbIcGlW', folderPath: 'DOCTORS / Neet support data' },
    { pattern: '%30k%', folderId: '1klAcW7m0bBYj999MDLUadqJeePbIcGlW', folderPath: 'DOCTORS / Neet support data' },
    { pattern: '%Tata Points%', folderId: '1SmI46GKzvzUeH7UbgMJHPgu02fCydEdl', folderPath: 'DOCTORS / Tata Points' },
    { pattern: '%TEAM X%', folderId: '1f1smdvAA0UZGJZfbOPG0s1mxtRdV-Ok8', folderPath: 'DOCTORS / TEAM X' },
  ];

  for (const u of doctorUpdates) {
    db.run('UPDATE files SET folder_id = ?, folder_path = ? WHERE file_name LIKE ?;', [u.folderId, u.folderPath, u.pattern]);
    db.run('UPDATE search_index SET folder_id = ?, folder_path = ? WHERE file_name LIKE ?;', [u.folderId, u.folderPath, u.pattern]);
  }

  // 3. Ensure BL workbook is fully indexed
  const blFileExists = db.exec("SELECT total_rows FROM files WHERE file_name = 'BL' OR file_name = 'BL.xlsx';");
  const blRowsInDb = blFileExists[0]?.values[0]?.[0] as number || 0;

  if (blRowsInDb <= 0 || !fs.existsSync('data/cache/BL.xlsx')) {
    console.log('Indexing BL.xlsx...');
    const blPath = fs.existsSync('data/cache/BL.xlsx')
      ? 'data/cache/BL.xlsx'
      : 'data/cache/17iVKXYw2Etso8yVHLH2buzhIPGtAraz5_BL.xlsx';

    if (fs.existsSync(blPath)) {
      const fileBuf = fs.readFileSync(blPath);
      const wb = XLSX.read(fileBuf, { type: 'buffer' });
      const ws = wb.Sheets['Sheet1'] || wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];

      const headers = (data[0] || []).map((h, i) => String(h || `Col_${i + 1}`).trim());
      console.log(`BL Headers: ${headers.join(', ')}. Rows count: ${data.length - 1}`);

      let phoneIdx = -1;
      let nameIdx = -1;
      let branchIdx = -1;
      let amountIdx = -1;
      let stateIdx = -1;

      headers.forEach((h, i) => {
        if (/phone|mob|contact|number/i.test(h) && phoneIdx === -1) phoneIdx = i;
        if (/name/i.test(h) && nameIdx === -1) nameIdx = i;
        if (/branch|city/i.test(h) && branchIdx === -1) branchIdx = i;
        if (/eligib|amount/i.test(h) && amountIdx === -1) amountIdx = i;
        if (/state/i.test(h) && stateIdx === -1) stateIdx = i;
      });

      // Clear previous BL rows in index if any
      db.run("DELETE FROM search_index WHERE file_id = '17iVKXYw2Etso8yVHLH2buzhIPGtAraz5';");

      db.run('BEGIN TRANSACTION;');
      const stmt = db.prepare(`
        INSERT INTO search_index (
          source_id, folder_id, folder_path, file_id, file_name, sheet_name, row_num,
          customer_name, norm_name, phone_raw, norm_phone, secondary_phone, pan,
          city, state, lender, loan_amount, status_val, search_text, raw_row_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, NULL, ?, NULL, ?, ?);
      `);

      let totalIndexed = 0;
      for (let r = 1; r < data.length; r++) {
        const row = data[r] || [];
        const rawPhone = phoneIdx >= 0 ? row[phoneIdx] : '';
        const rawName = nameIdx >= 0 ? row[nameIdx] : '';
        const rawBranch = branchIdx >= 0 ? row[branchIdx] : '';
        const rawAmount = amountIdx >= 0 ? row[amountIdx] : '';
        const rawState = stateIdx >= 0 ? row[stateIdx] : '';

        const { normalized: pNorm, original: pOrig } = normalizePhone(rawPhone);
        const { normalized: nNorm, original: nOrig } = normalizeName(rawName);

        const rowObj: Record<string, any> = {};
        headers.forEach((h, idx) => { rowObj[h] = row[idx] ?? ''; });

        stmt.run([
          SOURCE_ID,
          '1ciaMYJ_K8c-JuUoW8im3xsDXhubSNuVm',
          'BL',
          '17iVKXYw2Etso8yVHLH2buzhIPGtAraz5',
          'BL.xlsx',
          'Sheet1',
          r + 1,
          nOrig || null,
          nNorm || null,
          pOrig || null,
          pNorm || null,
          rawBranch ? String(rawBranch) : null,
          rawState ? String(rawState) : null,
          rawAmount ? String(rawAmount) : null,
          Object.values(rowObj).join(' '),
          JSON.stringify(rowObj),
        ]);
        totalIndexed++;

        if (totalIndexed % 25000 === 0) {
          console.log(`BL progress: ${totalIndexed} / ${data.length - 1} rows...`);
        }
      }
      stmt.free();
      db.run('COMMIT;');

      // Sheets table
      db.run(`
        INSERT OR REPLACE INTO sheets (
          id, source_id, file_id, sheet_name, sheet_index, rows_count, cols_count, headers_json, is_indexed, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 'indexed');
      `, [
        '17iVKXYw2Etso8yVHLH2buzhIPGtAraz5_Sheet1',
        SOURCE_ID,
        '17iVKXYw2Etso8yVHLH2buzhIPGtAraz5',
        'Sheet1',
        0,
        totalIndexed,
        headers.length,
        JSON.stringify(headers),
      ]);

      // Files table
      db.run(`
        INSERT OR REPLACE INTO files (
          id, source_id, folder_id, file_id, file_name, folder_path,
          mime_type, file_size, sheets_count, total_rows, status, indexed_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ?, 1, ?, 'indexed', ?);
      `, [
        `${SOURCE_ID}_17iVKXYw2Etso8yVHLH2buzhIPGtAraz5`,
        SOURCE_ID,
        '1ciaMYJ_K8c-JuUoW8im3xsDXhubSNuVm',
        '17iVKXYw2Etso8yVHLH2buzhIPGtAraz5',
        'BL.xlsx',
        'BL',
        fs.statSync(blPath).size,
        totalIndexed,
        new Date().toISOString(),
      ]);

      console.log(`Successfully indexed ${totalIndexed} rows for BL.xlsx!`);
    }
  } else {
    console.log(`BL file already indexed with ${blRowsInDb} rows.`);
    // Make sure folder_id and folder_path are accurate
    db.run(`
      UPDATE files
      SET folder_id = '1ciaMYJ_K8c-JuUoW8im3xsDXhubSNuVm', folder_path = 'BL'
      WHERE file_id = '17iVKXYw2Etso8yVHLH2buzhIPGtAraz5' OR file_name = 'BL' OR file_name = 'BL.xlsx';
    `);
    db.run(`
      UPDATE search_index
      SET folder_id = '1ciaMYJ_K8c-JuUoW8im3xsDXhubSNuVm', folder_path = 'BL'
      WHERE file_id = '17iVKXYw2Etso8yVHLH2buzhIPGtAraz5' OR file_name = 'BL' OR file_name = 'BL.xlsx';
    `);
  }

  // Create indexes for instant sub-millisecond search performance
  console.log('Ensuring SQLite indexes...');
  db.run('CREATE INDEX IF NOT EXISTS idx_search_phone ON search_index(norm_phone);');
  db.run('CREATE INDEX IF NOT EXISTS idx_search_name ON search_index(norm_name);');
  db.run('CREATE INDEX IF NOT EXISTS idx_search_source ON search_index(source_id);');
  db.run('CREATE INDEX IF NOT EXISTS idx_search_file_sheet ON search_index(file_id, sheet_name);');

  // Complete sync run record
  db.run("UPDATE sync_runs SET status = 'completed', completed_at = ?, duration_ms = 4000 WHERE status = 'running';", [new Date().toISOString()]);

  fs.writeFileSync('data/db/fintech.sqlite', Buffer.from(db.export()));
  console.log('Successfully saved database with new 3-directory hierarchy!');

  // Report final verification stats
  const foldersRes = db.exec('SELECT folder_name, folder_path, parent_id FROM folders;');
  console.log('\n--- FOLDERS IN DATABASE ---');
  for (const r of foldersRes[0]?.values || []) {
    console.log(`  📁 ${r[0]} | Path: "${r[1]}" | Parent: ${r[2]}`);
  }

  const filesRes = db.exec('SELECT file_name, folder_path, total_rows FROM files;');
  console.log('\n--- FILES IN DATABASE ---');
  for (const r of filesRes[0]?.values || []) {
    console.log(`  📄 ${r[0]} | Folder: "${r[1]}" | Rows: ${r[2]}`);
  }

  const totalIdxRes = db.exec('SELECT COUNT(*) FROM search_index;');
  console.log(`\nTOTAL SEARCHABLE ROWS: ${totalIdxRes[0]?.values[0]?.[0]}`);
}

syncNewHierarchy().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
