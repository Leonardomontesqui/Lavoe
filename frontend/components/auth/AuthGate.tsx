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
            <Button
              onClick={signInWithGoogle}
              className="min-w-[180px] h-10 bg-pink-500 text-white border-0 transition-all duration-200"
              style={{
                background: 'linear-gradient(90deg, #ec4899 0%, #ec4899 100%)',
              }}
              onMouseMove={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                const orangeIntensity = 0.8;
                const orangeColor = `hsl(25, 100%, 65%)`;
                e.currentTarget.style.background = `radial-gradient(circle at ${x}px ${y}px, ${orangeColor} 0%, #ec4899 70%)`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'linear-gradient(90deg, #ec4899 0%, #ec4899 100%)';
              }}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 533.5 544.3"
                className="w-4 h-4 mr-2"
                aria-hidden
              >
                <path fill="#4285F4" d="M533.5 278.4c0-18.6-1.5-37-4.6-54.8H272.1v103.8h146.9c-6.3 34.6-25.4 63.9-54 83.5v69.2h87.2c51 47 80.3 116.2 80.3 196.5 0 20.9-1.9 41.3-5.6 61H533.5V278.4z"/>
                <path fill="#34A853" d="M272.1 544.3c73.2 0 134.7-24.2 179.6-65.6l-87.2-69.2c-24.3 16.3-55.3 25.8-92.4 25.8-71 0-131.2-47.9-152.8-112.1H28.6v70.4C73.8 492.6 167.6 544.3 272.1 544.3z"/>
                <path fill="#FBBC05" d="M119.3 323.2c-10.9-32.8-10.9-68.3 0-101.1v-70.4H28.6c-37.8 75.2-37.8 166.7 0 241.9l90.7-70.4z"/>
                <path fill="#EA4335" d="M272.1 106.5c39.8-.6 78.1 14 107.1 41.3l80.1-80.1C408.7 23.6 343.8-.1 272.1 0 167.6 0 73.8 51.7 28.6 149.3l90.7 70.4C140.9 154.9 201.1 106.5 272.1 106.5z"/>
              </svg>
              Continue with Google
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
