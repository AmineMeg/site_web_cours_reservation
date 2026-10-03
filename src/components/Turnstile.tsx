"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";
import { accountText } from "@/lib/i18n/account";

interface TurnstileApi {
  render(container: HTMLElement, options: { sitekey: string; action: string; "error-callback": () => void }): string;
  remove(widgetId: string): void;
}

declare global {
  interface Window { turnstile?: TurnstileApi }
}

export function Turnstile({ action }: { action: "login" | "reset" }) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const container = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const [failed, setFailed] = useState(false);
  const mount = useCallback(() => {
    if (siteKey && container.current && window.turnstile && !widget.current) {
      widget.current = window.turnstile.render(container.current, {
        sitekey: siteKey,
        action,
        "error-callback": () => setFailed(true),
      });
    }
  }, [action, siteKey]);
  useEffect(() => {
    mount();
    return () => {
      if (widget.current && window.turnstile) window.turnstile.remove(widget.current);
      widget.current = null;
    };
  }, [mount]);
  if (!siteKey) return null;
  return (
    <>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        onReady={mount} onError={() => setFailed(true)} />
      <div ref={container} />
      {failed && <p role="alert" className="text-red-700">{accountText.challengeFailed}</p>}
    </>
  );
}
