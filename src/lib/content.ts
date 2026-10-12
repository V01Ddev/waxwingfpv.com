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
