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

interface OnboardingFlowProps {
  open: boolean;
  onComplete: () => void;
  onSignIn: () => void;
}

const onboardingSteps = [
  {
    title: "Lavoe",
    subtitle: "Generate any beat with AI",
    description:
      "Create professional-quality beats instantly with our advanced AI technology. From hip-hop to electronic, bring your musical vision to life.",
  },
  {
    title: "Lavoe",
    subtitle: "Agentic audio editing",
    description:
      "Let AI intelligently edit your tracks. Our agent understands music structure and can make smart edits, cuts, and arrangements automatically.",
  },
  {
    title: "Lavoe",
    subtitle: "Agentic beat manipulation",
    description:
      "Transform your beats with AI-powered controls. Change tempo, add effects, and manipulate rhythms with intelligent automation.",
  },
  {
    title: "Lavoe",
    subtitle: "Standard DAW capabilities",
    description:
      "Full digital audio workstation features. Record, edit, mix, and master your music with professional tools and intuitive interface.",
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
        className="max-w-2xl"
      >
        <DialogHeader className="text-center space-y-6">
          <DialogTitle className="font-pp-editorial text-4xl text-foreground font-normal">
            {currentStepData.title}
          </DialogTitle>
          <DialogDescription className="text-xl text-foreground font-medium">
            {currentStepData.subtitle}
          </DialogDescription>
          <p className="text-muted-foreground text-sm leading-relaxed max-w-md mx-auto">
            {currentStepData.description}
          </p>
        </DialogHeader>

        {/* Video Placeholder */}
        <div className="w-full bg-muted rounded-lg aspect-video border border-border flex items-center justify-center shadow-sm">
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
            className="min-w-[100px]"
          >
            Back
          </Button>
          <Button onClick={handleNext} className="min-w-[100px]">
            {isLastStep ? "Sign in with Google" : "Next"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
