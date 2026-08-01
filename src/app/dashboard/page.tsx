import { redirect } from "next/navigation"

// /dashboard now redirects to / (Command Center)
export default function DashboardRedirect() {
  redirect("/")
}
