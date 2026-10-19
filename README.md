# F2 Fintech — Google Drive Data Directory & Search

Enterprise Google Drive data directory, recursive Excel workbook scanner, source tracker, and ultra-fast multi-sheet search index.

---

## 🚀 How to Run Locally

### 1. Prerequisites
Ensure you have the following installed on your computer:
- **Node.js** (v18.0.0 or higher, **Node 20+ LTS recommended**)
  - Download from: [https://nodejs.org/](https://nodejs.org/)
  - Verify installation in terminal:
    ```bash
    node -v
    npm -v
    ```

---

### 2. Download / Extract the Project
- If you downloaded a **ZIP** from AI Studio:
  - Extract the ZIP file into a folder of your choice (e.g., `f2-fintech`).
- If you exported to **GitHub**:
  - Clone your repository:
    ```bash
    git clone <YOUR_REPOSITORY_URL>
    cd <YOUR_REPOSITORY_FOLDER>
    ```

---

### 3. Open Terminal & Navigate to Project
Open your Command Prompt (CMD), PowerShell, or Terminal, and navigate to the project directory:
```bash
cd path/to/project
```

---

### 4. Setup Environment Variables
Create your local `.env` file by copying `.env.example`:

- **Windows (Command Prompt):**
  ```cmd
  copy .env.example .env
  ```
- **Windows (PowerShell):**
  ```powershell
  Copy-Item .env.example .env
  ```
- **Mac / Linux:**
  ```bash
  cp .env.example .env
  ```

*(Optional)* If you plan to use AI-assisted parsing or Gemini features, open `.env` in any text editor and add your Google Gemini API key:
```env
GEMINI_API_KEY="your-api-key-here"
PORT=3000
```
*(Get a free API key at [https://aistudio.google.com/apikey](https://aistudio.google.com/apikey))*

---

### 5. Install Dependencies
Run:
```bash
npm install
```

---

### 6. Start the Local Server
Run:
```bash
npm run dev
```

You should see:
```text
F2 Fintech Server running on port 3000
```

---

### 7. Open the App in Your Browser
Open your browser and visit:
👉 **[http://localhost:3000](http://localhost:3000)**

---

## 📦 Production Build (Optional)

To test the optimized production build:
```bash
npm run build
npm run start
```
The app will serve the compiled Vite static assets through the Express backend on port `3000`.

---

## 📁 Project Architecture & Data Storage

- `server.ts` — Express backend + Vite middleware dev server integration.
- `server/db.ts` — SQL.js SQLite database engine with disk persistence.
- `server/crawler.ts` — Google Drive & folder crawler.
- `server/indexer.ts` — Excel sheet parser, phone/name normalizer, and indexing engine.
- `server/search.ts` — High-speed prefix, exact, and fuzzy search engine.
- `server/priority.ts` — Source hierarchy and priority resolution engine.
- `src/` — React 19 UI with Tailwind CSS and Lucide icons.
- `data/db/fintech.sqlite` — Local SQLite database file.
- `data/cache/` — Cached Excel workbooks.
- `data/config/priority_rules.json` — Priority rankings configuration.

---

## 🛠️ Troubleshooting

- **Port 3000 already in use?**
  Change the port by setting `PORT=3001` before starting:
  ```bash
  # Windows PowerShell
  $env:PORT="3001"; npm run dev

  # Mac/Linux
  PORT=3001 npm run dev
  ```
- **Missing node-gyp or native build tools?**
  This project uses `sql.js` (WebAssembly SQLite) and pure JS libraries (`xlsx`), so **no C++ compilers or native Python build tools are needed**. Standard `npm install` works out of the box on Windows, macOS, and Linux.
