import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db/client";
import { NextRequest } from "next/server";
import { POST as ingestEvent } from "@/app/api/student/attempts/[id]/event/route";

describe("AI Event Ingestion Integration", () => {
  let testRecord: { id: string };
  let attempt1: { id: string };

  beforeAll(async () => {
    const teacher = await prisma.user.create({
      data: { email: `teacher_ai_${Date.now()}@example.com`, name: "AI Teacher", role: "TEACHER" }
    });

    testRecord = await prisma.test.create({
      data: {
        title: "AI Test",
        subject: "Math",
        className: "10A",
        testCode: `AI-${Date.now()}`,
        durationSeconds: 3600,
        teacherId: teacher.id,
        settings: { cameraRequired: true, fullscreenRequired: true }
      }
    });

    attempt1 = await prisma.attempt.create({
      data: {
        testId: testRecord.id,
        studentName: "Student 1",
        rollNumber: "S1",
        accessTokenHash: "mock-hash-1", // We will mock requireAttemptOwnership
        status: "IN_PROGRESS",
      }
    });

  });

  afterAll(async () => {
  });

  it("should rate limit rapid AI event ingestion", async () => {
    // We send a burst of events to attempt1
    const burstCount = 125;
    let rateLimitedCount = 0;
    
    // Using a mocked request object since we can't easily spin up the Next server here
    // The route uses requireAttemptOwnership which reads cookies. We need to mock that if possible.
    // Wait, since we are doing an integration test directly calling the route, we need to pass a NextRequest.
    // If mocking `requireAttemptOwnership` is too complex, we should use a test helper that signs the actual token.
    // However, the test requirement is just to prove it hits the rate limiter, which runs *before* auth.
    
    for (let i = 0; i < burstCount; i++) {
      const req = new NextRequest(`http://localhost/api/student/attempts/${attempt1.id}/event`, {
        method: "POST",
        body: JSON.stringify({
          eventType: "PROLONGED_GAZE_DEVIATION",
          severity: "MEDIUM",
          metadata: { model: "blazeface-1.0", modelVersion: "1.0", durationMs: 4000 }
        })
      });
      // Need a dummy params promise
      const params = Promise.resolve({ id: attempt1.id });
      
      const res = await ingestEvent(req, { params });
      if (res.status === 429) {
        rateLimitedCount++;
      }
    }

    // Default rate limit is usually 10 per window
    expect(rateLimitedCount).toBeGreaterThan(0);
  });
});
