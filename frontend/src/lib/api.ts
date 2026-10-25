import { AnalysisRequest, AnalysisResponse } from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * POST /api/analyze
 * Sends the user claim + optional PDF as multipart/form-data.
 */
export async function analyzeWarranty(
  req: AnalysisRequest,
): Promise<AnalysisResponse> {
  const form = new FormData();
  form.append("user_claim", req.user_claim);

  if (req.file) {
    form.append("file", req.file);
  }

  if (req.demo_mode) {
    form.append("demo_mode", "true");
  }

  const res = await fetch(`${API_BASE}/api/analyze`, {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.detail) message = body.detail;
    } catch {
      // ignore parse errors
    }
    throw new ApiError(res.status, message);
  }

  return res.json() as Promise<AnalysisResponse>;
}
