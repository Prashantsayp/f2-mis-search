import React from 'react';

export const F2_LOGO_URL =
  'https://s3.ap-south-1.amazonaws.com/assets.ynos.in/startup-logos/YNOS471125.jpg';

interface F2FintechLogoProps {
  variant?: 'full' | 'icon' | 'horizontal';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  showSubtitle?: boolean;
  subtitleText?: string;
}

export const F2FintechLogo: React.FC<F2FintechLogoProps> = ({
  variant = 'full',
  size = 'md',
  className = '',
  showSubtitle = true,
  subtitleText = 'LEAD & MIS INTELLIGENCE',
}) => {
  // Responsive image heights & container sizing tailored to each layout placement
  const iconDimensions = {
    sm: 'h-8 w-auto max-w-[96px]',
    md: 'h-10 w-auto max-w-[120px]',
    lg: 'h-14 w-auto max-w-[150px]',
    xl: 'h-20 w-auto max-w-[190px]',
  };

  const fullDimensions = {
    sm: 'h-10 w-auto max-w-[140px]',
    md: 'h-14 w-auto max-w-[180px]',
    lg: 'h-16 w-auto max-w-[200px]',
    xl: 'h-24 w-auto max-w-[240px]',
  };

  const textSizes = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-lg',
    xl: 'text-2xl',
  };

  const subSizes = {
    sm: 'text-[9px]',
    md: 'text-[10px]',
    lg: 'text-[11px]',
    xl: 'text-xs',
  };

  if (variant === 'icon') {
    return (
      <div
        className={`inline-flex items-center justify-center bg-white rounded-xl p-1 border border-slate-200/80 shadow-2xs overflow-hidden shrink-0 ${className}`}
      >
        <img
          src={F2_LOGO_URL}
          alt="F2 Fintech Logo"
          className={`${iconDimensions[size]} object-contain select-none`}
        />
      </div>
    );
  }

  if (variant === 'horizontal') {
    return (
      <div className={`inline-flex items-center gap-3 ${className}`}>
        <div className="bg-white rounded-xl p-1.5 border border-slate-200/80 shadow-2xs flex items-center justify-center shrink-0 overflow-hidden">
          <img
            src={F2_LOGO_URL}
            alt="F2 Fintech Logo"
            className={`${iconDimensions[size]} object-contain select-none`}
          />
        </div>
        <div className="flex flex-col text-left">
          <div className="flex items-center gap-1.5 leading-none">
            <span className={`font-black tracking-wider text-[#1e3a8a] ${textSizes[size]}`}>
              F2
            </span>
            <span className={`font-extrabold tracking-widest text-[#2563eb] ${textSizes[size]}`}>
              FINTECH
            </span>
          </div>
          {showSubtitle && (
            <span className={`font-semibold tracking-wider text-slate-400 mt-1 uppercase ${subSizes[size]}`}>
              {subtitleText}
            </span>
          )}
        </div>
      </div>
    );
  }

  // Default 'full' vertical variant (ideal for Sidebar top & branding cards)
  return (
    <div className={`flex flex-col items-center justify-center text-center ${className}`}>
      <div className="bg-white rounded-xl px-3 py-1.5 flex items-center justify-center overflow-hidden">
        <img
          src={F2_LOGO_URL}
          alt="F2 Fintech Official Logo"
          className={`${fullDimensions[size]} object-contain select-none transition-transform duration-200 hover:scale-105`}
        />
      </div>
      {showSubtitle && (
        <span
          className={`font-semibold tracking-wider text-slate-400 uppercase mt-1.5 ${subSizes[size]}`}
        >
          {subtitleText}
        </span>
      )}
    </div>
  );
};
