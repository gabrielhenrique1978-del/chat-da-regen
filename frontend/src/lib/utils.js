import { clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// Registra o tamanho tipográfico customizado (text-2xs) para que o merge
// não o confunda com uma cor de texto e o descarte.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: ['2xs'] }],
    },
  },
});

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export function formatTime(isoString) {
  if (!isoString) return '';
  try {
    return new Date(isoString).toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export function getInitials(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'CR';
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
