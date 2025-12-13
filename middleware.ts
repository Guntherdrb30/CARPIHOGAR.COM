
import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    // Require verified email only for CLIENTE, ALIADO, DELIVERY accessing dashboards or checkout
    const path = req.nextUrl.pathname;
    const role = req.nextauth.token?.role as string | undefined;
    const email = String((req.nextauth.token as any)?.email || '').toLowerCase();
    const rootEmail = String(process.env.ROOT_EMAIL || 'root@carpihogar.com').toLowerCase();
    const emailVerified = (req.nextauth.token as any)?.emailVerified === true;
    // Accept short-lived cookie set by /api/auth/verify-email so
    // users can navigate immediately after clicking the email link
    const tempVerified = req.cookies.get('verified_email')?.value === '1';
    const needsVerified = (
      path.startsWith('/checkout') ||
      path.startsWith('/dashboard/') ||
      path === '/dashboard'
    );
    const requiresVerification = role === 'CLIENTE' || role === 'ALIADO' || role === 'DELIVERY';
    if (needsVerified && requiresVerification && !emailVerified && !tempVerified) {
      return NextResponse.rewrite(new URL('/auth/verify-required', req.url));
    }
    // Prevent ADMIN (root) from accessing client dashboard; send to admin home
    if (
      req.nextUrl.pathname.startsWith("/dashboard/cliente") &&
      req.nextauth.token?.role === "ADMIN"
    ) {
      return NextResponse.redirect(new URL("/dashboard/admin", req.url));
    }
    // Prevent DELIVERY from accessing client dashboard; send to delivery home
    if (
      req.nextUrl.pathname.startsWith("/dashboard/cliente") &&
      req.nextauth.token?.role === "DELIVERY"
    ) {
      return NextResponse.redirect(new URL("/dashboard/delivery", req.url));
    }
    if (req.nextUrl.pathname.startsWith("/dashboard/admin/root")) {
      const isRoot = role === "ADMIN" && email === rootEmail;
      if (!isRoot) {
        return NextResponse.rewrite(new URL("/auth/login?message=You Are Not Authorized!", req.url));
      }
    }
    // Allow DESPACHO to acceder solo a /dashboard/admin/envios
    if (req.nextUrl.pathname.startsWith("/dashboard/admin/envios")) {
      if (role === 'ADMIN' || role === 'DESPACHO') {
        // permitido
      } else {
        return NextResponse.rewrite(new URL("/auth/login?message=You Are Not Authorized!", req.url));
      }
    } else if (
      req.nextUrl.pathname.startsWith("/dashboard/admin") &&
      role !== "ADMIN"
    ) {
      return NextResponse.rewrite(new URL("/auth/login?message=You Are Not Authorized!", req.url));
    }
    // Protect aliado dashboard for ALIADO role
    if (
      req.nextUrl.pathname.startsWith("/dashboard/aliado") &&
      role !== "ALIADO"
    ) {
      return NextResponse.rewrite(new URL("/auth/login?message=You Are Not Authorized!", req.url));
    }
    // Protect delivery dashboard for DELIVERY role
    if (
      req.nextUrl.pathname.startsWith("/dashboard/delivery") &&
      role !== "DELIVERY"
    ) {
      return NextResponse.rewrite(new URL("/auth/login?message=You Are Not Authorized!", req.url));
    }
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
  }
);

export const config = { matcher: ["/dashboard/admin/:path*", "/checkout/:path*", "/dashboard/cliente/:path*", "/dashboard/aliado/:path*", "/dashboard/delivery/:path*"] };

