import { renderDashboardPage } from "@/components/dashboard/page-renderer";

export const dynamic = "force-dynamic";

export default function Home() {
  return renderDashboardPage("overview");
}
