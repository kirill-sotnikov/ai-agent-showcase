import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import type { ReactNode } from "react";
import { AppShell } from "../components/app-shell";
import { palette } from "../theme";
import "../styles.css";
import { WorkspaceProvider } from "../workspace";

export const metadata: Metadata = {
  title: "AI Agent",
  description: "AI Agent showcase - Your personal shopping assistant",
};

export const viewport: Viewport = { themeColor: palette.canvas };

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
