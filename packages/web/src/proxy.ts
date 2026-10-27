import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const development = process.env.NODE_ENV === "development";

  const policy = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ""}`,
    `style-src 'self'${development ? " 'unsafe-inline'" : ""}`,
    "connect-src 'self'",
    "img-src 'self' data:",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");

  const headers = new Headers(request.headers);

  headers.set("Content-Security-Policy", policy);

  const response = NextResponse.next({ request: { headers } });

  response.headers.set("Content-Security-Policy", policy);

  return response;
}

export const config = {
  matcher: ["/", "/settings"],
};
