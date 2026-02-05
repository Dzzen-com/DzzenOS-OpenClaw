import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

type IconProps = HTMLAttributes<SVGElement> & {
  size?: number;
};

function iconClassName(className?: string) {
  return cn('h-4 w-4 text-current', className);
}

export function IconLayout({ className, size, ...props }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className={iconClassName(className)} width={size} height={size} {...props}>
      <rect x="3" y="4" width="14" height="12" rx="2" />
      <path d="M3 8h14" />
      <path d="M8 4v12" />
    </svg>
  );
}

export function IconKanban({ className, size, ...props }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className={iconClassName(className)} width={size} height={size} {...props}>
      <rect x="3" y="4" width="4" height="12" rx="1" />
      <rect x="8" y="4" width="4" height="8" rx="1" />
      <rect x="13" y="4" width="4" height="10" rx="1" />
    </svg>
  );
}

export function IconWorkflow({ className, size, ...props }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className={iconClassName(className)} width={size} height={size} {...props}>
      <circle cx="4" cy="6" r="2" />
      <circle cx="16" cy="6" r="2" />
      <circle cx="10" cy="14" r="2" />
      <path d="M6 6h8" />
      <path d="M5.2 7.6l3.7 4.3" />
      <path d="M14.8 7.6l-3.7 4.3" />
    </svg>
  );
}

export function IconBot({ className, size, ...props }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className={iconClassName(className)} width={size} height={size} {...props}>
      <rect x="4" y="6" width="12" height="9" rx="2" />
      <path d="M8 6V4h4v2" />
      <circle cx="8" cy="10" r="1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="10" r="1" fill="currentColor" stroke="none" />
      <path d="M8 13h4" />
    </svg>
  );
}

export function IconFile({ className, size, ...props }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className={iconClassName(className)} width={size} height={size} {...props}>
      <path d="M6 3h5l3 3v11H6z" />
      <path d="M11 3v3h3" />
      <path d="M8 10h6" />
      <path d="M8 13h6" />
    </svg>
  );
}

export function IconSettings({ className, size, ...props }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className={iconClassName(className)} width={size} height={size} {...props}>
      <path d="M10 3.5l1 1.8 2-.3.6 2 1.8 1-.9 1.9.9 1.9-1.8 1-.6 2-2-.3-1 1.8-1-1.8-2 .3-.6-2-1.8-1 .9-1.9-.9-1.9 1.8-1 .6-2 2 .3z" />
      <circle cx="10" cy="10" r="2.2" />
    </svg>
  );
}

export function IconExternal({ className, size, ...props }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className={iconClassName(className)} width={size} height={size} {...props}>
      <path d="M8 4h8v8" />
      <path d="M16 4L9 11" />
      <path d="M12 11v4H4V7h4" />
    </svg>
  );
}

export function IconInfo({ className, size, ...props }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className={iconClassName(className)} width={size} height={size} {...props}>
      <circle cx="10" cy="10" r="7" />
      <path d="M10 9v5" />
      <circle cx="10" cy="6.5" r="0.8" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconPlan({ className, size, ...props }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className={iconClassName(className)} width={size} height={size} {...props}>
      <circle cx="10" cy="10" r="7" />
      <path d="M10 10l3-3" />
      <circle cx="10" cy="10" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconExecute({ className, size, ...props }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className={iconClassName(className)} width={size} height={size} {...props}>
      <path d="M7 5l7 5-7 5z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconReport({ className, size, ...props }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className={iconClassName(className)} width={size} height={size} {...props}>
      <rect x="5" y="3" width="10" height="14" rx="2" />
      <path d="M8 8h4" />
      <path d="M8 11h4" />
    </svg>
  );
}
