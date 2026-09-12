import { requireTeacher } from "@/lib/auth/helpers";
import { DashboardShell } from "@/components/teacher/DashboardShell";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireTeacher();

  return (
    <DashboardShell userName={session.user.name ?? "Teacher"}>
      {children}
    </DashboardShell>
  );
}
