"use client";

import { Tooltip, TooltipProvider } from "@/components/ui/Tooltip";

/**
 * TeamPresence renders illustrative demo presence indicators.
 *
 * In demo mode: shows 3 fictitious teammates with status tooltips.
 * Real-time presence requires a connected presence service — this
 * component is explicitly labeled as demo behavior.
 *
 * No actual customer or financial data is exposed through presence tooltips.
 */

const DEMO_PRESENCE = [
  {
    name: "Priya Sharma",
    initials: "PS",
    activity: "Reviewing dispute INV-2024-089",
    color: "bg-emerald-500",
  },
  {
    name: "Arjun Mehta",
    initials: "AM",
    activity: "Sending collection follow-up",
    color: "bg-blue-500",
  },
  {
    name: "Kavya Nair",
    initials: "KN",
    activity: "Reviewing AI reply analysis",
    color: "bg-violet-500",
  },
];

export function TeamPresence() {
  return (
    <TooltipProvider>
      <div
        className="hidden lg:flex items-center -space-x-1.5"
        aria-label="Active team members (demo)"
        role="group"
      >
        {DEMO_PRESENCE.map((member) => (
          <Tooltip
            key={member.name}
            side="bottom"
            content={
              <div className="text-center">
                <div className="font-medium">{member.name}</div>
                <div className="text-2xs opacity-75 mt-0.5">
                  {member.activity}
                </div>
                <div className="text-2xs opacity-50 mt-1 italic">
                  Demo presence
                </div>
              </div>
            }
          >
            <div className="relative" role="img" aria-label={member.name}>
              <div
                className={`flex items-center justify-center w-7 h-7 rounded-full ${member.color} text-white text-2xs font-semibold ring-2 ring-white cursor-default`}
              >
                {member.initials}
              </div>
              {/* Online indicator */}
              <span
                className="absolute bottom-0 right-0 w-2 h-2 bg-status-success rounded-full ring-1 ring-white"
                aria-hidden
              />
            </div>
          </Tooltip>
        ))}
        <div className="pl-2 text-xs text-text-secondary">+2</div>
      </div>
    </TooltipProvider>
  );
}
