'use client';

import React from 'react';
import { ArrowUp } from 'lucide-react';

interface AuthLayoutProps {
  children: React.ReactNode;
}

export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="flex h-screen w-full bg-[#1b1818]">
      {/* Left side - Auth form */}
      <div className="flex flex-1 items-center justify-center px-[120px] relative">
        {/* Background gradients */}
        <div className="absolute left-[2px] top-[270px] h-[463px] w-[771px] opacity-60 pointer-events-none">
          <div
            className="absolute left-[80px] top-0 h-[395px] w-[1512px] border-b border-[rgba(94,86,86,0.6)]"
            style={{
              backgroundImage: `url('data:image/svg+xml;utf8,<svg viewBox="0 0 1512 395" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none"><rect x="0" y="0" height="100%" width="100%" fill="url(%23grad)" opacity="0.5"/><defs><radialGradient id="grad" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="10" gradientTransform="matrix(14.082 -13.706 15.93 16.367 380.41 285.49)"><stop stop-color="rgba(193,126,44,1)" offset="0.1875"/><stop stop-color="rgba(224,129,22,0.8)" offset="0.32452"/><stop stop-color="rgba(255,132,0,0.6)" offset="0.46154"/><stop stop-color="rgba(218,128,26,0.525)" offset="0.53245"/><stop stop-color="rgba(181,124,52,0.45)" offset="0.60337"/><stop stop-color="rgba(108,117,103,0.3)" offset="0.74519"/><stop stop-color="rgba(108,117,103,0)" offset="0.96635"/></radialGradient></defs></svg>')`,
            }}
          />
          <div
            className="absolute left-[80px] top-0 h-[463px] w-[1512px] border-b border-[rgba(94,86,86,0.6)]"
            style={{
              backgroundImage: `url('data:image/svg+xml;utf8,<svg viewBox="0 0 1512 463" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none"><rect x="0" y="0" height="100%" width="100%" fill="url(%23grad)" opacity="0.5"/><defs><radialGradient id="grad" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="10" gradientTransform="matrix(19.931 -5.6461 5.9635 21.051 201.76 195.23)"><stop stop-color="rgba(193,126,44,1)" offset="0.37019"/><stop stop-color="rgba(185,101,74,0.65)" offset="0.55769"/><stop stop-color="rgba(177,76,105,0.3)" offset="0.74519"/><stop stop-color="rgba(73,56,57,0)" offset="0.96635"/></radialGradient></defs></svg>')`,
            }}
          />
        </div>

        {/* Logo */}
        <div className="absolute left-[313.73px] top-[51.18px] flex items-center gap-2">
          <div className="h-[38.34px] w-[38.34px] rounded-full bg-gradient-to-br from-orange-500 to-orange-600" />
          <p className="text-[28px] font-medium text-[#fdfcfb] tracking-[-0.56px]">ChatFold</p>
        </div>

        {/* Form container */}
        <div className="w-[390px] z-10">{children}</div>
      </div>

      {/* Right side - Visual showcase */}
      <div className="flex flex-1 items-center p-[40px]">
        <div className="h-[820px] w-full rounded-[16px] overflow-hidden relative">
          {/* Background gradient */}
          <div
            className="absolute inset-[-42px_-18px_-34px_-23px] rounded-[24px]"
            style={{
              backgroundImage:
                'linear-gradient(90deg, rgba(236, 13, 13, 0.2) 0%, rgba(236, 13, 13, 0.2) 100%), linear-gradient(rgb(51, 52, 160) 0%, rgb(131, 156, 174) 30.288%, rgb(114, 149, 179) 38.942%, rgb(90, 90, 107) 65.385%, rgb(97, 74, 74) 86.538%, rgb(95, 76, 139) 100%)',
            }}
          >
            {/* Decorative ellipses */}
            <div className="absolute left-1/2 top-[calc(50%+355.65px)] -translate-x-1/2 -translate-y-1/2 h-[445.185px] w-[445.185px]">
              <div className="h-full w-full rounded-full bg-gradient-to-br from-purple-500/30 to-transparent blur-3xl" />
            </div>
            <div className="absolute left-1/2 top-[calc(50%-94.81px)] -translate-x-1/2 -translate-y-1/2 h-[455.737px] w-[455.737px]">
              <div className="h-full w-full rounded-full bg-gradient-to-br from-blue-500/20 to-transparent blur-2xl" />
            </div>
          </div>

          {/* Content */}
          <p className="absolute left-[43px] top-[700px] text-[40px] font-normal leading-[1.5] text-[#fdfcfb] tracking-[-0.8px] whitespace-nowrap">
            Your protein sequence is waiting
          </p>

          {/* Search box showcase */}
          <div className="absolute left-[85px] top-[356px] w-[506px] backdrop-blur-[50px] bg-[rgba(72,65,65,0.6)] border-[1.214px] border-[rgba(94,86,86,0.6)] rounded-[24px] px-[24px] py-[16px] flex items-center gap-[12px]">
            <p className="flex-1 text-[16.994px] font-normal leading-[1.25] text-[#fdfcfb]">
              Create my protein sequence
            </p>
            <div className="h-[38px] w-[38px] bg-[#fdfcfb] rounded-full flex items-center justify-center">
              <ArrowUp className="h-[27.288px] w-[27.288px] text-black" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
