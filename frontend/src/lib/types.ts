/** Matches the agreed API response contract */
export interface EvidenceItem {
  quote: string;
  page?: number;
}

export type AnalysisStatus =
  | "SUPPORTED"
  | "CONTRADICTED"
  | "PARTIALLY_SUPPORTED"
  | "INSUFFICIENT_EVIDENCE";

export interface AnalysisResponse {
  status: AnalysisStatus;
  summary: string;
  evidence: EvidenceItem[];
  follow_up_questions: string[];
  analysis_mode: "real" | "demo";
}

export interface AnalysisRequest {
  user_claim: string;
  file?: File;
  demo_mode?: boolean;
}
