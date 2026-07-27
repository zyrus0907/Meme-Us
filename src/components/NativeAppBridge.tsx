"use client";

import { useEffect } from "react";
import { App, type URLOpenListenerEvent } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { StatusBar, Style } from "@capacitor/status-bar";
import type { PluginListenerHandle } from "@capacitor/core";
import { createClient } from "@/lib/supabase/client";
import { isNativeApp } from "@/lib/native";

export function NativeAppBridge() {
  useEffect(() => {
    if (!isNativeApp()) return;

    let urlListener: PluginListenerHandle | undefined;
    let active = true;

    const handleAuthCallback = async ({ url }: URLOpenListenerEvent) => {
      if (!url.startsWith("memeus://auth/callback")) return;

      try {
        const callbackUrl = new URL(url);
        const code = callbackUrl.searchParams.get("code");
        const oauthError = callbackUrl.searchParams.get("error_description");
        if (oauthError) throw new Error(oauthError);
        if (!code) throw new Error("The sign-in callback did not include a code.");

        const supabase = createClient();
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) throw error;

        await Browser.close().catch(() => undefined);
        window.location.replace("/");
      } catch (error) {
        console.error("Native OAuth callback failed:", error);
        await Browser.close().catch(() => undefined);
        window.location.replace("/login?error=auth_failed");
      }
    };

    void StatusBar.setStyle({ style: Style.Dark }).catch(() => undefined);
    void App.addListener("appUrlOpen", handleAuthCallback).then((listener) => {
      if (active) urlListener = listener;
      else void listener.remove();
    });

    return () => {
      active = false;
      void urlListener?.remove();
    };
  }, []);

  return null;
}
