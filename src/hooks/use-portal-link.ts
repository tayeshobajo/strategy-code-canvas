import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { checkPortalAccess } from "@/lib/portal.functions";
import type { User } from "@supabase/supabase-js";

export type PortalLinkState = "loading" | "error" | "ready";

export type PortalLink = {
  to: "/portal/home" | "/portal/login";
  label: "Client Portal" | "Go to Portal";
  state: PortalLinkState;
  ready: boolean;
};

export function usePortalLink(): PortalLink {
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const checkAccess = useServerFn(checkPortalAccess);

  useEffect(() => {
    supabase.auth.getUser().then(({ data, error }) => {
      setUser(error ? null : data.user);
      setAuthChecked(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
      setAuthChecked(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["portal", "nav-access", user?.id],
    queryFn: () => checkAccess({}),
    enabled: !!user,
    staleTime: 60 * 1000,
    retry: 1,
  });

  if (!authChecked || (!!user && isLoading)) {
    return { to: "/portal/login", label: "Client Portal", state: "loading", ready: false };
  }

  if (isError) {
    return { to: "/portal/login", label: "Client Portal", state: "error", ready: true };
  }

  if (user && data?.status === "active") {
    return { to: "/portal/home", label: "Go to Portal", state: "ready", ready: true };
  }

  return { to: "/portal/login", label: "Client Portal", state: "ready", ready: true };
}
