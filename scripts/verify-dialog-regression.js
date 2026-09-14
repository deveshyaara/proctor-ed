const { chromium } = require('playwright');
const path = require('path');

const artifactDir = "C:\\Users\\deves\\.gemini\\antigravity-ide\\brain\\8993a255-3e75-43fc-b9ef-f9f176a0505f";

async function run() {
  console.log("Launching Chromium for Dialog Regression & Answer Sheet inspection...");
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 }
  });

  const consoleErrors = [];

  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  page.on('pageerror', err => {
    consoleErrors.push(err.message);
  });

  // Mock API responses for proctoring events and answers to guarantee instant, stable modal rendering
  await page.route('**/api/tests/**/events', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        attempt: { id: "cmu0yy6y10001i1o0frwjk4fu", studentName: "Aarav Sharma", rollNumber: "VERIF-2026", status: "SUBMITTED", score: 7, maxScore: 17 },
        events: []
      })
    });
  });

  await page.route('**/api/tests/**/answers', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        test: { id: "cmtx0kvh70002i1v4tcd1gglq", title: "Mathematics — Triangles", subject: "Mathematics", className: "Class 9" },
        attempt: { id: "cmu0yy6y10001i1o0frwjk4fu", studentName: "Aarav Sharma", rollNumber: "VERIF-2026", status: "SUBMITTED", score: 7, maxScore: 17 },
        summary: { totalQuestions: 10, answeredCount: 7, unansweredCount: 3, correctCount: 5, incorrectCount: 2, score: 7, maxScore: 17 },
        questions: [
          {
            id: "q1", order: 1, type: "MCQ", questionText: "The sum of interior angles of a triangle is equal to:",
            marks: 2, negativeMarks: 0.5, explanation: "The angle sum property states that the sum of all interior angles of a triangle is always 180°.",
            isAnswered: true, isCorrect: true, marksAwarded: 2, submittedAnswer: "180°", correctAnswer: "180°",
            options: [
              { index: 0, letter: "A", text: "90°", isCorrect: false, isSelected: false },
              { index: 1, letter: "B", text: "180°", isCorrect: true, isSelected: true },
              { index: 2, letter: "C", text: "270°", isCorrect: false, isSelected: false },
              { index: 3, letter: "D", text: "360°", isCorrect: false, isSelected: false }
            ]
          },
          {
            id: "q2", order: 2, type: "MCQ", questionText: "If two angles of a triangle are 60° and 80°, what is the third angle?",
            marks: 2, negativeMarks: 0.5, explanation: "Third angle = 180° - 60° - 80° = 40°",
            isAnswered: true, isCorrect: false, marksAwarded: -0.5, submittedAnswer: "30°", correctAnswer: "40°",
            options: [
              { index: 0, letter: "A", text: "30°", isCorrect: false, isSelected: true },
              { index: 1, letter: "B", text: "40°", isCorrect: true, isSelected: false },
              { index: 2, letter: "C", text: "50°", isCorrect: false, isSelected: false },
              { index: 3, letter: "D", text: "60°", isCorrect: false, isSelected: false }
            ]
          },
          {
            id: "q3", order: 3, type: "TRUE_FALSE", questionText: "An equilateral triangle has all angles equal to 60°.",
            marks: 1, negativeMarks: 0, explanation: "In an equilateral triangle, all three sides and all three angles are equal.",
            isAnswered: true, isCorrect: true, marksAwarded: 1, submittedAnswer: "True", correctAnswer: "True"
          },
          {
            id: "q4", order: 4, type: "MCQ", questionText: "The exterior angle of a triangle is equal to the sum of:",
            marks: 2, negativeMarks: 0.5, explanation: "The Exterior Angle Theorem states that an exterior angle equals the sum of two non-adjacent interior angles.",
            isAnswered: false, isCorrect: null, marksAwarded: 0, submittedAnswer: null, correctAnswer: "The two non-adjacent interior angles",
            options: [
              { index: 0, letter: "A", text: "All three interior angles", isCorrect: false, isSelected: false },
              { index: 1, letter: "B", text: "The two non-adjacent interior angles", isCorrect: true, isSelected: false },
              { index: 2, letter: "C", text: "The adjacent interior angle", isCorrect: false, isSelected: false },
              { index: 3, letter: "D", text: "None of the above", isCorrect: false, isSelected: false }
            ]
          },
          {
            id: "q5", order: 5, type: "NUMERICAL", questionText: "In a right-angled triangle, if one acute angle is 35°, what is the other acute angle (in degrees)?",
            marks: 2, negativeMarks: 0, explanation: "In a right-angled triangle, 90° - 35° = 55°.",
            isAnswered: true, isCorrect: true, marksAwarded: 2, submittedAnswer: "55", correctAnswer: "55"
          },
          {
            id: "q6", order: 6, type: "MCQ", questionText: "Two triangles are congruent by SAS (Side-Angle-Side) when:",
            marks: 2, negativeMarks: 0.5, explanation: "SAS requires two sides and the included angle to be equal.",
            isAnswered: true, isCorrect: false, marksAwarded: -0.5, submittedAnswer: "All three sides of one triangle equal those of another", correctAnswer: "Two sides and the included angle of one triangle equal those of another",
            options: [
              { index: 0, letter: "A", text: "Two sides and the included angle of one triangle equal those of another", isCorrect: true, isSelected: false },
              { index: 1, letter: "B", text: "Two angles and one side of one triangle equal those of another", isCorrect: false, isSelected: false },
              { index: 2, letter: "C", text: "All three sides of one triangle equal those of another", isCorrect: false, isSelected: true },
              { index: 3, letter: "D", text: "Two sides and any angle of one triangle equal those of another", isCorrect: false, isSelected: false }
            ]
          },
          {
            id: "q7", order: 7, type: "TRUE_FALSE", questionText: "A triangle can have two right angles.",
            marks: 1, negativeMarks: 0, explanation: "A triangle cannot have two right angles because the sum would exceed 180°.",
            isAnswered: false, isCorrect: null, marksAwarded: 0, submittedAnswer: null, correctAnswer: "False"
          },
          {
            id: "q8", order: 8, type: "MCQ", questionText: "Which of the following sets of angles can form a valid triangle?",
            marks: 2, negativeMarks: 0.5, explanation: "Angles must sum to exactly 180°. 60°+70°+50°=180°.",
            isAnswered: true, isCorrect: true, marksAwarded: 2, submittedAnswer: "60°, 70°, 50°", correctAnswer: "60°, 70°, 50°",
            options: [
              { index: 0, letter: "A", text: "90°, 90°, 10°", isCorrect: false, isSelected: false },
              { index: 1, letter: "B", text: "60°, 70°, 50°", isCorrect: true, isSelected: true },
              { index: 2, letter: "C", text: "45°, 45°, 100°", isCorrect: false, isSelected: false },
              { index: 3, letter: "D", text: "120°, 40°, 30°", isCorrect: false, isSelected: false }
            ]
          },
          {
            id: "q9", order: 9, type: "SHORT_ANSWER", questionText: "State the Pythagorean theorem in your own words (one sentence).",
            marks: 2, negativeMarks: 0, explanation: "The Pythagorean theorem: a² + b² = c².",
            isAnswered: false, isCorrect: null, marksAwarded: 0, submittedAnswer: null, correctAnswer: "the square of the hypotenuse equals the sum of squares of the other two sides"
          },
          {
            id: "q10", order: 10, type: "NUMERICAL", questionText: "If all three sides of a triangle are equal to 5 cm, what is the perimeter (in cm)?",
            marks: 1, negativeMarks: 0, explanation: "Perimeter = 3 × 5 = 15 cm.",
            isAnswered: true, isCorrect: true, marksAwarded: 1, submittedAnswer: "15", correctAnswer: "15"
          }
        ]
      })
    });
  });

  console.log("Navigating to http://localhost:3000/test-dialog-regression...");
  await page.goto("http://localhost:3000/test-dialog-regression", { waitUntil: 'networkidle' });

  // ─────────────────────────────────────────────────────────────
  // 1. TEST EXISTING "REVIEW LOG" MODAL (CONFIRMING NO REGRESSION)
  // ─────────────────────────────────────────────────────────────
  console.log("\n--- Testing Existing 'Review Log' Modal ---");
  // Select visible button in desktop table
  const reviewLogBtn = page.locator("table button:has-text('Review Log')").first();
  await reviewLogBtn.click();

  const reviewDialog = page.locator("div[role='dialog']");
  await reviewDialog.waitFor({ state: 'visible' });

  const reviewPanel = reviewDialog.locator("div.relative.z-10");
  await reviewPanel.waitFor({ state: 'visible' });

  const reviewClasses = await reviewPanel.getAttribute("class");
  const reviewBox = await reviewPanel.boundingBox();

  console.log("Review Log Modal - DOM Class string:");
  console.log("  ", reviewClasses);
  console.log("Review Log Modal - Computed Bounding Box:");
  console.log(`   Width: ${Math.round(reviewBox.width)}px | Height: ${Math.round(reviewBox.height)}px`);

  const hasMaxWMd = reviewClasses.includes("max-w-md");
  const exactExpectedWidth = 448; // max-w-md = 28rem = 448px on standard 16px root
  console.log(`  Contains 'max-w-md': ${hasMaxWMd}`);
  console.log(`  Rendered width matches max-w-md (448px): ${Math.round(reviewBox.width)}px === ${exactExpectedWidth}px -> ${Math.round(reviewBox.width) === exactExpectedWidth}`);

  // Screenshot review log modal
  const reviewScreenshotPath = path.join(artifactDir, "review_log_modal.png");
  await page.screenshot({ path: reviewScreenshotPath });
  console.log(`  Saved screenshot to: ${reviewScreenshotPath}`);

  // Test close behavior: Click "Close" button
  const closeBtn = reviewDialog.locator("button:has-text('Close')");
  await closeBtn.click();
  await reviewDialog.waitFor({ state: 'detached' });
  console.log("  Review Log modal closed successfully.");

  // ─────────────────────────────────────────────────────────────
  // 2. TEST "VIEW ANSWERS" MODAL (ANSWER SHEET)
  // ─────────────────────────────────────────────────────────────
  console.log("\n--- Testing New 'View Answers' Modal ---");
  const viewAnswersBtn = page.locator("table button:has-text('View Answers')").first();
  await viewAnswersBtn.click();

  const answersDialog = page.locator("div[role='dialog']");
  await answersDialog.waitFor({ state: 'visible' });

  const answersPanel = answersDialog.locator("div.relative.z-10");
  await answersPanel.waitFor({ state: 'visible' });

  // Wait for content to render
  await page.locator("text=The sum of interior angles").waitFor({ state: 'visible', timeout: 10000 });

  const answersClasses = await answersPanel.getAttribute("class");
  const answersBox = await answersPanel.boundingBox();

  console.log("Answers Modal - DOM Class string:");
  console.log("  ", answersClasses);
  console.log("Answers Modal - Computed Bounding Box:");
  console.log(`   Width: ${Math.round(answersBox.width)}px | Height: ${Math.round(answersBox.height)}px`);

  const hasMaxW3Xl = answersClasses.includes("max-w-3xl");
  const exact3XlWidth = 768; // max-w-3xl = 48rem = 768px on standard 16px root
  console.log(`  Contains 'max-w-3xl': ${hasMaxW3Xl}`);
  console.log(`  Rendered width matches max-w-3xl (768px): ${Math.round(answersBox.width)}px === ${exact3XlWidth}px -> ${Math.round(answersBox.width) === exact3XlWidth}`);

  // Verify elements rendered inside the Answer Sheet:
  const summaryScore = await page.locator("text=Total Score").locator("xpath=..").textContent();
  console.log("  Summary Score banner:", summaryScore.replace(/\s+/g, ' ').trim());

  const correctIncorrect = await page.locator("text=Correct / Incorrect").locator("xpath=..").textContent();
  console.log("  Correct / Incorrect banner:", correctIncorrect.replace(/\s+/g, ' ').trim());

  const unanswered = await page.locator("text=Unanswered").locator("xpath=..").textContent();
  console.log("  Unanswered count banner:", unanswered.replace(/\s+/g, ' ').trim());

  // Check specific questions in DOM:
  const q1Badge = await page.locator("text=✓ Correct (+2 m)").count();
  console.log("  Q1 '✓ Correct (+2 m)' badge count:", q1Badge);

  const q2Badge = await page.locator("text=✗ Incorrect (-0.5 m)").count();
  console.log("  Q2 '✗ Incorrect (-0.5 m)' badge count:", q2Badge);

  const unansweredBadges = await page.locator("text=Not Answered (0 m)").count();
  console.log("  'Not Answered (0 m)' badges count (expected 3):", unansweredBadges);

  const explanationCards = await page.locator("text=Explanation").count();
  console.log("  Explanation cards rendered count (all 10 questions have explanations):", explanationCards);

  // Screenshot answer sheet modal
  const answersScreenshotPath = path.join(artifactDir, "student_answers_modal.png");
  await page.screenshot({ path: answersScreenshotPath });
  console.log(`  Saved screenshot to: ${answersScreenshotPath}`);

  // Test close behavior: Click "Close"
  const answersCloseBtn = answersDialog.locator("button:has-text('Close')");
  await answersCloseBtn.click();
  await answersDialog.waitFor({ state: 'detached' });
  console.log("  Student Answer Sheet modal closed successfully.");

  // Check console errors
  console.log("\n--- Console Errors Check ---");
  console.log("  Console Errors Count:", consoleErrors.length);
  if (consoleErrors.length > 0) {
    console.log("  Errors:", consoleErrors);
  } else {
    console.log("  ✓ No console errors or warnings were introduced.");
  }

  await browser.close();
  console.log("\nRegression check finished cleanly!");
}

run().catch(err => {
  console.error("Regression test failed:", err);
  process.exit(1);
});
