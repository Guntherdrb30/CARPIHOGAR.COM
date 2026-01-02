import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const kitchenId = String(url.searchParams.get("kitchenId") || "").trim();
  const label = kitchenId ? `Kitchen ${kitchenId}` : "Kitchen design";
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800">
  <rect width="100%" height="100%" fill="#f3f4f6" />
  <rect x="80" y="80" width="1040" height="640" fill="#ffffff" stroke="#d1d5db" stroke-width="2" />
  <text x="600" y="380" text-anchor="middle" font-family="Arial, sans-serif" font-size="28" fill="#111827">
    ${label}
  </text>
  <text x="600" y="430" text-anchor="middle" font-family="Arial, sans-serif" font-size="16" fill="#6b7280">
    Placeholder image
  </text>
</svg>
`.trim();

  return new NextResponse(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Content-Disposition": "attachment; filename=\"kitchen-design-placeholder.svg\"",
      "Cache-Control": "no-store",
    },
  });
}
