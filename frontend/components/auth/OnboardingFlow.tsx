"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ppEditorialNew } from "@/lib/fonts";

interface OnboardingFlowProps {
  open: boolean;
  onComplete: () => void;
  onSignIn: () => void;
}

const onboardingSteps = [
  {
    title: "Welcome to Lavoe",
    titleClassName: "flex items-center justify-center gap-2",
    subtitle: "Everyone should make music",
  },
  {
    title: "Generate beats with AI",
    subtitle: "Rock, reggaeton, jazz, imagination is the limit",
  },
  {
    title: "Agentic audio editing",
    subtitle: "Chop up the beats, change their speed, and duplicate",
  },
  {
    title: "Standard DAW capabilities",
    subtitle:
      "Import existing beats, record yourself, and the rest of standard DAW functions",
  },
];

export function OnboardingFlow({
  open,
  onComplete,
  onSignIn,
}: OnboardingFlowProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const isLastStep = currentStep === onboardingSteps.length - 1;
  const isFirstStep = currentStep === 0;

  const handleNext = () => {
    if (isLastStep) {
      onSignIn();
    } else {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (!isFirstStep) {
      setCurrentStep(currentStep - 1);
    }
  };

  const currentStepData = onboardingSteps[currentStep];

  return (
    <Dialog open={open}>
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        className="!w-[50vw] !max-w-4xl px-12 bg-[#151515] border-[#1a1a1a]"
      >
        <DialogHeader className="text-center space-y-3">
          {currentStep === 0 ? (
            <DialogTitle className="text-foreground font-normal flex items-center justify-center gap-2">
              <span className="text-4xl">Welcome to</span>
              <span className={`${ppEditorialNew.className} text-5xl`}>
                Lavoe
              </span>
            </DialogTitle>
          ) : (
            <DialogTitle
              className={`${ppEditorialNew.className} text-4xl text-foreground font-normal text-center`}
            >
              {currentStepData.title}
            </DialogTitle>
          )}
          {currentStepData.subtitle && (
            <DialogDescription className="text-base text-gray-400 font-normal text-center">
              {currentStepData.subtitle}
            </DialogDescription>
          )}
        </DialogHeader>

        {/* Video Placeholder */}
        <div className="w-full bg-muted rounded-lg border border-border flex items-center justify-center shadow-sm h-96">
          <div className="text-muted-foreground text-sm opacity-60">
            Video placeholder
          </div>
        </div>

        {/* Navigation */}
        <div className="flex justify-between pt-4">
          <Button
            variant="outline"
            onClick={handleBack}
            disabled={isFirstStep}
            className="min-w-[100px] bg-[#141414] border-border text-muted-foreground hover:bg-[#1a1a1a] hover:text-foreground transition-all"
          >
            Back
          </Button>
          <Button
            onClick={handleNext}
            className={
              isLastStep
                ? "min-w-[100px] bg-gradient-to-r from-pink-500 via-rose-500 to-orange-500 text-white border-0 hover:opacity-80 transition-all"
                : "min-w-[100px] bg-[#141414] text-foreground border border-border hover:bg-[#1a1a1a] transition-all"
            }
          >
            {isLastStep ? "Sign in" : "Next"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
