import { htmlLang, type Locale } from '../i18n/ui';

/**
 * Structured data for the home page, as a single @graph.
 *
 * Deliberately no BreadcrumbList: the site is one page per locale, and a
 * breadcrumb trail of length one is noise that Google ignores.
 */

type Licence = { number: string; type: string };

type ProjectCut = {
  src: string;
  poster?: string;
  label: string;
  width: number;
  height: number;
  durationSec?: number;
};

type Project = {
  title: string;
  description: string;
  clientType: string;
  date: Date;
  cuts: ProjectCut[];
};

interface Input {
  locale: Locale;
  origin: URL;
  name: string;
  description: string;
  telephone: string;
  email: string;
  serviceArea: string;
  instagram: string;
  licences: Licence[];
  services: { title: string; description: string }[];
  projects: Project[];
  ogImage?: string;
}

/** 58 -> "PT58S". ISO 8601, which is what schema.org expects. */
function isoDuration(seconds?: number): string | undefined {
  if (!seconds || seconds <= 0) return undefined;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `PT${m > 0 ? `${m}M` : ''}${s}S`;
}

export function structuredData(input: Input) {
  const {
    locale, origin, name, description, telephone, email,
    serviceArea, instagram, licences, services, projects, ogImage,
  } = input;

  const absolute = (path: string) => new URL(path, origin).href;
  const businessId = `${origin.href}#business`;

  const business = {
    '@type': 'ProfessionalService',
    '@id': businessId,
    name,
    description,
    url: origin.href,
    ...(ogImage ? { image: absolute(ogImage) } : {}),
    telephone,
    email,
    // No street address on purpose: this is a service-area business with no
    // premises to visit, and inventing one would be both false and misleading
    // to anyone who tried to turn up.
    address: {
      '@type': 'PostalAddress',
      addressLocality: serviceArea,
      addressCountry: 'TR',
    },
    areaServed: { '@type': 'City', name: serviceArea },
    sameAs: [`https://instagram.com/${instagram}`],
    knowsLanguage: ['tr', 'en'],
    /**
     * The real licence numbers, as printed on the certificates. This is the
     * kind of claim a search engine can check against a register, which is
     * exactly why it is worth stating in machine-readable form.
     */
    hasCredential: licences.map((licence) => ({
      '@type': 'EducationalOccupationalCredential',
      credentialCategory: 'license',
      name: licence.type,
      identifier: licence.number,
      recognizedBy: { '@type': 'Organization', name: 'SHGM' },
    })),
    makesOffer: services.map((service) => ({
      '@type': 'Offer',
      itemOffered: {
        '@type': 'Service',
        name: service.title,
        description: service.description,
      },
    })),
  };

  const videos = projects.flatMap((project) =>
    project.cuts.map((cut) => ({
      '@type': 'VideoObject',
      name: `${project.title}, ${cut.label}`,
      description: project.description,
      // Self-hosted, so these point at our own files rather than at a
      // third-party player. Google can index a file it can fetch.
      contentUrl: absolute(cut.src),
      ...(cut.poster ? { thumbnailUrl: absolute(cut.poster) } : {}),
      uploadDate: project.date.toISOString().slice(0, 10),
      ...(isoDuration(cut.durationSec)
        ? { duration: isoDuration(cut.durationSec) }
        : {}),
      width: cut.width,
      height: cut.height,
      inLanguage: htmlLang[locale],
      publisher: { '@id': businessId },
    }))
  );

  return {
    '@context': 'https://schema.org',
    '@graph': [business, ...videos],
  };
}
