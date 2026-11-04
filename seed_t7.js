const { PrismaClient } = require('@prisma/client');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const bcrypt = require('bcrypt');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function seedUser(email, password, role = 'ADMIN') {
  const salt = await bcrypt.genSalt(10);
  const password_hash = await bcrypt.hash(password, salt);
  await prisma.ztteam_users.upsert({
    where: { email },
    update: { password_hash, role },
    create: { email, password_hash, role }
  });
  console.log(`User created/updated: ${email} / ${password}`);
}

async function main() {
  await seedUser('admin@t7.goxo.us', 'PasswordT7_2026!');
  await seedUser('trungseodn@gmail.com', 'password123');
  await seedUser('admin@example.com', 'password123');
  console.log('Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
