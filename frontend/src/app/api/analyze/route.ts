import { NextRequest, NextResponse } from "next/server";

// Fallback deterministic demo analyzer (mirrors backend/main.py)
function runDemoAnalysis(userClaim: string) {
  const claimLower = userClaim.toLowerCase();

  if (
    claimLower.includes("accident") ||
    claimLower.includes("drop") ||
    claimLower.includes("spill")
  ) {
    return {
      status: "CONTRADICTED",
      summary:
        "The warranty explicitly excludes damage caused by accident, misuse, or liquid spills.",
      evidence: [
        {
          quote: "Damage caused by accident, misuse, or unauthorized modification.",
          page: 2,
        },
      ],
      follow_up_questions: [
        "Does the retailer or manufacturer offer a separate accidental-damage protection plan?",
        "Was this verbal promise put in writing on your purchase invoice?",
      ],
      analysis_mode: "demo",
    };
  }

  if (
    claimLower.includes("battery") &&
    (claimLower.includes("lifetime") ||
      claimLower.includes("forever") ||
      claimLower.includes("2 year") ||
      claimLower.includes("unlimited"))
  ) {
    return {
      status: "CONTRADICTED",
      summary:
        "The warranty explicitly limits rechargeable battery coverage to 12 months, not lifetime or 2 years.",
      evidence: [
        {
          quote:
            "The rechargeable battery is warranted against defects for 12 months from purchase.",
          page: 1,
        },
      ],
      follow_up_questions: [
        "When did you purchase the product?",
        "Has the battery capacity dropped below 80%?",
      ],
      analysis_mode: "demo",
    };
  }

  if (
    claimLower.includes("water") &&
    (claimLower.includes("swim") ||
      claimLower.includes("submers") ||
      claimLower.includes("underwater") ||
      claimLower.includes("pool"))
  ) {
    return {
      status: "CONTRADICTED",
      summary:
        "The product is rated IPX4 splash-proof only. Submersion in water is explicitly excluded from warranty coverage.",
      evidence: [
        {
          quote:
            "The product is rated IPX4 (splash-proof). Submersion in water is NOT covered under this warranty.",
          page: 2,
        },
      ],
      follow_up_questions: [
        "Was the device merely splashed with water or fully submerged?",
      ],
      analysis_mode: "demo",
    };
  }

  if (
    claimLower.includes("scratch") ||
    claimLower.includes("dent") ||
    claimLower.includes("cosmetic")
  ) {
    return {
      status: "CONTRADICTED",
      summary:
        "Cosmetic damage such as scratches, dings, or dents is explicitly excluded from warranty coverage.",
      evidence: [
        {
          quote: "Cosmetic damage such as scratches or dents.",
          page: 2,
        },
      ],
      follow_up_questions: [
        "Is the damage purely cosmetic, or does it impair device functionality?",
      ],
      analysis_mode: "demo",
    };
  }

  if (
    claimLower.includes("warranty") &&
    (claimLower.includes("2 year") ||
      claimLower.includes("24 month") ||
      claimLower.includes("two year") ||
      claimLower.includes("defect") ||
      claimLower.includes("workmanship"))
  ) {
    return {
      status: "SUPPORTED",
      summary:
        "The warranty covers manufacturing defects in materials and workmanship for a full 24 months (2 years).",
      evidence: [
        {
          quote:
            "This product is covered by a limited warranty for a period of 24 months from the original date of purchase.",
          page: 1,
        },
        {
          quote: "Defects in materials and workmanship under normal use.",
          page: 1,
        },
      ],
      follow_up_questions: [
        "Do you have the original proof of purchase or invoice?",
      ],
      analysis_mode: "demo",
    };
  }

  if (
    claimLower.includes("transfer") ||
    claimLower.includes("second hand") ||
    claimLower.includes("resell")
  ) {
    return {
      status: "CONTRADICTED",
      summary:
        "The warranty is strictly non-transferable and applies only to the original purchaser.",
      evidence: [
        {
          quote:
            "This warranty is non-transferable and applies only to the original purchaser.",
          page: 2,
        },
      ],
      follow_up_questions: [
        "Are you the original purchaser listed on the receipt?",
      ],
      analysis_mode: "demo",
    };
  }

  return {
    status: "INSUFFICIENT_EVIDENCE",
    summary:
      "The sample warranty document does not contain enough information to verify this specific claim.",
    evidence: [],
    follow_up_questions: [
      "Could you narrow down or rephrase your claim?",
      "Does your promise relate to battery, water damage, accidental drops, or warranty duration?",
    ],
    analysis_mode: "demo",
  };
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const userClaim = (formData.get("user_claim") as string) || "";
    const demoMode = formData.get("demo_mode") === "true";
    const file = formData.get("file") as File | null;

    // Check if an external backend URL is configured
    const backendUrl =
      process.env.BACKEND_API_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      "http://localhost:8000";

    // Attempt to proxy to FastAPI backend if available
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      const forwardData = new FormData();
      forwardData.append("user_claim", userClaim);
      if (demoMode) forwardData.append("demo_mode", "true");
      if (file) forwardData.append("file", file);

      const backendRes = await fetch(`${backendUrl}/api/analyze`, {
        method: "POST",
        body: forwardData,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (backendRes.ok) {
        const data = await backendRes.json();
        return NextResponse.json(data);
      }
    } catch {
      // Backend unavailable or timed out (e.g. running standalone on Vercel)
    }

    // In demo mode or when testing without backend: return deterministic demo analysis
    if (demoMode || !file) {
      return NextResponse.json(runDemoAnalysis(userClaim));
    }

    // If a file was uploaded on Vercel but no backend is connected:
    return NextResponse.json(
      {
        detail:
          "Real PDF document analysis requires a live backend connection. Please click 'Try Demo' to test the warranty verification engine.",
      },
      { status: 503 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        detail:
          error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}
