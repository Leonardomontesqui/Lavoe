"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { ppEditorialNew } from "@/lib/fonts";
import { Play, Maximize } from "lucide-react";

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

export function MobileLandingPage() {
  const [currentStep, setCurrentStep] = useState(0);
  const [hasAudio, setHasAudio] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const isLastStep = currentStep === onboardingSteps.length - 1;
  const isFirstStep = currentStep === 0;

  const handleNext = () => {
    if (!isLastStep) {
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

  const handleFullscreen = () => {
    if (videoRef.current) {
      if (videoRef.current.requestFullscreen) {
        videoRef.current.requestFullscreen();
      } else if ((videoRef.current as any).webkitRequestFullscreen) {
        (videoRef.current as any).webkitRequestFullscreen();
      } else if ((videoRef.current as any).mozRequestFullScreen) {
        (videoRef.current as any).mozRequestFullScreen();
      }
    }
  };

  const currentStepData = onboardingSteps[currentStep];

  return (
    <div className="fixed inset-0 z-50 bg-[#151515] overflow-hidden flex flex-col">
      <div className="flex-1 flex flex-col justify-center px-6 py-12">
        {/* Title and subtitle */}
        <div className="text-center space-y-4 mb-10">
          {currentStep === 0 ? (
            <h1
              className={`${ppEditorialNew.className} text-3xl text-foreground font-normal flex items-center justify-center gap-2`}
            >
              <span>Welcome to</span>
              <span>Lavoe</span>
            </h1>
          ) : (
            <h1
              className={`${ppEditorialNew.className} text-3xl text-foreground font-normal text-center`}
            >
              {currentStepData.title}
            </h1>
          )}
          {currentStepData.subtitle && (
            <p className="text-sm text-gray-400 font-normal text-center px-4">
              {currentStepData.subtitle}
            </p>
          )}
        </div>

        {/* Video Content */}
        <div className="w-full bg-muted rounded-lg border border-border flex items-center justify-center shadow-sm aspect-video overflow-hidden relative mb-10">
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
                  <div className="bg-black/60 backdrop-blur-sm rounded-lg px-3 py-1.5 hover:bg-black/80 transition-all">
                    <p className="text-white text-xs font-medium">
                      Click for audio
                    </p>
                  </div>
                </div>
              )}
              <div
                className="absolute top-4 right-4 cursor-pointer z-10"
                onClick={handleFullscreen}
              >
                <div className="bg-black/60 backdrop-blur-sm rounded-lg p-2 hover:bg-black/80 transition-all">
                  <Maximize className="w-4 h-4 text-white" />
                </div>
              </div>
              {!isPlaying && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="bg-black/50 backdrop-blur-sm rounded-full p-4">
                    <Play className="w-8 h-8 text-white fill-white" />
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
                  <div className="bg-black/60 backdrop-blur-sm rounded-lg px-3 py-1.5 hover:bg-black/80 transition-all">
                    <p className="text-white text-xs font-medium">
                      Click for audio
                    </p>
                  </div>
                </div>
              )}
              <div
                className="absolute top-4 right-4 cursor-pointer z-10"
                onClick={handleFullscreen}
              >
                <div className="bg-black/60 backdrop-blur-sm rounded-lg p-2 hover:bg-black/80 transition-all">
                  <Maximize className="w-4 h-4 text-white" />
                </div>
              </div>
              {!isPlaying && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="bg-black/50 backdrop-blur-sm rounded-full p-4">
                    <Play className="w-8 h-8 text-white fill-white" />
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
                  <div className="bg-black/60 backdrop-blur-sm rounded-lg px-3 py-1.5 hover:bg-black/80 transition-all">
                    <p className="text-white text-xs font-medium">
                      Click for audio
                    </p>
                  </div>
                </div>
              )}
              <div
                className="absolute top-4 right-4 cursor-pointer z-10"
                onClick={handleFullscreen}
              >
                <div className="bg-black/60 backdrop-blur-sm rounded-lg p-2 hover:bg-black/80 transition-all">
                  <Maximize className="w-4 h-4 text-white" />
                </div>
              </div>
              {!isPlaying && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="bg-black/50 backdrop-blur-sm rounded-full p-4">
                    <Play className="w-8 h-8 text-white fill-white" />
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
                  <div className="bg-black/60 backdrop-blur-sm rounded-lg px-3 py-1.5 hover:bg-black/80 transition-all">
                    <p className="text-white text-xs font-medium">
                      Click for audio
                    </p>
                  </div>
                </div>
              )}
              <div
                className="absolute top-4 right-4 cursor-pointer z-10"
                onClick={handleFullscreen}
              >
                <div className="bg-black/60 backdrop-blur-sm rounded-lg p-2 hover:bg-black/80 transition-all">
                  <Maximize className="w-4 h-4 text-white" />
                </div>
              </div>
              {!isPlaying && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="bg-black/50 backdrop-blur-sm rounded-full p-4">
                    <Play className="w-8 h-8 text-white fill-white" />
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
        <div className="flex flex-col gap-4">
          <Button
            onClick={handleNext}
            disabled={isLastStep}
            className={
              isLastStep
                ? "w-full h-12 bg-gradient-to-r from-pink-500 via-rose-500 to-orange-500 text-white border-0 opacity-50 cursor-not-allowed"
                : "w-full h-12 bg-[#141414] text-foreground border border-border hover:bg-[#1a1a1a] transition-all"
            }
          >
            {isLastStep ? "Sorry, only on desktop" : "Next"}
          </Button>
          <Button
            variant="outline"
            onClick={handleBack}
            disabled={isFirstStep}
            className="w-full h-12 bg-[#141414] border-border text-muted-foreground hover:bg-[#1a1a1a] hover:text-foreground transition-all"
          >
            Back
          </Button>
        </div>
      </div>
    </div>
  );
}
