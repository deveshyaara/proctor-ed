import { test, expect } from "@playwright/test";

test.describe("Security and IDOR Protection", () => {
  test("operational health check returns valid JSON without leaking secrets", async ({ request }) => {
    const res = await request.get("/api/health");
    expect([200, 503]).toContain(res.status());

    const body = await res.json();
    expect(body).toHaveProperty("status");
    expect(body).toHaveProperty("timestamp");
    expect(body).toHaveProperty("checks");

    const bodyString = JSON.stringify(body);
    // Ensure no database URLs or credentials leaked
    expect(bodyString).not.toContain("postgresql://");
    expect(bodyString).not.toContain("password");
    expect(bodyString).not.toContain("secret");
  });

  test("rejects unauthorized access to student attempt answer sync", async ({ request }) => {
    const fakeAttemptId = "00000000-0000-0000-0000-000000000000";
    const res = await request.post(`/api/student/attempts/${fakeAttemptId}/answer`, {
      data: {
        questionId: "fake-q",
        answer: "A",
      },
    });

    // Without legitimate attempt ownership cookie, must be rejected
    expect([401, 403, 404]).toContain(res.status());
  });

  test("rejects unauthorized access to student attempt proctoring events", async ({ request }) => {
    const fakeAttemptId = "00000000-0000-0000-0000-000000000000";
    const res = await request.post(`/api/student/attempts/${fakeAttemptId}/event`, {
      data: {
        eventType: "TAB_SWITCH",
        timestamp: new Date().toISOString(),
      },
    });

    // Without legitimate attempt ownership cookie, must be rejected
    expect([401, 403, 404]).toContain(res.status());
  });

  test("rejects unauthenticated API test creation", async ({ request }) => {
    const res = await request.post("/api/tests", {
      data: {
        title: "Unauthorized Test",
        subject: "Physics",
        className: "10A",
        durationMinutes: 30,
      },
    });

    // Unauthenticated teacher actions must return 401 or redirect
    expect([401, 403, 302, 307]).toContain(res.status());
  });
});
