import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/**
 * Every user-facing string is locale-keyed with a Turkish and an English
 * value. Missing English falls back to Turkish at render time (see
 * `localized()` in src/i18n/ui.ts), so a half-translated project renders
 * rather than breaking the build.
 */
const localized = z.object({ tr: z.string(), en: z.string() });
const localizedList = z.object({ tr: z.array(z.string()), en: z.array(z.string()) });

/**
 * Business settings. One file, one entry — everything the owner might want to
 * change that isn't a project or a piece of kit.
 *
 * Uses glob rather than the file() loader on purpose: file() treats a YAML
 * file's top-level keys as entry IDs, so a single settings object has to be
 * wrapped in a fake record. Glob gives one entry per file, keyed by filename,
 * which is the same mental model as the other two collections.
 */
const site = defineCollection({
  loader: glob({ pattern: '**/*.yaml', base: './src/content/site' }),
  schema: z.object({
    // Contact
    whatsapp: z.string(), // digits only, for wa.me
    whatsappDisplay: z.string(),
    email: z.string(),
    instagram: z.string(),
    serviceArea: localized,
    /**
     * Real credentials. Printed as they appear on the licence — the number and
     * the official class — because that is what a client would check. No gloss
     * on what a class covers: SHT-İHA was rewritten in July 2026 (İHA-0/1
     * became M0/M1), so a weight claim written today could be wrong tomorrow.
     */
    licence: z.object({
      authority: z.string(),
      entries: z.array(
        z.object({
          number: z.string(),
          type: localized,
        })
      ),
      note: localized,
    }),
    // Enquiry form. No budget bands: the ask is a conversation, not a quote
    // form, and every extra field costs submissions.
    businessTypes: z.array(z.object({ value: z.string(), label: localized })),
    // What is on offer. Editable content, not UI strings.
    services: z.array(
      z.object({
        title: localized,
        description: localized,
        /** The mono line naming the actual deliverable. */
        deliverable: localized,
      })
    ),
    /**
     * Genuinely a sequence, which is why it is the only numbered thing on the
     * site. `needs` is what the client has to provide at that step — the part
     * that removes friction for someone who has never hired a drone pilot.
     */
    process: z.array(
      z.object({
        title: localized,
        description: localized,
        needs: localized,
      })
    ),
  }),
});

/**
 * One file per project. Add a project by adding a YAML file — no component
 * changes, and a malformed file fails the build with a readable error rather
 * than shipping a blank tile.
 */
const projects = defineCollection({
  loader: glob({ pattern: '**/*.yaml', base: './src/content/projects' }),
  schema: z.object({
    title: localized,
    /** What kind of business it was. Never claims a commercial relationship. */
    clientType: z.enum(['cafe', 'restaurant', 'retail', 'event', 'realEstate', 'other']),
    clientName: z.string().optional(),
    location: localized,
    /** ISO date, quoted in YAML so it stays a string. */
    date: z.coerce.date(),
    order: z.number(),
    featured: z.boolean().default(true),
    goal: localized,
    result: localized,
    description: localized,
    gear: z.object({ airframe: z.string(), camera: z.string() }),
    /**
     * The deliverable pair. Most shoots produce a 16:9 film and a 9:16 reel;
     * the work section renders them as a composed pair, which is what teaches
     * a visitor that they get both.
     */
    cuts: z
      .array(
        z.object({
          orientation: z.enum(['landscape', 'vertical']),
          label: localized,
          src: z.string(),
          poster: z.string().optional(),
          width: z.number(),
          height: z.number(),
          durationSec: z.number().optional(),
        })
      )
      .min(1),
  }),
});

/**
 * One file per aircraft or camera. `kind` drives which spec rows make sense —
 * a camera has no props or flight time, and pretending otherwise would be the
 * kind of detail that makes a spec sheet untrustworthy.
 */
const kit = defineCollection({
  loader: glob({ pattern: '**/*.yaml', base: './src/content/kit' }),
  schema: z.object({
    name: z.string(),
    kind: z.enum(['airframe', 'camera']),
    class: localized,
    tagline: localized,
    photo: z.string().optional(),
    order: z.number(),
    /**
     * `value` is either a plain string for language-neutral values ("Mario 5",
     * "4K 60 fps", "DJI O4 Wide · 159°") or locale-keyed when it contains a
     * word. Without this, Turkish words rode onto the English page.
     */
    specs: z.array(
      z.object({ label: localized, value: z.union([z.string(), localized]) })
    ),
    bestFor: localizedList,
    /** Stated plainly. A sheet that admits limits is the one people believe. */
    limits: localizedList,
    sample: z.object({
      src: z.string(),
      poster: z.string().optional(),
      orientation: z.enum(['landscape', 'vertical']),
      durationSec: z.number().optional(),
    }),
  }),
});

export const collections = { site, projects, kit };
