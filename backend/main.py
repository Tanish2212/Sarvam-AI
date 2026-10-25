"""
LabelLens – Warranty-promise verification MVP backend.
Powered by Sarvam AI (Document AI + Sarvam-105B).
"""

from __future__ import annotations

import json
import os
import re
import tempfile
import time
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from pathlib import Path

_backend_dir = Path(__file__).resolve().parent
# Search for .env in backend/ first, then project root
load_dotenv(_backend_dir / ".env")
load_dotenv(_backend_dir.parent / ".env")  # fallback: project root

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(
    title="LabelLens API",
    version="0.1.0",
    description="Warranty-promise verification powered by Sarvam AI",
)

origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
MAX_PDF_PAGES = 10
VALID_STATUSES = {
    "SUPPORTED",
    "CONTRADICTED",
    "PARTIALLY_SUPPORTED",
    "INSUFFICIENT_EVIDENCE",
}

# ---------------------------------------------------------------------------
# Response schema
# ---------------------------------------------------------------------------

class Evidence(BaseModel):
    quote: str
    page: Optional[int] = None


class AnalysisResponse(BaseModel):
    status: str
    summary: str
    evidence: list[Evidence]
    follow_up_questions: list[str]
    analysis_mode: str  # "real" | "demo"


# ---------------------------------------------------------------------------
# Demo mode fixtures
# ---------------------------------------------------------------------------
DEMO_WARRANTY_TEXT = """
ACME Electronics – Limited Warranty (Model X-500)

Page 1:
1. Coverage Period: This product is covered by a limited warranty for a period
   of 24 months from the original date of purchase.
2. What Is Covered: Defects in materials and workmanship under normal use.
3. Battery Warranty: The rechargeable battery is warranted against defects for
   12 months from purchase. Battery capacity degradation below 80 % within the
   first 12 months is considered a defect.

Page 2:
4. What Is NOT Covered:
   a. Damage caused by accident, misuse, or unauthorized modification.
   b. Cosmetic damage such as scratches or dents.
   c. Damage caused by operating the product outside its intended use.
5. Water Resistance: The product is rated IPX4 (splash-proof). Submersion in
   water is NOT covered under this warranty.
6. Transferability: This warranty is non-transferable and applies only to the
   original purchaser.
""".strip()


def _demo_analyze(user_claim: str) -> AnalysisResponse:
    """Deterministic demo analysis against the fixture above."""
    claim_lower = user_claim.lower()

    # Pre-baked responses for common demo claims
    if "battery" in claim_lower and ("lifetime" in claim_lower or "forever" in claim_lower or "unlimited" in claim_lower):
        return AnalysisResponse(
            status="CONTRADICTED",
            summary="The warranty explicitly limits battery coverage to 12 months, not a lifetime.",
            evidence=[
                Evidence(
                    quote="The rechargeable battery is warranted against defects for 12 months from purchase.",
                    page=1,
                ),
            ],
            follow_up_questions=[
                "When did you purchase the product?",
                "Has the battery capacity dropped below 80 %?",
            ],
            analysis_mode="demo",
        )

    if "water" in claim_lower and ("swim" in claim_lower or "submers" in claim_lower or "underwater" in claim_lower):
        return AnalysisResponse(
            status="CONTRADICTED",
            summary="The product is splash-proof (IPX4) but submersion in water is explicitly excluded from warranty coverage.",
            evidence=[
                Evidence(
                    quote="The product is rated IPX4 (splash-proof). Submersion in water is NOT covered under this warranty.",
                    page=2,
                ),
            ],
            follow_up_questions=[
                "Was the product submerged or merely splashed?",
            ],
            analysis_mode="demo",
        )

    if "warranty" in claim_lower and ("2 year" in claim_lower or "24 month" in claim_lower or "two year" in claim_lower):
        return AnalysisResponse(
            status="SUPPORTED",
            summary="The warranty does cover defects in materials and workmanship for 24 months from the original purchase date.",
            evidence=[
                Evidence(
                    quote="This product is covered by a limited warranty for a period of 24 months from the original date of purchase.",
                    page=1,
                ),
                Evidence(
                    quote="Defects in materials and workmanship under normal use.",
                    page=1,
                ),
            ],
            follow_up_questions=[
                "Can you confirm the original purchase date?",
            ],
            analysis_mode="demo",
        )

    if "scratch" in claim_lower or re.search(r"\bdent\b", claim_lower) or "cosmetic" in claim_lower:
        return AnalysisResponse(
            status="CONTRADICTED",
            summary="Cosmetic damage such as scratches or dents is explicitly excluded from warranty coverage.",
            evidence=[
                Evidence(
                    quote="Cosmetic damage such as scratches or dents.",
                    page=2,
                ),
            ],
            follow_up_questions=[
                "Is the damage purely cosmetic or does it affect functionality?",
            ],
            analysis_mode="demo",
        )

    if "transfer" in claim_lower or "second.hand" in claim_lower or "resell" in claim_lower:
        return AnalysisResponse(
            status="CONTRADICTED",
            summary="The warranty is non-transferable and only applies to the original purchaser.",
            evidence=[
                Evidence(
                    quote="This warranty is non-transferable and applies only to the original purchaser.",
                    page=2,
                ),
            ],
            follow_up_questions=[
                "Are you the original purchaser of this product?",
            ],
            analysis_mode="demo",
        )

    # Fallback: insufficient evidence for unrecognized claims
    return AnalysisResponse(
        status="INSUFFICIENT_EVIDENCE",
        summary="The demo warranty document does not contain enough information to verify this specific claim.",
        evidence=[],
        follow_up_questions=[
            "Could you rephrase or narrow down your claim?",
            "Does your claim relate to battery, water damage, cosmetic issues, or warranty duration?",
        ],
        analysis_mode="demo",
    )


# ---------------------------------------------------------------------------
# Sarvam AI helpers  (real mode)
# ---------------------------------------------------------------------------

def _get_sarvam_client():
    """Lazily create the SarvamAI client, raising 503 if key is missing."""
    api_key = os.environ.get("SARVAM_API_KEY", "")
    if not api_key or api_key == "your_sarvam_api_key_here":
        raise HTTPException(
            status_code=503,
            detail="SARVAM_API_KEY is not configured. Set it in the .env file.",
        )
    from sarvamai import SarvamAI
    return SarvamAI(api_subscription_key=api_key)


def _extract_text_from_pdf(client, file_bytes: bytes, filename: str) -> list[dict]:
    """
    Use Sarvam Document AI to digitize a PDF.
    Returns a list of dicts: [{"page": 1, "text": "..."}, ...]
    """
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        tmp.write(file_bytes)
        tmp_path = tmp.name

    try:
        with open(tmp_path, "rb") as f:
            job = client.doc_ai.digitise(
                file=(filename, f, "application/pdf"),
                language="en-IN",
                content_type="printed",
            )

        job_id = getattr(job, "job_id", getattr(job, "id", None))
        if not job_id:
            raise HTTPException(502, f"Failed to get job ID from Sarvam response: {job}")

        for _ in range(60):  # poll up to ~3 minutes
            status_resp = client.doc_ai.get_status(job_id=job_id)
            st = status_resp.status
            if st in ("completed", "partially_completed"):
                break
            if st in ("failed", "rejected"):
                raise HTTPException(502, f"Sarvam Document AI job failed: {st}")
            time.sleep(3)
        else:
            raise HTTPException(504, "Sarvam Document AI timed out after 3 minutes.")

        results = client.doc_ai.get_results(job_id=job_id)

        pages_out = []
        res_dict = (
            results.model_dump()
            if hasattr(results, "model_dump")
            else results.dict()
            if hasattr(results, "dict")
            else (results if isinstance(results, dict) else json.loads(json.dumps(results)))
        )

        for doc in res_dict.get("documents", []):
            for p in doc.get("pages", []):
                page_num = p.get("page_num", p.get("page_number", len(pages_out) + 1))
                blocks = p.get("blocks", [])
                if blocks:
                    text = "\n".join(b.get("text", "") for b in blocks if b.get("text")).strip()
                elif p.get("content"):
                    text = p.get("content", "").strip()
                else:
                    text = ""
                if text:
                    pages_out.append({"page": page_num, "text": text})

        return pages_out

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(502, f"Sarvam Document AI error: {exc}") from exc
    finally:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)


def _build_analysis_prompt(warranty_text: str, user_claim: str) -> list[dict]:
    """Build the chat messages for Sarvam-105B analysis."""
    system_prompt = """You are LabelLens, an expert warranty-clause analyst.

You will receive:
1. WARRANTY DOCUMENT TEXT — the full extracted text of a warranty or product label.
2. USER CLAIM — a statement the user believes is covered (or not) by the warranty.

Your task:
- Compare the user's claim against the warranty text.
- Classify the claim as one of exactly these statuses:
  SUPPORTED — the warranty text clearly backs the claim.
  CONTRADICTED — the warranty text explicitly contradicts the claim.
  PARTIALLY_SUPPORTED — some parts are supported but others are not, or there are important caveats.
  INSUFFICIENT_EVIDENCE — the warranty text does not contain enough information to confirm or deny the claim.

CRITICAL RULES:
- Keep your internal reasoning concise and directly output the final JSON answer.
- If the warranty text simply does not mention the topic of the claim, classify as INSUFFICIENT_EVIDENCE, NOT as CONTRADICTED.
- Every piece of evidence MUST be an exact quote copied from the warranty text. Do NOT invent or paraphrase quotes.
- If you cannot determine the page number for a quote, set "page" to null. Do NOT guess page numbers.
- Suggest 1-3 follow-up questions the user might want to ask.

Respond ONLY with a valid JSON object in this exact schema (no markdown fences, no extra text):
{
  "status": "SUPPORTED | CONTRADICTED | PARTIALLY_SUPPORTED | INSUFFICIENT_EVIDENCE",
  "summary": "A concise 1-2 sentence explanation of the verdict.",
  "evidence": [
    {"quote": "Exact text from the warranty document", "page": 1}
  ],
  "follow_up_questions": ["Question 1?", "Question 2?"]
}"""

    user_message = f"""WARRANTY DOCUMENT TEXT:
---
{warranty_text}
---

USER CLAIM:
\"{user_claim}\"

Analyze the claim against the warranty text and respond with JSON only."""

    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_message},
    ]


def _parse_llm_response(raw: str) -> dict:
    """
    Robustly extract JSON from the LLM output.
    Handles markdown fences, leading text, thinking tags, and partial/truncated JSON.
    """
    if not raw or not raw.strip():
        raise ValueError("LLM returned empty content.")

    # Strip thinking/reasoning tags if any leaked into content
    cleaned = re.sub(r"<think>[\s\S]*?</think>", "", raw.strip(), flags=re.MULTILINE)
    # Strip markdown code fences if present
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned.strip(), flags=re.MULTILINE)
    cleaned = re.sub(r"\s*```$", "", cleaned.strip(), flags=re.MULTILINE)

    # 1. Try direct parse
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    # 2. Try to find a complete JSON object in the text
    matches = list(re.finditer(r"\{[\s\S]*\}", cleaned))
    if matches:
        for m in sorted(matches, key=lambda x: len(x.group(0)), reverse=True):
            candidate = m.group(0)
            try:
                return json.loads(candidate)
            except json.JSONDecodeError:
                # Clean trailing commas
                fixed = re.sub(r",\s*([\]}])", r"\1", candidate)
                try:
                    return json.loads(fixed)
                except json.JSONDecodeError:
                    pass

    # 3. Fallback: Salvage truncated JSON by extracting fields with regex
    status_match = re.search(r'"status"\s*:\s*"([A-Za-z_]+)"', cleaned)
    if status_match:
        status = status_match.group(1).upper()
        # Extract summary up to closing quote or end of string
        summary_match = re.search(r'"summary"\s*:\s*"([^"\n\r\\]*(?:\\.[^"\n\r\\]*)*)', cleaned)
        summary = summary_match.group(1) if summary_match else "Analysis completed."

        # Extract any quotes that made it into evidence
        evidence = []
        quote_matches = re.finditer(r'"quote"\s*:\s*"([^"\n\r\\]*(?:\\.[^"\n\r\\]*)*)"', cleaned)
        for qm in quote_matches:
            evidence.append({"quote": qm.group(1), "page": None})

        # Extract follow up questions if any
        follow_ups = []
        fu_matches = re.findall(r'"([^"?\n\r]*\?)"', cleaned)
        for fu in fu_matches:
            if len(fu) > 10 and fu not in follow_ups:
                follow_ups.append(fu)

        return {
            "status": status,
            "summary": summary,
            "evidence": evidence,
            "follow_up_questions": follow_ups or ["Does your warranty include optional accidental damage coverage?"],
        }

    raise ValueError(f"Could not parse LLM output as JSON. Raw preview: {raw[:300]}")


def _real_analyze(client, warranty_pages: list[dict], user_claim: str) -> AnalysisResponse:
    """Run the actual Sarvam-105B analysis."""
    # Combine page texts with page markers
    combined_parts = []
    for p in warranty_pages:
        combined_parts.append(f"[Page {p['page']}]\n{p['text']}")
    warranty_text = "\n\n".join(combined_parts)

    messages = _build_analysis_prompt(warranty_text, user_claim)

    try:
        response = client.chat.completions(
            model="sarvam-105b",
            messages=messages,
            max_tokens=8192,
            temperature=0.1,
        )
        msg = response.choices[0].message
        raw_content = getattr(msg, "content", None) or getattr(msg, "reasoning_content", None) or ""

    except Exception as exc:
        raise HTTPException(502, f"Sarvam chat API error: {exc}") from exc

    try:
        parsed = _parse_llm_response(raw_content)
    except ValueError as val_err:
        raise HTTPException(
            502,
            detail=f"Sarvam-105B returned unparseable output: {val_err}",
        )

    # Validate status
    status = parsed.get("status", "INSUFFICIENT_EVIDENCE").upper().replace(" ", "_")
    if status not in VALID_STATUSES:
        status = "INSUFFICIENT_EVIDENCE"

    evidence_raw = parsed.get("evidence", [])
    evidence = []
    for e in evidence_raw:
        if isinstance(e, dict) and "quote" in e:
            evidence.append(Evidence(
                quote=e["quote"],
                page=e.get("page"),  # None if missing — never guess
            ))

    return AnalysisResponse(
        status=status,
        summary=parsed.get("summary", "Analysis complete."),
        evidence=evidence,
        follow_up_questions=parsed.get("follow_up_questions", []),
        analysis_mode="real",
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/health")
async def health():
    has_key = bool(os.environ.get("SARVAM_API_KEY", ""))
    return {"status": "ok", "sarvam_key_configured": has_key}


@app.post("/api/analyze", response_model=AnalysisResponse)
async def analyze(
    user_claim: str = Form(...),
    file: Optional[UploadFile] = File(None),
    demo_mode: Optional[bool] = Form(False),
):
    # ---- Demo mode ----
    if demo_mode:
        return _demo_analyze(user_claim)

    # ---- Real mode: require a PDF ----
    if file is None:
        raise HTTPException(
            400,
            detail="A PDF file is required for real analysis. Set demo_mode=true to test without a file.",
        )

    if file.content_type not in ("application/pdf",):
        raise HTTPException(400, detail="Only PDF files are accepted.")

    file_bytes = await file.read()
    if len(file_bytes) == 0:
        raise HTTPException(400, detail="Uploaded file is empty.")

    # Rough page-count guard: typical PDF page ≈ 3-100 KB.
    # A more reliable check would parse the PDF xref table, but for MVP
    # we rely on Sarvam's own limit and add a generous size cap (~50 MB).
    if len(file_bytes) > 50 * 1024 * 1024:
        raise HTTPException(
            413,
            detail="File too large (>50 MB). Please upload a shorter document.",
        )

    client = _get_sarvam_client()

    # Extract text via Document AI
    warranty_pages = _extract_text_from_pdf(client, file_bytes, file.filename or "upload.pdf")

    if len(warranty_pages) > MAX_PDF_PAGES:
        raise HTTPException(
            413,
            detail=f"Document has {len(warranty_pages)} pages. Maximum is {MAX_PDF_PAGES}.",
        )

    if not warranty_pages or all(not p["text"].strip() for p in warranty_pages):
        raise HTTPException(
            422,
            detail="Could not extract any text from the uploaded PDF. Is it a scanned image without OCR?",
        )

    # Analyze with Sarvam-105B
    return _real_analyze(client, warranty_pages, user_claim)
