"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { OnboardingFlow } from "./OnboardingFlow";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    let mounted = true;
    const init = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (!mounted) return;
        if (error) {
          setShowOnboarding(true);
        } else {
          if (!data.session) {
            setShowOnboarding(true);
          }
        }
      } catch (_e) {
        if (mounted) setShowOnboarding(true);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    init();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setShowOnboarding(false);
        setOpen(false);
      } else {
        setShowOnboarding(true);
      }
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signInWithGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo:
          typeof window !== "undefined" ? window.location.origin : undefined,
        // Uncomment if you need Google refresh tokens for later Google API access:
        // queryParams: { access_type: 'offline', prompt: 'consent' },
      },
    });
  };

  const handleOnboardingComplete = () => {
    setShowOnboarding(false);
    setOpen(true);
  };

  if (loading) return children as JSX.Element;

  return (
    <>
      {children}
      <OnboardingFlow
        open={showOnboarding}
        onComplete={handleOnboardingComplete}
        onSignIn={signInWithGoogle}
      />
      <Dialog open={open}>
        <DialogContent
          showCloseButton={false}
          onEscapeKeyDown={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Welcome to Lavoe</DialogTitle>
            <DialogDescription>
              You need to be signed in to use Lavoe. Sign in to access uploads
              and processing.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 justify-end">
            <Button onClick={signInWithGoogle}>Sign in with Google</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
