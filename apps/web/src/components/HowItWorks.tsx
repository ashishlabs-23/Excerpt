/** @jsxImportSource react */
"use client";
// Build stability marker: 2026-04-02

import React from "react";
import { motion, useInView, useScroll, useTransform } from "framer-motion";
import { Upload, Brain, Share2, Check } from "lucide-react";
import { useRef } from "react";

interface StepItem {
  id: number;
  title: string;
  description: string;
}

const stepIcons = [Upload, Brain, Share2];

export const HowItWorks: React.FC = () => {
  const containerRef = useRef(null);
  const isInView = useInView(containerRef, { once: true, margin: "-100px" });

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start end", "end start"],
  });

  const lineHeight = useTransform(scrollYProgress, [0, 1], ["0%", "100%"]);

  const steps: StepItem[] = [
    {
      id: 1,
      title: "Upload Source",
      description: "Drop your long-form YouTube link or MP4 file into the Excerpt secure cloud environment.",
    },
    {
      id: 2,
      title: "AI Processing",
      description: "Our engines segment the video, add styling, and generate viral-optimized descriptions in real-time.",
    },
    {
      id: 3,
      title: "Instant Export",
      description: "Review your batch of clips and export them directly to your favorite social platforms or download for later.",
    }
  ];

  return (
    <section
      id="how-it-works"
      className="py-20 sm:py-24 px-4 sm:px-6 bg-[#030712] border-t border-[#1f2937]/50 relative overflow-hidden"
    >
      <div className="max-w-5xl mx-auto relative z-10" ref={containerRef}>
        {/* Header */}
        <motion.div
          className="text-center mb-14 sm:mb-20"
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
        >
          <motion.span
            className="inline-block px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={isInView ? { opacity: 1, scale: 1 } : {}}
            transition={{ delay: 0.2, duration: 0.4 }}
          >
            How It Works
          </motion.span>

          <motion.h2
            className="text-3xl sm:text-4xl md:text-5xl font-black text-[#e0e5f6] mb-4 tracking-tight"
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: 0.3, duration: 0.5 }}
          >
            The Engineering Behind{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-primary/60">
              Viral Growth
            </span>
          </motion.h2>

          <motion.p
            className="text-[#94a3b8] text-base sm:text-lg max-w-xl mx-auto"
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: 0.4, duration: 0.5 }}
          >
            From upload to viral clip in under 2 minutes. No editing skills required.
          </motion.p>
        </motion.div>

        {/* Steps */}
        <div className="relative">
          {/* Animated Progress Line */}
          <div className="absolute left-[23px] top-0 bottom-0 w-0.5 bg-white/5 hidden md:block">
            <motion.div
              className="absolute top-0 left-0 w-full bg-gradient-to-b from-primary to-primary/20 origin-top"
              style={{ height: lineHeight }}
            />
          </div>

          <div className="space-y-12 sm:space-y-16">
            {steps.map((step, index) => {
              const IconComponent = stepIcons[index];
              const isLast = index === steps.length - 1;

              return (
                <StepCard
                  key={step.id}
                  step={step}
                  index={index}
                  IconComponent={IconComponent}
                  isLast={isLast}
                />
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
};

interface StepCardProps {
  step: StepItem;
  index: number;
  IconComponent: React.ComponentType<{ className?: string }>;
  isLast: boolean;
}

function StepCard({ step, index, IconComponent, isLast }: StepCardProps) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });

  const colors = [
    { bg: "var(--primary)", border: "var(--primary)" },
    { bg: "var(--primary)", border: "var(--primary)" },
    { bg: "var(--primary)", border: "var(--primary)" },
  ];
  const color = colors[index % colors.length];

  const technicalDetails = [
    "Multi-stage AI pipeline analyzing audio hooks and emotional spikes.",
    "Cinematically-smoothed tracking for perfect 9:16 vertical composition.",
    "AI-Native processing with narrative-driven clip selection."
  ];

  return (
    <motion.div
      ref={ref}
      className="relative flex flex-col md:flex-row items-center md:items-start gap-6 sm:gap-8"
      initial={{ opacity: 0, x: index % 2 === 0 ? -30 : 30 }}
      animate={isInView ? { opacity: 1, x: 0 } : {}}
      transition={{ duration: 0.6, delay: index * 0.2 }}
    >
      {/* Step Number / Icon */}
      <motion.div
        className="relative z-10 flex-shrink-0"
        whileHover={{ scale: 1.1, rotate: 5 }}
        transition={{ duration: 0.3 }}
      >
        <motion.div
          className="w-12 h-12 rounded-full flex items-center justify-center text-white font-black text-xl shadow-lg"
          style={{ backgroundColor: color.bg }}
          initial={{ scale: 0 }}
          animate={isInView ? { scale: 1 } : {}}
          transition={{ duration: 0.4, delay: index * 0.2 + 0.2, type: "spring" }}
        >
          {isLast ? (
            <motion.div
              initial={{ scale: 0 }}
              animate={isInView ? { scale: 1 } : {}}
              transition={{ delay: index * 0.2 + 0.4 }}
            >
              <Check className="w-6 h-6" />
            </motion.div>
          ) : (
            <IconComponent className="w-6 h-6" />
          )}
        </motion.div>

        {/* Pulse effect */}
        <motion.div
          className="absolute inset-0 rounded-full"
          style={{ backgroundColor: color.bg }}
          animate={{
            scale: [1, 1.4, 1],
            opacity: [0.3, 0, 0.3],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            delay: index * 0.5,
          }}
        />
      </motion.div>

      {/* Content */}
      <motion.div
        className="flex-grow text-center md:text-left pt-1"
        initial={{ opacity: 0, y: 20 }}
        animate={isInView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.5, delay: index * 0.2 + 0.3 }}
      >
        <motion.div
          className="inline-flex items-center gap-2 mb-3"
          initial={{ opacity: 0, x: -20 }}
          animate={isInView ? { opacity: 1, x: 0 } : {}}
          transition={{ duration: 0.4, delay: index * 0.2 + 0.4 }}
        >
          <span
            className="text-xs font-bold uppercase tracking-widest px-2 py-1 rounded"
            style={{ backgroundColor: `${color.bg}20`, color: color.bg }}
          >
            Step {index + 1}
          </span>
        </motion.div>

        <h3 className="text-xl sm:text-2xl font-black text-[#e0e5f6] mb-3 tracking-tight">
          {step.title}
        </h3>

        <p className="text-[#64748b] text-base sm:text-lg leading-relaxed max-w-xl mb-4">
          {step.description}
        </p>

        <div className="flex items-start gap-2 p-3 rounded-xl bg-white/5 border border-white/10 max-w-md mx-auto md:mx-0">
           <div className="mt-1 flex-shrink-0 w-1.5 h-1.5 rounded-full bg-primary" />
           <p className="text-[10px] text-white/40 font-medium uppercase tracking-wider leading-relaxed">
             {technicalDetails[index]}
           </p>
        </div>
      </motion.div>

      {/* Visual Preview */}
      <motion.div
        className="hidden lg:block w-48 h-32 rounded-2xl bg-gradient-to-br from-[#111827] to-[#030712] border border-[#1f2937] p-4"
        initial={{ opacity: 0, scale: 0.9, rotateY: -15 }}
        animate={isInView ? { opacity: 1, scale: 1, rotateY: 0 } : {}}
        transition={{ duration: 0.6, delay: index * 0.2 + 0.4 }}
        whileHover={{
          scale: 1.05,
          rotateY: 5,
          transition: { duration: 0.3 },
        }}
        style={{ perspective: 1000 }}
      >
        {/* Simulated UI based on step */}
        <div className="w-full h-full rounded-xl bg-[#0a0f1c] flex items-center justify-center overflow-hidden relative">
          {index === 0 && (
            <motion.div
              className="w-12 h-12 rounded-full border-2 border-dashed border-primary/30 flex items-center justify-center"
              animate={{
                borderColor: ["rgba(200,119,64,0.3)", "rgba(200,119,64,0.6)", "rgba(200,119,64,0.3)"],
              }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <Upload className="w-5 h-5 text-primary" />
            </motion.div>
          )}
          {index === 1 && (
            <div className="flex gap-1">
              {[1, 2, 3, 4].map((i) => (
                <motion.div
                  key={i}
                  className="w-1.5 bg-primary rounded-full"
                  animate={{
                    height: [20, 40, 20],
                  }}
                  transition={{
                    duration: 1,
                    repeat: Infinity,
                    delay: i * 0.1,
                  }}
                />
              ))}
            </div>
          )}
          {index === 2 && (
            <motion.div
              className="flex items-center gap-2 text-primary"
              animate={{ x: [0, 5, 0] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            >
              <Share2 className="w-5 h-5" />
              <span className="text-xs font-medium">Share</span>
            </motion.div>
          )}

          {/* Scanning effect */}
          <motion.div
            className="absolute inset-0 bg-gradient-to-b from-transparent via-white/5 to-transparent"
            animate={{ y: [-100, 200] }}
            transition={{
              duration: 3,
              repeat: Infinity,
              repeatDelay: 1,
            }}
          />
        </div>
      </motion.div>
    </motion.div>
  );
}
