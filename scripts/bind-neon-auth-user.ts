import { prisma } from "../lib/db/client";

function usage(): never {
  throw new Error(
    "Usage: npm run auth:bind-neon-user -- --email <teacher-email> --neon-user-id <neon-id>"
  );
}

function argument(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value || value.startsWith("--")) usage();
  return value;
}

async function main() {
  const email = argument("--email").trim().toLowerCase();
  const neonAuthUserId = argument("--neon-user-id").trim();

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error(`No ProctorED user exists for ${email}.`);

  if (user.neonAuthUserId && user.neonAuthUserId !== neonAuthUserId) {
    throw new Error("This ProctorED user is already bound to a different Neon identity.");
  }

  const existingIdentity = await prisma.user.findUnique({
    where: { neonAuthUserId },
    select: { id: true, email: true },
  });
  if (existingIdentity && existingIdentity.id !== user.id) {
    throw new Error(`This Neon identity is already bound to ${existingIdentity.email}.`);
  }

  if (!user.neonAuthUserId) {
    const bound = await prisma.user.updateMany({
      where: { id: user.id, neonAuthUserId: null },
      data: { neonAuthUserId },
    });
    if (bound.count !== 1) {
      throw new Error("Binding changed concurrently; re-run after verifying the existing identity.");
    }
  }

  console.log(`Bound ${email} to Neon identity ${neonAuthUserId}.`);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
