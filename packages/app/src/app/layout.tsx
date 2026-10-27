import "./globals.css";
import { type Metadata } from "next";
import { type ReactNode } from "react";
import { AppStoreProvider } from "../components/app-store-provider";

export const metadata: Metadata = {
  title: "AI Agent Showcase",
  description: "AI shopping assistant demo.",
};

interface RootLayoutProps {
  readonly children: ReactNode;
}

const RootLayout = ({ children }: RootLayoutProps) => {
  return (
    <html lang="en">
      <body>
        <AppStoreProvider>{children}</AppStoreProvider>
      </body>
    </html>
  );
};

export default RootLayout;
