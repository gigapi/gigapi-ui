import React from "react";
import AppHeader, {
  type BreadcrumbItem,
} from "@/components/navigation/AppHeader";

interface AppLayoutProps {
  breadcrumbs: BreadcrumbItem[];
  actions?: React.ReactNode;
  showDatabaseControls?: boolean;
  children: React.ReactNode;
  className?: string;
}

export default function AppLayout({
  breadcrumbs,
  actions,
  showDatabaseControls = true,
  children,
  className = "",
}: AppLayoutProps) {
  return (
    <div className="flex flex-col h-screen">
      <AppHeader
        breadcrumbs={breadcrumbs}
        actions={actions}
        showDatabaseControls={showDatabaseControls}
      />
      <main className={`flex-1 overflow-hidden ${className}`}>{children}</main>
    </div>
  );
}
