import { bedroom } from './data/bedroom';
import { kitchen } from './data/kitchen';
import { living } from './data/living';
import type { Pitfall } from './types';

export * from './types';
export * from './evaluate';

export const PITFALLS: Pitfall[] = [...living, ...kitchen, ...bedroom];
