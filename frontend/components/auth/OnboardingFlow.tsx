"use client";

import { useState, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ppEditorialNew } from "@/lib/fonts";
import { Play } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobileLandingPage } from "./MobileLandingPage";

interface OnboardingFlowProps {
  open: boolean;
  onComplete: () => void;
  onSignIn: () => void;
}

const onboardingSteps = [
  {
    title: "Welcome to Lavoe",
    titleClassName: "flex items-center justify-center gap-2",
    subtitle: "Anyone can make music with AI",
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
  const [hasAudio, setHasAudio] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const isMobile = useIsMobile();
  const isLastStep = currentStep === onboardingSteps.length - 1;
  const isFirstStep = currentStep === 0;

  const handleNext = () => {
    if (isLastStep) {
      onSignIn();
    } else {
      setCurrentStep(currentStep + 1);
      setHasAudio(false);
      setIsPlaying(true);
    }
  };

  const handleBack = () => {
    if (!isFirstStep) {
      setCurrentStep(currentStep - 1);
      setHasAudio(false);
      setIsPlaying(true);
    }
  };

  const handleAudioClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (videoRef.current && !hasAudio) {
      videoRef.current.muted = false;
      setHasAudio(true);
    }
  };

  const handleVideoClick = () => {
    if (videoRef.current) {
      if (videoRef.current.paused) {
        videoRef.current.play();
        setIsPlaying(true);
      } else {
        videoRef.current.pause();
        setIsPlaying(false);
      }
    }
  };

  const currentStepData = onboardingSteps[currentStep];

  // Mobile: Show full screen landing page
  if (isMobile && open) {
    return <MobileLandingPage />;
  }

  // Desktop: Dialog modal
  return (
    <Dialog open={open}>
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        className="!w-[50vw] !max-w-4xl h-[650px] px-12 bg-[#151515] border-[#1a1a1a]"
      >
        <DialogHeader className="text-center space-y-3">
          {currentStep === 0 ? (
            <DialogTitle
              className={`${ppEditorialNew.className} text-5xl text-foreground font-normal flex items-center justify-center gap-2`}
            >
              <span>Welcome to</span>
              <span>Lavoe</span>
            </DialogTitle>
          ) : (
            <DialogTitle
              className={`${ppEditorialNew.className} text-5xl text-foreground font-normal text-center`}
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

        {/* Video Content */}
        <div className="w-full bg-muted rounded-lg border border-border flex items-center justify-center shadow-sm h-96 overflow-hidden relative">
          {currentStep === 0 ? (
            <>
              <video
                ref={videoRef}
                key="overall-demo"
                src="/overall-demo.mp4"
                autoPlay
                loop
                muted
                playsInline
                onClick={handleVideoClick}
                className="w-full h-full object-cover rounded-lg cursor-pointer"
              />
              {!hasAudio && (
                <div
                  className="absolute top-4 left-4 cursor-pointer z-10"
                  onClick={handleAudioClick}
                >
                  <div className="bg-black/60 backdrop-blur-sm rounded-lg px-4 py-2 hover:bg-black/80 transition-all">
                    <p className="text-white text-sm font-medium">
                      Click for audio
                    </p>
                  </div>
                </div>
              )}
              {!isPlaying && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="bg-black/50 backdrop-blur-sm rounded-full p-6">
                    <Play className="w-12 h-12 text-white fill-white" />
                  </div>
                </div>
              )}
            </>
          ) : currentStep === 1 ? (
            <>
              <video
                ref={videoRef}
                key="ai-generate"
                src="/ai-audio-generate.mp4"
                autoPlay
                loop
                muted
                playsInline
                onClick={handleVideoClick}
                className="w-full h-full object-cover rounded-lg cursor-pointer"
              />
              {!hasAudio && (
                <div
                  className="absolute top-4 left-4 cursor-pointer z-10"
                  onClick={handleAudioClick}
                >
                  <div className="bg-black/60 backdrop-blur-sm rounded-lg px-4 py-2 hover:bg-black/80 transition-all">
                    <p className="text-white text-sm font-medium">
                      Click for audio
                    </p>
                  </div>
                </div>
              )}
              {!isPlaying && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="bg-black/50 backdrop-blur-sm rounded-full p-6">
                    <Play className="w-12 h-12 text-white fill-white" />
                  </div>
                </div>
              )}
            </>
          ) : currentStep === 2 ? (
            <>
              <video
                ref={videoRef}
                key="agent-mode"
                src="/agent-mode.mp4"
                autoPlay
                loop
                muted
                playsInline
                onClick={handleVideoClick}
                className="w-full h-full object-cover rounded-lg cursor-pointer"
              />
              {!hasAudio && (
                <div
                  className="absolute top-4 left-4 cursor-pointer z-10"
                  onClick={handleAudioClick}
                >
                  <div className="bg-black/60 backdrop-blur-sm rounded-lg px-4 py-2 hover:bg-black/80 transition-all">
                    <p className="text-white text-sm font-medium">
                      Click for audio
                    </p>
                  </div>
                </div>
              )}
              {!isPlaying && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="bg-black/50 backdrop-blur-sm rounded-full p-6">
                    <Play className="w-12 h-12 text-white fill-white" />
                  </div>
                </div>
              )}
            </>
          ) : currentStep === 3 ? (
            <>
              <video
                ref={videoRef}
                key="overall-demo-2"
                src="/overall-demo.mp4"
                autoPlay
                loop
                muted
                playsInline
                onClick={handleVideoClick}
                className="w-full h-full object-cover rounded-lg cursor-pointer"
              />
              {!hasAudio && (
                <div
                  className="absolute top-4 left-4 cursor-pointer z-10"
                  onClick={handleAudioClick}
                >
                  <div className="bg-black/60 backdrop-blur-sm rounded-lg px-4 py-2 hover:bg-black/80 transition-all">
                    <p className="text-white text-sm font-medium">
                      Click for audio
                    </p>
                  </div>
                </div>
              )}
              {!isPlaying && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="bg-black/50 backdrop-blur-sm rounded-full p-6">
                    <Play className="w-12 h-12 text-white fill-white" />
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-muted-foreground text-sm opacity-60">
              Video placeholder
            </div>
          )}
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
                ? "min-w-[180px] h-10 bg-pink-500 text-white border-0 transition-all duration-200"
                : "min-w-[100px] bg-[#141414] text-foreground border border-border hover:bg-[#1a1a1a] transition-all"
            }
            style={isLastStep ? {
              background: 'linear-gradient(90deg, #ec4899 0%, #ec4899 100%)',
            } : undefined}
            onMouseMove={isLastStep ? (e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const x = e.clientX - rect.left;
              const y = e.clientY - rect.top;
              const orangeIntensity = 0.8;
              const orangeColor = `hsl(25, 100%, 65%)`;
              e.currentTarget.style.background = `radial-gradient(circle at ${x}px ${y}px, ${orangeColor} 0%, #ec4899 70%)`;
            } : undefined}
            onMouseLeave={isLastStep ? (e) => {
              e.currentTarget.style.background = 'linear-gradient(90deg, #ec4899 0%, #ec4899 100%)';
            } : undefined}
          >
            {isLastStep ? (
              <span className="inline-flex items-center">
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
                Sign in with Google
              </span>
            ) : (
              "Next"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
