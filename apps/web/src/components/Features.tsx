"use client";

import React from "react";
import { motion, useInView } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Zap, Type, Maximize, TrendingUp, Clock, Shield } from "lucide-react";
import { useRef } from "react";
import Link from "next/link";

const iconMap: Record<string, any> = {
  Zap: Zap,
  Type: Type,
  Maximize: Maximize,
  TrendingUp: TrendingUp,
  Clock: Clock,
  Shield: Shield,
};

interface FeatureItem {
  id: number;
  title: string;
  description: string;
  icon: string;
  color: string;
}

// Additional features to show
const additionalFeatures: FeatureItem[] = [
  {
    id: 4,
    title: "Viral Prediction",
    description: "Our AI analyzes millions of viral videos to predict which moments will capture attention.",
    icon: "TrendingUp",
    color: "#10b981",
  },
  {
    id: 5,
    title: "Lightning Fast",
    description: "Process hours of content in minutes. GPU-accelerated transcoding at scale.",
    icon: "Clock",
    color: "#f59e0b",
  },
  {
    id: 6,
    title: "Enterprise Security",
    description: "Your content is encrypted and never shared. SOC 2 compliant infrastructure.",
    icon: "Shield",
    color: "#ec4899",
  },
];

export const Features: React.FC = () => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  const allFeatures: FeatureItem[] = [
    {
      id: 1,
      title: "AI Detection",
      description: "Smart algorithms scan your footage for high-impact moments, emotional peaks, and natural transition points.",
      icon: "Zap",
      color: "#C87740"
    },
    {
      id: 2,
      title: "Auto Captions",
      description: "Dynamic, high-energy subtitles with built-in styling and keyword highlighting to maximize retention rates.",
      icon: "Type",
      color: "#10b981"
    },
    {
      id: 3,
      title: "One-Click Vertical Export",
      description: "Intelligently crops and scales your horizontal video into perfect 9:16 format with AI speaker centering.",
      icon: "Maximize",
      color: "#3b82f6"
    },
    ...additionalFeatures,
  ];

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.15,
        delayChildren: 0.2,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 40 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.6,
        ease: [0.25, 0.1, 0.25, 1],
      },
    },
  };

  return (
    <section id="features" className="py-20 sm:py-24 px-4 sm:px-6 bg-[#030712] relative overflow-hidden">
      {/* Background Decoration */}
      <div className="absolute inset-0 pointer-events-none">
        <motion.div
          className="absolute top-1/4 -left-32 w-64 h-64 bg-primary opacity-[0.03] blur-[100px] rounded-full"
          animate={{
            x: [0, 50, 0],
            scale: [1, 1.2, 1],
          }}
          transition={{
            duration: 15,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
        <motion.div
          className="absolute bottom-1/4 -right-32 w-96 h-96 bg-[#10b981] opacity-[0.02] blur-[120px] rounded-full"
          animate={{
            x: [0, -50, 0],
            scale: [1, 1.3, 1],
          }}
          transition={{
            duration: 20,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      </div>

      <div className="max-w-6xl mx-auto relative z-10">
        {/* Header */}
        <motion.div
          ref={ref}
          className="text-center mb-14 sm:mb-16"
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
            Features
          </motion.span>

          <motion.h2
            className="text-3xl sm:text-4xl md:text-5xl font-black text-[#e0e5f6] mb-4 tracking-tight"
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: 0.3, duration: 0.5 }}
          >
            Precision Tools for{" "}
            <motion.span
              className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-primary/80"
              animate={{
                backgroundPosition: ["0%", "100%"],
              }}
              transition={{
                duration: 3,
                repeat: Infinity,
                repeatType: "reverse",
              }}
            >
              Virality
            </motion.span>
          </motion.h2>

          <motion.p
            className="text-[#94a3b8] text-base sm:text-lg max-w-2xl mx-auto"
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: 0.4, duration: 0.5 }}
          >
            Our AI engines analyze every frame to find the hook that makes
            users stop scrolling.
          </motion.p>
        </motion.div>

        {/* Features Grid */}
        <motion.div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6"
          variants={containerVariants}
          initial="hidden"
          animate={isInView ? "visible" : "hidden"}
        >
          {allFeatures.map((feature, index) => {
            const IconComponent = iconMap[feature.icon];
            return (
              <motion.div
                key={feature.id}
                variants={itemVariants}
                whileHover={{
                  y: -8,
                  transition: { duration: 0.2 },
                }}
              >
                <motion.div
                  whileHover={{
                    boxShadow: `0 0 30px ${feature.color}20`,
                  }}
                  transition={{ duration: 0.3 }}
                >
                  <Card className="bg-[#111827]/50 border-[#1f2937] backdrop-blur-md rounded-2xl p-6 sm:p-8 h-full group transition-colors duration-300 hover:border-primary/30">
                    <div className="flex flex-col h-full">
                      <motion.div
                        className="w-14 h-14 rounded-2xl flex items-center justify-center mb-6 shadow-lg"
                        style={{ backgroundColor: `${feature.color}15` }}
                        whileHover={{
                          scale: 1.1,
                          rotate: [0, -5, 5, 0],
                        }}
                        transition={{ duration: 0.4 }}
                      >
                        <IconComponent
                          size={28}
                          style={{ color: feature.color }}
                        />
                      </motion.div>

                      <h3 className="text-xl font-bold text-[#e0e5f6] mb-3 group-hover:text-primary transition-colors duration-300">
                        {feature.title}
                      </h3>

                      <p className="text-[#64748b] leading-relaxed text-sm">
                        {feature.description}
                      </p>

                      {/* Hover indicator */}
                      <motion.div
                        className="mt-6 flex items-center text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                        style={{ color: feature.color }}
                      >
                        Learn more
                        <motion.svg
                          className="w-4 h-4 ml-1"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                          animate={{ x: [0, 4, 0] }}
                          transition={{
                            duration: 1.5,
                            repeat: Infinity,
                            ease: "easeInOut",
                          }}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 5l7 7-7 7"
                          />
                        </motion.svg>
                      </motion.div>
                    </div>
                  </Card>
                </motion.div>
              </motion.div>
            );
          })}
        </motion.div>

        {/* Bottom CTA */}
        <motion.div
          className="mt-14 sm:mt-16 text-center"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.6 }}
        >
          <motion.div
            className="flex w-full max-w-2xl flex-col sm:flex-row items-center justify-between gap-6 p-6 sm:p-8 rounded-3xl bg-gradient-to-r from-[#6366f1]/10 to-[#10b981]/10 border border-[#1f2937]"
            whileHover={{ scale: 1.02 }}
            transition={{ duration: 0.2 }}
          >
            <div className="text-left flex-1">
              <h3 className="text-xl text-[#e0e5f6] font-bold">
                Ready to transform your content?
              </h3>
              <p className="text-[#64748b] text-sm mt-2">
                Start creating viral clips today.
              </p>
            </div>
            <Link href="/dashboard" className="shrink-0 w-full sm:w-auto">
              <Button className="w-full sm:w-auto px-8 py-6 bg-primary hover:bg-primary/90 text-white font-bold text-base rounded-xl shadow-[0_0_20px_rgba(200,119,64,0.3)] hover:shadow-[0_0_30px_rgba(200,119,64,0.5)] transition-all">
                Get Started
              </Button>
            </Link>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
};
