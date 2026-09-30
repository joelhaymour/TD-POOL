"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

declare global {
  interface Window {
    /** Called by the iPhone app's pull-to-refresh (MainViewController.swift). */
    __pooldRefresh?: () => void;
  }
}

/**
 * Pull down on any screen in the app to reload its data in place: the
 * screen stays put, and what you typed or opened stays with it.
 */
export function NativeRefresh() {
  const router = useRouter();
  useEffect(() => {
    window.__pooldRefresh = () => router.refresh();
    return () => {
      delete window.__pooldRefresh;
    };
  }, [router]);
  return null;
}
