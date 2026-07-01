import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { checkPortalAccess } from "@/lib/portal.functions";
import type { User } from "@supabase/supabase-js";

export function usePortalLink() {
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const checkAccess = useServerFn(checkPortalAccess);

  useEffect(() => {
    supabase.auth.getUser().then(({ data, error }) => {
      setUser(error ? null : data.user);
      setAuthChecked(true);
    });
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ["portal", "nav-access", user?.id],
    queryFn: () => checkAccess({}),
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  if (!authChecked || isLoading) {
    return { to: "/portal/login", label: "Client Portal", ready: false };
  }

  if (user && data?.hasAccess) {
    return { to: "/portal/home", label: "Go to Portal", ready: true };
  }

  return { to: "/portal/login", label: "Client Portal", ready: true };
}
