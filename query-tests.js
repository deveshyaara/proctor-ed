const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.test.findMany().then(tests => {
  console.log(tests);
  prisma.$disconnect();
});
