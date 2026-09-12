import { PrismaClient } from "@prisma/client";
import "@/lib/config/env";

// Prevent multiple Prisma Client instances in development due to hot reloading.
// In production, one instance is created and reused.

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "warn", "error"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
