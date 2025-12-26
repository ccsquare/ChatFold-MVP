import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ["class"],
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Figma design tokens - now using CSS variables for theme support
        'cf-bg': 'var(--cf-bg)',
        'cf-bg-secondary': 'var(--cf-bg-secondary)',
        'cf-bg-tertiary': 'var(--cf-bg-tertiary)',
        'cf-bg-input': 'var(--cf-bg-input)',
        'cf-border': 'var(--cf-border)',
        'cf-border-strong': 'var(--cf-border-strong)',
        'cf-text': 'var(--cf-text)',
        'cf-text-secondary': 'var(--cf-text-secondary)',
        'cf-text-muted': 'var(--cf-text-muted)',
        'cf-accent': 'var(--cf-accent)',
        'cf-success': 'var(--cf-success)',
        'cf-success-glow': 'var(--cf-success-glow)',
        'cf-error': 'var(--cf-error)',
        'cf-warning': 'var(--cf-warning)',
        'cf-info': 'var(--cf-info)',
        'cf-confidence-excellent': 'var(--cf-confidence-excellent)',
        'cf-confidence-good': 'var(--cf-confidence-good)',
        'cf-confidence-fair': 'var(--cf-confidence-fair)',
        'cf-confidence-poor': 'var(--cf-confidence-poor)',
        'cf-highlight': 'var(--cf-highlight)',
        'cf-highlight-strong': 'var(--cf-highlight-strong)',
        // shadcn colors
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
      },
      fontFamily: {
        sans: ['Karla', 'PingFang SC', 'sans-serif'],
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        'cf': '6px',
        'cf-md': '8px',
        'cf-lg': '12px',
        'cf-xl': '16px',
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}

export default config
