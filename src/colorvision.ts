import type { ColorVision } from './types'

/**
 * Matrices for the two forms of colour blindness that catch people out most often, from the
 * Machado, Oliveira and Fernandes (2009) fits for severity 1.0. Applied only to the board on
 * screen: an export always keeps the colours the figure really has.
 */
export const COLOR_VISION: Record<Exclude<ColorVision, 'normal'>, { label: string; values: string }> = {
  deuteranopia: {
    label: 'Deuteranopia',
    values: '0.625 0.375 0 0 0  0.700 0.300 0 0 0  0 0.300 0.700 0 0  0 0 0 1 0',
  },
  protanopia: {
    label: 'Protanopia',
    values: '0.567 0.433 0 0 0  0.558 0.442 0 0 0  0 0.242 0.758 0 0  0 0 0 1 0',
  },
}