import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import prisma from "@/lib/prisma";
import bcrypt from "bcrypt";
import type { AuthOptions } from "next-auth";
import { randomBytes } from "crypto";
import { isStrongPassword } from "@/lib/password";

const googleEnabled = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

// Ensure we always have a secret to prevent runtime crashes when
// NEXTAUTH_SECRET is missing or empty in the environment (common cause
// of server-side exceptions on public pages). In production, this will
// log a warning and use an ephemeral secret so the site stays online.
// For proper session persistence across restarts, set NEXTAUTH_SECRET.
const derivedSecret = (() => {
  const envSecret = (process.env.NEXTAUTH_SECRET || "").trim();
  if (envSecret) return envSecret;
  const fallback = randomBytes(32).toString("hex");
  if (process.env.NODE_ENV === "production") {
    console.warn(
      "[auth] NEXTAUTH_SECRET is not set. Using an ephemeral fallback secret. " +
        "Set NEXTAUTH_SECRET in your environment for stable sessions."
    );
  }
  return fallback;
})();

export const authOptions: AuthOptions = {
  secret: derivedSecret,
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        // Ensure DB has ally profile columns to avoid runtime errors on SELECT *
        try {
          await prisma.$executeRawUnsafe(
            'ALTER TABLE "public"."User" ' +
            'ADD COLUMN IF NOT EXISTS "profileImageUrl" TEXT, ' +
            'ADD COLUMN IF NOT EXISTS "bio" TEXT, ' +
            'ADD COLUMN IF NOT EXISTS "services" TEXT[], ' +
            'ADD COLUMN IF NOT EXISTS "portfolioUrls" TEXT[], ' +
            'ADD COLUMN IF NOT EXISTS "portfolioText" TEXT'
          );
        } catch {}
        if (!credentials?.email || !credentials.password) {
          return null;
        }

        const loginEmail = String(credentials.email || '').trim().toLowerCase();
        const user = await prisma.user.findUnique({
          where: { email: loginEmail },
        });

        if (!user) {
          return null;
        }

        // Allow one-time bootstrap of password for privileged roles if empty/legacy
        // This helps when admins promote a user (e.g., to ALIADO) that was created without a password.
        if ((!user.password || !user.password.trim()) && user.role !== 'CLIENTE') {
          const newPwd = String(credentials.password || '').trim();
          if (isStrongPassword(newPwd)) {
            const hashed = await bcrypt.hash(newPwd, 10);
            await prisma.user.update({ where: { id: user.id }, data: { password: hashed } });
            user.password = hashed;
          } else {
            return null;
          }
        }

        const isValid = user.password ? await bcrypt.compare(credentials.password, user.password) : false;
        // Optional email verification enforcement (disabled by default)
        const enforceVerification = /^(1|true|yes)$/i.test(String(process.env.ENFORCE_EMAIL_VERIFICATION || '').trim());
        const roleNeedsVerification = user.role === 'CLIENTE' || user.role === 'ALIADO' || user.role === 'DELIVERY';
        if (enforceVerification && roleNeedsVerification && isValid && !(user as any).emailVerifiedAt) {
          return null;
        }

        if (isValid) {
          return {
            id: user.id,
            email: user.email,
            name: user.name || undefined,
            role: user.role,
            alliedStatus: user.alliedStatus,
          } as any;
        }

        return null;
      },
    }),
    ...(googleEnabled
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID as string,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
          }),
        ]
      : []),
  ],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async jwt({ token, user, account }: any) {
      // Ensure DB has ally profile columns for any user lookups
      try {
        await prisma.$executeRawUnsafe(
          'ALTER TABLE "public"."User" ' +
          'ADD COLUMN IF NOT EXISTS "profileImageUrl" TEXT, ' +
          'ADD COLUMN IF NOT EXISTS "bio" TEXT, ' +
          'ADD COLUMN IF NOT EXISTS "services" TEXT[], ' +
          'ADD COLUMN IF NOT EXISTS "portfolioUrls" TEXT[], ' +
          'ADD COLUMN IF NOT EXISTS "portfolioText" TEXT'
        );
      } catch {}
      // On initial sign-in, populate the token
      if (user) {
        // If signing in with Google, ensure we have a local User record
        if (account?.provider === "google") {
          const email = (user as any)?.email as string | undefined;
          if (email) {
            const emailLc = String(email).trim().toLowerCase();
            let dbUser = await prisma.user.findUnique({ where: { email: emailLc } });
            if (!dbUser) {
              const rawPassword = randomBytes(16).toString("hex");
              const hashed = await bcrypt.hash(rawPassword, 10);
              dbUser = await prisma.user.create({
                data: {
                  email: emailLc,
                  name: (user as any)?.name || undefined,
                  password: hashed,
                  emailVerifiedAt: new Date(),
                  // role and alliedStatus use schema defaults
                },
              });
            } else if (!(dbUser as any).emailVerifiedAt) {
              dbUser = await prisma.user.update({
                where: { id: dbUser.id },
                data: {
                  emailVerifiedAt: new Date(),
                  emailVerificationToken: null,
                  emailVerificationTokenExpiresAt: null,
                },
              });
            }
            token.id = dbUser.id;
            token.role = dbUser.role;
            token.alliedStatus = dbUser.alliedStatus;
            (token as any).emailVerified = Boolean((dbUser as any).emailVerifiedAt);
          }
        } else {
          // Credentials provider path
          token.id = (user as any).id;
          token.role = (user as any).role;
          token.alliedStatus = (user as any).alliedStatus;
          (token as any).emailVerified = Boolean((user as any).emailVerifiedAt);
        }
      }

      // On subsequent requests, check if the user still exists in the database
      // If not, invalidate the token by returning an empty object
      if (token.id) {
        const dbUser = await prisma.user.findUnique({ where: { id: token.id } });
        if (!dbUser) {
          return {}; // Invalidate token by returning an empty object
        }
        // Optional email verification enforcement (disabled by default)
        const enforceVerification = /^(1|true|yes)$/i.test(String(process.env.ENFORCE_EMAIL_VERIFICATION || '').trim());
        const roleNeedsVerification = (dbUser as any).role === 'CLIENTE' || (dbUser as any).role === 'ALIADO' || (dbUser as any).role === 'DELIVERY';
        if (enforceVerification && roleNeedsVerification && !(dbUser as any).emailVerifiedAt) {
          return {};
        }
        // Always propagate latest verification status to token
        (token as any).emailVerified = Boolean((dbUser as any).emailVerifiedAt);
        // Also keep role and alliedStatus in sync so UI reflects admin changes immediately
        token.role = (dbUser as any).role;
        token.alliedStatus = (dbUser as any).alliedStatus;
      }

      return token;
    },
    async session({ session, token }: any) {
      // If the token is valid and has an ID, pass the user info to the session object
      if (token && session.user) {
        (session.user as any).id = token.id;
        (session.user as any).role = token.role;
        (session.user as any).alliedStatus = token.alliedStatus;
        (session.user as any).emailVerified = (token as any).emailVerified === true;
      }
      return session;
    },
  },
  pages: {
    signIn: "/auth/login",
  },
};
