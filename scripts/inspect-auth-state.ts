import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const proctorUser = await prisma.user.findUnique({
    where: { email: "teacher@proctor-ed.dev" },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      neonAuthUserId: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const tables = await prisma.$queryRawUnsafe<
    Array<{ table_schema: string; table_name: string }>
  >(
    "select table_schema, table_name from information_schema.tables where table_schema not in ('pg_catalog','information_schema') order by table_schema, table_name"
  );

  const authUserColumns = await prisma.$queryRawUnsafe<
    Array<{ column_name: string; data_type: string }>
  >(
    "select column_name, data_type from information_schema.columns where table_schema = 'neon_auth' and table_name = 'user' order by ordinal_position"
  );

  const authUser = await prisma.$queryRawUnsafe(
    'select * from neon_auth."user" where lower(email) = lower($1)',
    "teacher@proctor-ed.dev"
  );

  console.log(JSON.stringify({ proctorUser, tables, authUserColumns, authUser }, null, 2));
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
