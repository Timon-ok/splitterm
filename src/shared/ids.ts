// Branded ids so a TermId can never be mixed up with a PaneId or a raw number/string.

export type TermId = number & { readonly __brand: 'TermId' };
export type PaneId = string & { readonly __brand: 'PaneId' };
export type WindowId = number & { readonly __brand: 'WindowId' };

export const asTermId = (n: number): TermId => n as TermId;
export const asPaneId = (s: string): PaneId => s as PaneId;
export const asWindowId = (n: number): WindowId => n as WindowId;
