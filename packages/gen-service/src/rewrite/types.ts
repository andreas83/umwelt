/** Computed look of the real site, for mode C when the page itself can't be rewritten. */
export interface StyleProbe {
  siteName: string;
  /** CSS color strings as returned by getComputedStyle, e.g. `rgb(255, 255, 255)`. */
  background: string;
  text: string;
  link: string;
  headerBackground: string | null;
  fontBody: string;
  fontHeading: string | null;
  nav: Array<{ text: string; href: string }>;
}

/** The real page as rendered in the hidden snapshot window. */
export interface RawSnapshot {
  url: string;
  finalUrl: string;
  status: number;
  title: string;
  /** `document.documentElement.outerHTML` after scripts ran and consent overlays were removed. */
  html: string;
  /** Every stylesheet in document order: inline text, or an href to fetch. */
  stylesheets: Array<{ href: string | null; text: string | null; media: string }>;
  probe: StyleProbe | null;
}

/** Loads a real page. Implemented by the shell (hidden window); the only part of mode B that touches real sites. */
export interface PageSnapshotter {
  snapshot(url: string): Promise<RawSnapshot>;
}

export interface FetchedResource {
  contentType: string;
  bytes: Uint8Array;
}

/** Fetches a sub-resource (stylesheet, font, logo) of a real page. Returns null on any failure. */
export interface ResourceFetcher {
  fetch(url: string): Promise<FetchedResource | null>;
}

export type SlotKind = 'title' | 'headline' | 'link' | 'text' | 'caption' | 'quote' | 'byline';

/** One piece of real text that gets replaced. */
export interface TextSlot {
  id: number;
  kind: SlotKind;
  /** Nearest block-level element, e.g. `h2`, `p`, `li`. */
  tag: string;
  /** Link target if the text sits inside a link. */
  href: string | null;
  words: number;
  /** Shown to the model as a hint for genre and length; never rendered. */
  original: string;
  /**
   * Inline links inside this slot's paragraph. The original then contains `[[n:link text]]` markers, the model writes
   * them into its text, and assembly turns them back into these links.
   */
  links?: Array<{ n: number; href: string; className: string | null }>;
}

export interface ImageSlot {
  id: number;
  alt: string;
  width: number | null;
  height: number | null;
}

/** A sanitized real page with `⟦n⟧` text markers and `⟦img:n⟧` image markers. Independent of the profile. */
export interface PageTemplate {
  url: string;
  host: string;
  html: string;
  slots: TextSlot[];
  images: ImageSlot[];
  /** A login form with little else: rewriting it would just rewrite a login wall. */
  loginWall: boolean;
  createdAt: string;
}
