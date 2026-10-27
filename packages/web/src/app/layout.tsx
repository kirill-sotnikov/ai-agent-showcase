import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import type { ReactNode } from "react";
import { AppShell } from "../components/app-shell";
import "../styles.css";
import { WorkspaceProvider } from "../workspace";

export const metadata: Metadata = {
  title: "AI Agent",
  description:
    "Your personal shopping assistant with a local catalog and verified cart changes.",
};

export const viewport: Viewport = { themeColor: "#f5f4ef" };

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  await connection();

  return (
    <html lang="en">
      <body>
        <WorkspaceProvider>
          <AppShell>{children}</AppShell>
        </WorkspaceProvider>
      </body>
    </html>
  );
}
