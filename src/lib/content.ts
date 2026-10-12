import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { getCollection, getEntry } from 'astro:content';
import { localized, localizedList, type Locale } from '../i18n/ui';

/**
 * Content loaders that flatten locale-keyed fields into plain strings for the
 * requested locale. Components then receive ordinary values and never have to
 * know about the tr/en shape — one of the two places i18n is allowed to leak
 * into a component (the other being UI strings via `t()`).
 */

export async function getSite() {
  const entry = await getEntry('site', 'config');
  if (!entry) {
    throw new Error(
      'src/content/site/config.yaml is missing — the whole site depends on it.'
    );
  }
  const d = entry.data;
  return {
    ...d,
    serviceArea: (locale: Locale) => localized(d.serviceArea, locale),
    licences: (locale: Locale) =>
      d.licence.entries.map((entry) => ({
        number: entry.number,
        type: localized(entry.type, locale),
      })),
    businessTypes: (locale: Locale) =>
      d.businessTypes.map((b) => ({ value: b.value, label: localized(b.label, locale) })),
    services: (locale: Locale) =>
      d.services.map((s) => ({
        title: localized(s.title, locale),
        description: localized(s.description, locale),
        deliverable: localized(s.deliverable, locale),
      })),
    process: (locale: Locale) =>
      d.process.map((p) => ({
        title: localized(p.title, locale),
        description: localized(p.description, locale),
        needs: localized(p.needs, locale),
      })),
  };
}

/**
 * Guards against a placeholder ever reaching a live trust panel. Anything
 * still marked TODO is dropped rather than printed.
 */
export function withoutPlaceholders<T>(items: T[], pick: (item: T) => string): T[] {
  return items.filter((item) => !/^\s*TODO/i.test(pick(item)));
}

/**
 * Real pixel dimensions of a JPEG, read from its SOF marker.
 *
 * Dimensions were declared in each project's YAML before this, and all three
 * had drifted: they said 1920x1080 for files media.sh encodes at 1280x720, so
 * the width/height published to Google in the VideoObject were wrong. Deriving
 * them from the file the site actually serves removes the chance of getting it
 * wrong, which matters most for the person adding the next project.
 *
 * Twenty lines and no dependency, rather than pulling in an image library for
 * two integers.
 */
function jpegSize(file: string): { width: number; height: number } | null {
  let buf: Buffer;
  try {
    buf = readFileSync(file);
  } catch {
    return null;
  }
  let i = 2; // skip SOI
  while (i < buf.length - 9) {
    if (buf[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = buf[i + 1];
    // SOF0-SOF15 carry the frame size; DHT/JPG/DAC do not.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
}

/**
 * What the poster actually is, falling back to the shape's usual size before a
 * clip has been encoded. The YAML does not carry dimensions, because a number
 * written by hand is a number that drifts.
 */
function cutDimensions(poster: string | undefined, orientation: string) {
  if (poster) {
    const onDisk = path.join(process.cwd(), 'public', poster.replace(/^\//, ''));
    const size = existsSync(onDisk) ? jpegSize(onDisk) : null;
    if (size) return size;
  }
  return orientation === 'vertical'
    ? { width: 720, height: 1280 }
    : { width: 1280, height: 720 };
}

export async function getProjects(locale: Locale) {
  const entries = await getCollection('projects');
  return entries
    .map((entry) => ({
      id: entry.id,
      clientType: entry.data.clientType,
      clientName: entry.data.clientName,
      date: entry.data.date,
      order: entry.data.order,
      featured: entry.data.featured,
      gear: entry.data.gear,
      title: localized(entry.data.title, locale),
      location: localized(entry.data.location, locale),
      goal: localized(entry.data.goal, locale),
      result: localized(entry.data.result, locale),
      description: localized(entry.data.description, locale),
      cuts: entry.data.cuts.map((cut) => ({
        ...cut,
        ...cutDimensions(cut.poster, cut.orientation),
        label: localized(cut.label, locale),
      })),
    }))
    .filter((p) => p.featured)
    .sort((a, b) => a.order - b.order);
}

export async function getKit(locale: Locale) {
  const entries = await getCollection('kit');
  return entries
    .map((entry) => ({
      id: entry.id,
      name: entry.data.name,
      kind: entry.data.kind,
      photo: entry.data.photo,
      order: entry.data.order,
      sample: entry.data.sample,
      class: localized(entry.data.class, locale),
      tagline: localized(entry.data.tagline, locale),
      specs: entry.data.specs.map((s) => ({
        label: localized(s.label, locale),
        value: localized(s.value, locale),
      })),
      bestFor: localizedList(entry.data.bestFor, locale),
      limits: localizedList(entry.data.limits, locale),
    }))
    .sort((a, b) => a.order - b.order);
}

/** Trimmed tagline for the kit tab strip — "Meteor75 Pro II" is already short. */
export function kitTabMeta(specs: { label: string; value: string }[], count = 3): string {
  return specs
    .slice(0, count)
    .map((s) => s.value)
    .join(' · ');
}

/** 58 -> "0:58". Shown in mono, so no unit suffix. */
export function formatDuration(seconds?: number): string {
  if (!seconds || seconds <= 0) return '';
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(Math.round(seconds % 60)).padStart(2, '0')}`;
}
