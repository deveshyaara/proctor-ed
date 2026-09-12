// Prisma seed — development only
// Creates demo teacher, test, and sample questions.

import { PrismaClient, QuestionType, TestStatus } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...");

  // ── Demo Teacher (Reconciled on first Neon Auth login) ─────
  const teacher = await prisma.user.upsert({
    where: { email: "teacher@proctor-ed.dev" },
    update: {},
    create: {
      name: "Demo Teacher",
      email: "teacher@proctor-ed.dev",
      role: "TEACHER",
    },
  });

  await prisma.user.upsert({
    where: { email: "teacher@proctored.internal" },
    update: {},
    create: {
      name: "Lead Teacher",
      email: "teacher@proctored.internal",
      role: "TEACHER",
    },
  });

  console.log(`✅ Teachers: ${teacher.email}, teacher@proctored.internal`);

  // ── Demo Test ─────────────────────────────────────────────
  const defaultSettings = {
    cameraRequired: true,
    fullscreenRequired: true,
    tabSwitchDetection: true,
    warningLimit: 3,
    autoSubmitOnExpiry: true,
    showResultImmediately: true,
    showCorrectAnswers: false,
    randomizeQuestions: false,
    randomizeOptions: false,
  };

  const test = await prisma.test.upsert({
    where: { testCode: "MATH7284" },
    update: {},
    create: {
      teacherId: teacher.id,
      title: "Mathematics — Triangles",
      subject: "Mathematics",
      className: "Class 9",
      description:
        "A comprehensive test on triangle properties, angle sum property, and congruence.",
      testCode: "MATH7284",
      durationSeconds: 2700, // 45 minutes
      status: TestStatus.PUBLISHED,
      maxAttempts: 1,
      settings: defaultSettings,
      publishedAt: new Date(),
    },
  });

  console.log(`✅ Test: ${test.title} (Code: ${test.testCode})`);

  // ── Sample Questions ──────────────────────────────────────
  const questions = [
    {
      type: QuestionType.MCQ,
      questionText:
        "The sum of interior angles of a triangle is equal to:",
      options: ["90°", "180°", "270°", "360°"],
      correctAnswer: "1", // index of correct option
      marks: 2,
      negativeMarks: 0.5,
      order: 1,
      explanation: "The angle sum property states that the sum of all interior angles of a triangle is always 180°.",
    },
    {
      type: QuestionType.MCQ,
      questionText:
        "If two angles of a triangle are 60° and 80°, what is the third angle?",
      options: ["30°", "40°", "50°", "60°"],
      correctAnswer: "1", // 40°
      marks: 2,
      negativeMarks: 0.5,
      order: 2,
      explanation: "Third angle = 180° - 60° - 80° = 40°",
    },
    {
      type: QuestionType.TRUE_FALSE,
      questionText:
        "An equilateral triangle has all angles equal to 60°.",
      options: ["True", "False"],
      correctAnswer: "0", // True
      marks: 1,
      negativeMarks: 0,
      order: 3,
      explanation: "In an equilateral triangle, all three sides and all three angles are equal. Each angle = 180°/3 = 60°.",
    },
    {
      type: QuestionType.MCQ,
      questionText:
        "The exterior angle of a triangle is equal to the sum of:",
      options: [
        "All three interior angles",
        "The two non-adjacent interior angles",
        "The adjacent interior angle",
        "None of the above",
      ],
      correctAnswer: "1",
      marks: 2,
      negativeMarks: 0.5,
      order: 4,
      explanation: "The Exterior Angle Theorem states that an exterior angle of a triangle equals the sum of the two non-adjacent (remote) interior angles.",
    },
    {
      type: QuestionType.NUMERICAL,
      questionText:
        "In a right-angled triangle, if one acute angle is 35°, what is the other acute angle (in degrees)?",
      options: null,
      correctAnswer: "55",
      marks: 2,
      negativeMarks: 0,
      order: 5,
      explanation: "In a right-angled triangle, one angle is 90°. The other two angles sum to 90°. So 90° - 35° = 55°.",
    },
    {
      type: QuestionType.MCQ,
      questionText:
        "Two triangles are congruent by SAS (Side-Angle-Side) when:",
      options: [
        "Two sides and the included angle of one triangle equal those of another",
        "Two angles and one side of one triangle equal those of another",
        "All three sides of one triangle equal those of another",
        "Two sides and any angle of one triangle equal those of another",
      ],
      correctAnswer: "0",
      marks: 2,
      negativeMarks: 0.5,
      order: 6,
      explanation: "SAS congruence requires two sides and the angle between (included angle) to be equal in both triangles.",
    },
    {
      type: QuestionType.TRUE_FALSE,
      questionText:
        "A triangle can have two right angles.",
      options: ["True", "False"],
      correctAnswer: "1", // False
      marks: 1,
      negativeMarks: 0,
      order: 7,
      explanation: "A triangle cannot have two right angles because the angle sum would then be at least 180° leaving 0° for the third angle, which is impossible.",
    },
    {
      type: QuestionType.MCQ,
      questionText:
        "Which of the following sets of angles can form a valid triangle?",
      options: ["90°, 90°, 10°", "60°, 70°, 50°", "45°, 45°, 100°", "120°, 40°, 30°"],
      correctAnswer: "1", // 60+70+50=180
      marks: 2,
      negativeMarks: 0.5,
      order: 8,
      explanation: "A valid triangle requires all angles to sum to exactly 180°. 60°+70°+50°=180°.",
    },
    {
      type: QuestionType.SHORT_ANSWER,
      questionText:
        "State the Pythagorean theorem in your own words (one sentence).",
      options: null,
      correctAnswer: "the square of the hypotenuse equals the sum of squares of the other two sides",
      marks: 2,
      negativeMarks: 0,
      order: 9,
      explanation: "The Pythagorean theorem: a² + b² = c², where c is the hypotenuse.",
    },
    {
      type: QuestionType.NUMERICAL,
      questionText:
        "If all three sides of a triangle are equal to 5 cm, what is the perimeter (in cm)?",
      options: null,
      correctAnswer: "15",
      marks: 1,
      negativeMarks: 0,
      order: 10,
      explanation: "Perimeter of equilateral triangle = 3 × side = 3 × 5 = 15 cm.",
    },
  ];

  // Delete existing questions for this test before re-seeding
  await prisma.question.deleteMany({ where: { testId: test.id } });

  for (const q of questions) {
    await prisma.question.create({
      data: {
        testId: test.id,
        type: q.type,
        questionText: q.questionText,
        options: q.options ? q.options : undefined,
        correctAnswer: q.correctAnswer,
        marks: q.marks,
        negativeMarks: q.negativeMarks,
        order: q.order,
        explanation: q.explanation,
      },
    });
  }

  console.log(`✅ Created ${questions.length} questions`);
  console.log("\n🎉 Seed complete!");
  console.log("\n─────────────────────────────────────────");
  console.log("  Teacher records created for controlled Neon Auth binding:");
  console.log("  Emails:   teacher@proctor-ed.dev, teacher@proctored.internal");
  console.log("  Bind each verified Neon user ID with: npm run auth:bind-neon-user -- --email <email> --neon-user-id <id>");
  console.log("\n  Test code: MATH7284");
  console.log("─────────────────────────────────────────\n");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
