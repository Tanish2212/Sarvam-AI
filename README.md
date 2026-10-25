# 🔍 LabelLens

> **Automated Warranty-Promise Verification MVP powered by Sarvam AI**

LabelLens is an AI-powered verification engine that takes user claims about warranty coverage and rigorously cross-references them against manufacturer warranty documents and product labels. Built using **Sarvam Document AI** for OCR and document understanding, and **Sarvam-105B** for reasoning and grounded evidence extraction.

---

## ⚡ Features

- **Document Digitization**: Processes warranty PDFs (up to 10 pages) via Sarvam Document AI, preserving page numbers, structure, and text blocks.
- **Strictly Grounded Analysis**: Employs **Sarvam-105B** with chain-of-verification prompting to prevent hallucinations. Clauses and quotes are exact excerpts copied directly from the source document.
- **Missing ≠ Contradicted**: Distinguishes between explicit exclusions (`CONTRADICTED`) and unmentioned terms (`INSUFFICIENT_EVIDENCE`).
- **Contextual Follow-up Inquiries**: Suggests intelligent next steps and clarifying questions tailored to the claim and warranty clauses.
- **Zero-Friction Demo Mode**: Instant, deterministic offline demonstration for quick testing without consuming API credits or requiring PDF uploads.
- **Privacy & Security**: All API keys remain strictly backend-side and are never exposed to the client or committed to version control.

---

## 🏗️ Architecture & Tech Stack

```
┌─────────────────────────────────┐
│     Next.js 15 Frontend         │  (TypeScript, Tailwind CSS, Lucide)
│     http://localhost:3000       │
└──────────────┬──────────────────┘
               │  multipart/form-data
               ▼
┌─────────────────────────────────┐
│     FastAPI Python Backend      │  (Uvicorn, Pydantic, python-dotenv)
│     http://localhost:8000       │
└──────┬───────────────────┬──────┘
       │                   │
       ▼                   ▼
┌─────────────────┐ ┌───────────────────┐
│ Sarvam Doc AI   │ │ Sarvam-105B       │
│ (Digitization)  │ │ (LLM Reasoning)   │
└─────────────────┘ └───────────────────┘
```

- **Frontend**: Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS
- **Backend**: FastAPI, Uvicorn, Python 3.10+, Pydantic v2
- **AI Engine**: [Sarvam AI](https://www.sarvam.ai/)
  - `client.doc_ai.digitise`: Document intelligence & OCR
  - `sarvam-105b`: Chat completion model for multi-step legal/clause reasoning

---

## 📁 Repository Structure

```
Sarvam-AI/
├── backend/
│   ├── main.py              # FastAPI app, endpoints, Sarvam AI client & logic
│   ├── requirements.txt     # Python dependencies
│   ├── .env.example         # Template for environment variables
│   ├── .env                 # (Ignored) Secrets & SARVAM_API_KEY
│   └── .gitignore           # Ignores .env, __pycache__, and test PDFs
├── frontend/
│   ├── src/
│   │   ├── app/             # Next.js App Router (page.tsx, layout.tsx, globals.css)
│   │   └── lib/             # API client (api.ts) & TypeScript contracts (types.ts)
│   ├── package.json
│   ├── tailwind.config.ts
│   └── tsconfig.json
└── README.md
```

---

## 🚀 Quick Start

### 1. Prerequisites
- Python 3.10+
- Node.js 18+ and `npm`
- A valid [Sarvam AI API Key](https://dashboard.sarvam.ai)

---

### 2. Backend Setup

```bash
cd backend

# Install dependencies
pip install -r requirements.txt

# Create .env from the template
cp .env.example .env
```

Open `backend/.env` and insert your Sarvam API subscription key:
```env
SARVAM_API_KEY=sk_your_actual_sarvam_api_key
```

Run the backend server:
```bash
python -m uvicorn main:app --reload --port 8000
```

Verify backend health at [http://localhost:8000/health](http://localhost:8000/health).

---

### 3. Frontend Setup

In a new terminal window:

```bash
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 📡 API Reference

### `POST /api/analyze`

Accepts `multipart/form-data`:

| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `user_claim` | `string` | **Yes** | The claim or question to verify against warranty terms. |
| `file` | `file (PDF)` | Optional* | Warranty document (max 10 pages). *Required if `demo_mode` is false. |
| `demo_mode` | `boolean` | Optional | Set to `true` to run instant offline demo using fixtures. |

#### Example Response:

```json
{
  "status": "CONTRADICTED",
  "summary": "The warranty document explicitly states that water damage is not covered under any circumstances.",
  "evidence": [
    {
      "quote": "Water damage is not covered under any circumstances.",
      "page": 1
    }
  ],
  "follow_up_questions": [
    "Were there any manufacturing defects present that may have allowed water entry?",
    "What are the specific circumstances surrounding the incident?"
  ],
  "analysis_mode": "real"
}
```

### Classification Statuses

| Status | Meaning |
| :--- | :--- |
| `SUPPORTED` | The warranty explicitly validates and covers the claim. |
| `CONTRADICTED` | The warranty explicitly disallows or excludes coverage for the claim. |
| `PARTIALLY_SUPPORTED` | The claim is partially covered with conditions, caveats, or limitations. |
| `INSUFFICIENT_EVIDENCE` | The document does not contain enough information to confirm or deny. |

---

### `GET /health`

Returns server status and key presence:

```json
{
  "status": "ok",
  "sarvam_key_configured": true
}
```

---

## 🛡️ License

This project is developed for hackathon MVP demonstration under the MIT License.