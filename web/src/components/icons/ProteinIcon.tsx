import { SVGProps } from 'react';

interface ProteinIconProps extends SVGProps<SVGSVGElement> {
  size?: number | string;
}

/**
 * Custom protein folding icon - represents a folded protein structure
 * with alpha helix and ribbon-like appearance
 */
export function ProteinIcon({
  size = 24,
  className,
  ...props
}: ProteinIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...props}
    >
      {/* Alpha helix spiral representation */}
      <path d="M12 3c-2 0-4 1.5-4 3s2 2.5 4 2.5 4 1 4 3-2 3-4 3-4 1-4 3 2 3.5 4 3.5" />
      {/* Small circles representing amino acid residues */}
      <circle cx="8" cy="6" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="16" cy="11.5" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="8" cy="17.5" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

/**
 * Alternative protein icon - more abstract folded structure
 */
export function ProteinFoldIcon({
  size = 24,
  className,
  ...props
}: ProteinIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...props}
    >
      {/* Ribbon-like folded protein backbone */}
      <path d="M4 8c2-3 6-3 8 0s6 3 8 0" />
      <path d="M4 12c2 3 6 3 8 0s6-3 8 0" />
      <path d="M4 16c2-3 6-3 8 0s6 3 8 0" />
    </svg>
  );
}

/**
 * Compact helix icon - simple alpha helix representation
 */
export function HelixIcon({
  size = 24,
  className,
  ...props
}: ProteinIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...props}
    >
      {/* Simplified helix - two intertwined curves */}
      <path d="M8 4c0 2 8 2 8 6s-8 4-8 6 8 2 8 4" />
      <path d="M16 4c0 2-8 2-8 6s8 4 8 6-8 2-8 4" />
    </svg>
  );
}
