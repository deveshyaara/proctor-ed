"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Prisma } from "@prisma/client";

type DashboardTest = Prisma.TestGetPayload<{
  include: { _count: { select: { attempts: true; questions: true } } };
}>;

export function TestCardActionButtons({ test }: { test: DashboardTest }) {
  const [copiedCode, setCopiedCode] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [copiedMessage, setCopiedMessage] = useState(false);

  function copyTestCode() {
    navigator.clipboard.writeText(test.testCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 1500);
  }

  const durationMin = Math.round(test.durationSeconds / 60);

  // Production invitation text without any developer localhost strings
  const inviteText = `Your examination is ready.

Examination: ${test.title}
Class: ${test.className}
Duration: ${durationMin} minutes

Test Code: ${test.testCode}

Before starting:
• Camera required for environment verification
• Stay in fullscreen mode
• Only one person visible

Good luck!`;

  function copyWhatsAppMessage() {
    navigator.clipboard.writeText(inviteText);
    setCopiedMessage(true);
    setTimeout(() => setCopiedMessage(false), 1500);
  }

  function openWhatsApp() {
    const url = `https://wa.me/?text=${encodeURIComponent(inviteText)}`;
    window.open(url, "_blank");
  }

  return (
    <>
      <div className="flex flex-wrap sm:flex-nowrap items-center gap-2.5 shrink-0 w-full sm:w-auto">
        {/* Test Code Chip */}
        <div className="flex items-center justify-between sm:justify-start bg-[#11110F] border border-[rgba(244,240,231,0.09)] rounded-[8px] px-3 py-1.5 flex-1 sm:flex-initial">
          <span className="font-mono text-xs font-semibold tracking-wider text-[#F4F0E7] mr-3">
            {test.testCode}
          </span>
          <button
            onClick={copyTestCode}
            aria-label="Copy test code"
            className="text-xs font-medium text-[#AAA69B] hover:text-[#F4F0E7] cursor-pointer transition-colors"
          >
            {copiedCode ? (
              <span className="text-[#7A9E7E] font-semibold">✓ Copied</span>
            ) : (
              "Copy"
            )}
          </button>
        </div>

        {/* Secondary Share Action */}
        <Button
          size="sm"
          variant="secondary"
          className="flex-1 sm:flex-initial"
          onClick={() => setShowShareModal(true)}
        >
          Share
        </Button>

        {/* Primary Dominant Action */}
        <Link href={`/tests/${test.id}`} className="w-full sm:w-auto">
          <Button size="sm" variant="primary" className="w-full sm:w-auto">
            Monitor examination
          </Button>
        </Link>
      </div>

      {/* WhatsApp Share Preview Modal (Section 27 & 28) */}
      {showShareModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-xs animate-fade-in">
          <div className="bg-[#191916] border border-[rgba(244,240,231,0.1)] rounded-[16px] max-w-lg w-full p-6 sm:p-7 shadow-2xl space-y-5">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-[rgba(244,240,231,0.06)] pb-4">
              <div>
                <div className="text-[11px] font-mono uppercase tracking-wider text-[#AAA69B]">
                  Share with students
                </div>
                <h3 className="text-base font-bold text-[#F4F0E7] tracking-tight mt-0.5">
                  {test.title}
                </h3>
                <div className="flex items-center gap-2 text-xs text-[#AAA69B] mt-1">
                  <span>{test.className}</span>
                  <span>·</span>
                  <span>{durationMin} minutes</span>
                  <span>·</span>
                  <span>Test code: <strong className="font-mono text-[#F4F0E7]">{test.testCode}</strong></span>
                </div>
              </div>

              <button
                onClick={() => setShowShareModal(false)}
                aria-label="Close share dialog"
                className="w-10 h-10 -mr-2 -mt-2 flex items-center justify-center text-[#AAA69B] hover:text-[#F4F0E7] rounded-[8px] hover:bg-[#22211C] transition-colors cursor-pointer text-base"
              >
                ✕
              </button>
            </div>

            {/* Preview Box with Normal Typography */}
            <div className="space-y-1.5">
              <div className="text-xs font-medium text-[#AAA69B]">Message preview</div>
              <div className="p-4 rounded-[10px] bg-[#11110F] border border-[rgba(244,240,231,0.08)] text-xs text-[#F4F0E7] whitespace-pre-wrap leading-relaxed font-sans">
                {inviteText}
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2.5 pt-2">
              <Button
                size="md"
                variant="outline"
                className="w-full sm:w-auto"
                onClick={() => setShowShareModal(false)}
              >
                Close
              </Button>
              <Button
                size="md"
                variant="secondary"
                className="w-full sm:w-auto"
                onClick={copyWhatsAppMessage}
              >
                {copiedMessage ? "✓ Copied" : "Copy message"}
              </Button>
              <Button
                size="md"
                variant="primary"
                className="w-full sm:w-auto"
                onClick={openWhatsApp}
              >
                Open WhatsApp
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
