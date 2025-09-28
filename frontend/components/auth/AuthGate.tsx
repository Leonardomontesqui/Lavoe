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

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const init = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (!mounted) return;
        if (error) {
          setOpen(true);
        } else {
          setOpen(!data.session);
        }
      } catch (_e) {
        if (mounted) setOpen(true);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    init();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setOpen(!session);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signInWithMagicLink = async () => {
    const email = prompt("Enter your email to sign in");
    if (!email) return;
    await supabase.auth.signInWithOtp({ email });
    alert("Welcome to Lavoe");
  };

  if (loading) return children as JSX.Element;

  return (
    <>
      {children}
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
            <Button onClick={signInWithMagicLink}>Sign in with email</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
