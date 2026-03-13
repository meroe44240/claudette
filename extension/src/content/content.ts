// HumanUp ATS - LinkedIn Content Script
// Runs on linkedin.com pages to extract profile/company data
// Robust selectors with multiple fallback strategies for LinkedIn DOM (2025-2026)

interface ExperienceData {
  titre: string;
  entreprise: string;
  anneeDebut: number | null;
  anneeFin: number | null;
}

interface PersonData {
  type: 'person';
  prenom: string;
  nom: string;
  poste: string;
  entreprise: string;
  localisation: string;
  linkedinUrl: string;
  photoUrl: string;
  experiences: ExperienceData[];
}

interface CompanyData {
  type: 'company';
  nom: string;
  secteur: string;
  taille: string;
  localisation: string;
  linkedinUrl: string;
  siteWeb: string;
  logoUrl: string;
}

interface UnknownPageData {
  type: 'unknown';
}

type PageData = PersonData | CompanyData | UnknownPageData;

// ---------------------------------------------------------------------------
// Helper utilities
// ---------------------------------------------------------------------------

function clean(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function queryText(...selectors: string[]): string {
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el?.textContent?.trim()) {
      return clean(el.textContent);
    }
  }
  return '';
}

/** Check if text is a promotional banner / group badge */
function isPromotionalText(text: string): boolean {
  return [
    /club\s+de/i,
    /\+\s*\d{2,}/,
    /recruteurs?\s+extern/i,
    /rejoign/i,
    /premium/i,
    /essai\s+gratuit/i,
    /open\s+to\s+work/i,
    /\bhiring\b/i,
    /\bfree\s+trial/i,
    /\btry\s+premium/i,
    /en\s+savoir\s+plus/i,
    /s['\u2019]abonner/i,
    /\bfollow\b/i,
    /subscribe/i,
    /profil\s+am[eé]lior/i,
    /import\s+to\s+/i,
  ].some(p => p.test(text));
}

/** Check if text is connection/follower count or contact info */
function isConnectionText(text: string): boolean {
  return /connexion|follower|abonn[eé]|contact\s*info|coordonn[eé]|relation\s+de\s+\d/i.test(text);
}

// ---------------------------------------------------------------------------
// Person profile extraction (linkedin.com/in/*)
// ---------------------------------------------------------------------------

function extractPersonData(): PersonData {
  const fullName = extractFullName();
  const { poste, entreprise } = extractExperienceData();
  const localisation = extractLocation();
  const photoUrl = extractProfilePhoto();
  const { prenom, nom } = splitName(fullName);
  const experiences = extractAllExperiences();

  return {
    type: 'person',
    prenom,
    nom,
    poste,
    entreprise,
    localisation,
    linkedinUrl: cleanLinkedInUrl(),
    photoUrl,
    experiences,
  };
}

// --- Name extraction ---

function extractFullName(): string {
  const nameSelectors = [
    'main section:first-of-type h1',
    'h1.text-heading-xlarge',
    '.pv-text-details--left-aligned h1',
    'h1[data-anonymize="person-name"]',
    '.top-card-layout__title',
    '.artdeco-card h1',
    '.scaffold-layout__main h1',
  ];

  for (const sel of nameSelectors) {
    const elements = document.querySelectorAll(sel);
    for (const el of elements) {
      const text = clean(el.textContent || '');
      if (text.length >= 2 && text.length <= 80 && !isPromotionalText(text) && !isConnectionText(text)) {
        return text;
      }
    }
  }

  // Fallback: any h1 inside main that looks like a name
  const allH1s = document.querySelectorAll('main h1');
  for (const h1 of allH1s) {
    const text = clean(h1.textContent || '');
    if (text.length >= 2 && text.length <= 80 && !isPromotionalText(text)) {
      return text;
    }
  }

  return nameFromUrlSlug();
}

// --- Experience-based extraction (poste + entreprise) ---

function extractExperienceData(): { poste: string; entreprise: string } {
  // Strategy 1: Experience section with #experience anchor
  const result = tryExperienceSection();
  if (result.poste) return result;

  // Strategy 2: The "current position" card in the top/sidebar area
  const cardResult = tryCurrentPositionCard();
  if (cardResult.poste) return cardResult;

  // Strategy 3: Fallback to headline parsing (less reliable)
  const headline = extractHeadline();
  return parsePosteFromHeadline(headline);
}

function tryExperienceSection(): { poste: string; entreprise: string } {
  // Find the experience section - LinkedIn uses #experience as an anchor
  const experienceAnchor = document.querySelector('#experience');
  if (!experienceAnchor) return { poste: '', entreprise: '' };

  // The list container is a sibling of the anchor's parent
  const section = experienceAnchor.closest('section') || experienceAnchor.parentElement?.parentElement;
  if (!section) return { poste: '', entreprise: '' };

  // Get all list items in the experience section
  const listItems = section.querySelectorAll('li.pvs-list__paged-list-item');
  if (listItems.length === 0) return { poste: '', entreprise: '' };

  const firstItem = listItems[0];

  // LinkedIn has two layouts for experience entries:
  // A) Single role: title (bold) + company (normal) + dates
  // B) Grouped by company: company (bold) + sub-list of roles

  // Try to detect grouped layout: if there's a nested list, it's grouped
  const nestedList = firstItem.querySelector('ul, .pvs-list__container');

  if (nestedList) {
    // Grouped layout: company name is the top-level bold text
    // Individual role titles are in nested items
    return extractGroupedExperience(firstItem, nestedList);
  } else {
    // Single role layout
    return extractSingleExperience(firstItem);
  }
}

function extractSingleExperience(item: Element): { poste: string; entreprise: string } {
  // In single layout:
  // - First .t-bold span[aria-hidden="true"] = job title
  // - First .t-14.t-normal span[aria-hidden="true"] = company name (with " · Full-time" etc)
  let poste = '';
  let entreprise = '';

  // Job title: typically the first bold text
  const boldSpans = item.querySelectorAll('.t-bold span[aria-hidden="true"], .t-bold > span:first-child');
  for (const span of boldSpans) {
    const text = clean(span.textContent || '');
    if (text && text.length >= 2) {
      poste = text;
      break;
    }
  }

  // Company name: the normal-weight text after the title
  const normalSpans = item.querySelectorAll('.t-14.t-normal span[aria-hidden="true"], .t-14.t-normal > span:first-child');
  for (const span of normalSpans) {
    const text = clean(span.textContent || '');
    if (text && text.length >= 2) {
      // Company text may include " · Temps plein", " · Full-time", " · CDI"
      entreprise = text.split(/\s*[·•]\s*/)[0].trim();
      break;
    }
  }

  // Alternative: look for company link
  if (!entreprise) {
    const companyLink = item.querySelector('a[href*="/company/"] span[aria-hidden="true"]');
    if (companyLink?.textContent?.trim()) {
      entreprise = companyLink.textContent.trim();
    }
  }

  return { poste, entreprise };
}

function extractGroupedExperience(item: Element, nestedList: Element): { poste: string; entreprise: string } {
  let entreprise = '';
  let poste = '';

  // Company name is the top-level bold text of the item (outside nested list)
  const topBold = item.querySelector(':scope > div .t-bold span[aria-hidden="true"]');
  if (topBold?.textContent?.trim()) {
    entreprise = topBold.textContent.trim();
  }

  // Alternative: company link
  if (!entreprise) {
    const companyLink = item.querySelector(':scope > div a[href*="/company/"] span[aria-hidden="true"]');
    if (companyLink?.textContent?.trim()) {
      entreprise = companyLink.textContent.trim();
    }
  }

  // First role in the nested list = most recent
  const nestedItems = nestedList.querySelectorAll('li');
  if (nestedItems.length > 0) {
    const firstRole = nestedItems[0];
    const roleTitle = firstRole.querySelector('.t-bold span[aria-hidden="true"]');
    if (roleTitle?.textContent?.trim()) {
      poste = roleTitle.textContent.trim();
    }
  }

  return { poste, entreprise };
}

function tryCurrentPositionCard(): { poste: string; entreprise: string } {
  // LinkedIn sometimes shows a "current position" card in the aside/sidebar
  // Look for experience-related links with titles
  const experienceLinks = document.querySelectorAll('a[href*="/in/"][href*="experience-section"], a[data-field="experience_company_logo"]');
  for (const link of experienceLinks) {
    const parent = link.closest('li') || link.parentElement;
    if (!parent) continue;
    const boldText = parent.querySelector('.t-bold span[aria-hidden="true"]');
    const normalText = parent.querySelector('.t-14.t-normal span[aria-hidden="true"]');
    if (boldText?.textContent?.trim()) {
      return {
        poste: clean(boldText.textContent),
        entreprise: normalText ? clean(normalText.textContent).split(/\s*[·•]\s*/)[0] : '',
      };
    }
  }
  return { poste: '', entreprise: '' };
}

function extractHeadline(): string {
  const headlineSelectors = [
    '.pv-text-details--left-aligned .text-body-medium',
    '.text-body-medium.break-words',
    'main section:first-of-type .text-body-medium',
    '.top-card-layout__headline',
  ];

  for (const sel of headlineSelectors) {
    const elements = document.querySelectorAll(sel);
    for (const el of elements) {
      const text = clean(el.textContent || '');
      if (text && text.length >= 3 && !isPromotionalText(text) && !isConnectionText(text)) {
        return text;
      }
    }
  }
  return '';
}

function parsePosteFromHeadline(headline: string): { poste: string; entreprise: string } {
  if (!headline) return { poste: '', entreprise: '' };

  // Try to split on common separators: "Title chez Company", "Title at Company"
  const separators = [
    /\s+chez\s+/i,
    /\s+at\s+/i,
    /\s+@\s+/,
  ];

  for (const sep of separators) {
    const parts = headline.split(sep);
    if (parts.length >= 2) {
      return {
        poste: parts[0].trim(),
        entreprise: parts[parts.length - 1].trim(),
      };
    }
  }

  // If headline has pipes, take the first segment as poste
  if (headline.includes('|')) {
    const firstPart = headline.split('|')[0].trim();
    return { poste: firstPart, entreprise: '' };
  }

  return { poste: headline, entreprise: '' };
}

// --- Location extraction ---

function extractLocation(): string {
  // The location on LinkedIn is typically "Bordeaux et périphérie" in the top card
  // We need to avoid: connection degree ("relation de 1er"), follower counts, contact info

  // Strategy 1: Look in the top card for location-like text
  const topSection = document.querySelector('main section:first-of-type') || document.querySelector('.pv-text-details--left-aligned')?.closest('section');

  if (topSection) {
    // LinkedIn often has the location in a span.text-body-small within the top card
    const smallTexts = topSection.querySelectorAll('.text-body-small');
    for (const el of smallTexts) {
      const text = clean(el.textContent || '');
      if (!text || text.length < 3) continue;
      if (isConnectionText(text)) continue;
      if (isPromotionalText(text)) continue;
      if (text.includes('@')) continue;

      // Clean: remove "Coordonnées" and similar suffixes
      let loc = text.split(/\s*[·•]\s*/)[0]?.trim();
      // Remove "Coordonnées" if it got concatenated
      loc = loc?.replace(/\s*Coordonn[eé]es\s*/i, '').trim();
      if (loc && loc.length >= 2 && !isConnectionText(loc)) {
        return loc;
      }
    }
  }

  // Strategy 2: Try specific LinkedIn location selectors
  const locSelectors = [
    '.pv-text-details--left-aligned span.text-body-small:not(:has(a))',
    '.top-card-layout__first-subline .top-card__subline-item:first-child',
  ];

  for (const sel of locSelectors) {
    try {
      const el = document.querySelector(sel);
      const text = clean(el?.textContent || '');
      if (text && !isConnectionText(text) && text.length >= 2) {
        return text.split(/\s*[·•]\s*/)[0]?.trim() || text;
      }
    } catch {
      // :has() not supported in older browsers, skip
    }
  }

  // Strategy 3: Look for text that contains known location patterns
  // (French cities, "et périphérie", "région de", etc.)
  const allSmallTexts = document.querySelectorAll('main .text-body-small');
  for (const el of allSmallTexts) {
    const text = clean(el.textContent || '');
    if (/p[eé]riph[eé]rie|r[eé]gion\s+de|[Ff]rance|[Pp]aris|[Ll]yon|[Mm]arseille|[Bb]ordeaux|[Tt]oulouse|[Nn]antes|[Ll]ille/i.test(text)) {
      return text.split(/\s*[·•]\s*/)[0]?.trim() || text;
    }
  }

  return '';
}

// --- Profile photo extraction ---

function extractProfilePhoto(): string {
  console.log('[HumanUp] Starting photo extraction...');

  // Strategy 1: Specific LinkedIn selectors
  const photoSelectors = [
    'img.pv-top-card-profile-picture__image--show',
    'img.pv-top-card-profile-picture__image',
    '.pv-top-card-profile-picture__container img',
    '.pv-top-card-profile-picture img',
    '.pv-top-card__photo-wrapper img',
    'img.evi-image',
    '.presence-entity__image',
    'img[src*="profile-displayphoto"]',
    'img[src*="profile-originalphoto"]',
    '.top-card-layout__entity-image',
    '.top-card__profile-image',
  ];

  for (const sel of photoSelectors) {
    try {
      const img = document.querySelector(sel) as HTMLImageElement | null;
      if (img?.src && isValidProfilePhoto(img.src)) {
        console.log('[HumanUp] Photo found via selector:', sel, img.src.substring(0, 100));
        return img.src;
      }
    } catch { /* skip */ }
  }

  // Strategy 2: Scan ALL images on the page for licdn profile photos
  const allImgs = document.querySelectorAll('img') as NodeListOf<HTMLImageElement>;
  console.log(`[HumanUp] Scanning ${allImgs.length} total images on page...`);

  for (const img of allImgs) {
    const src = img.src || img.getAttribute('data-delayed-url') || img.getAttribute('data-ghost-url') || '';
    if (!src) continue;

    if (isValidProfilePhoto(src)) {
      const rect = img.getBoundingClientRect();
      console.log(`[HumanUp] Valid licdn image: ${src.substring(0, 100)}... size=${rect.width}x${rect.height} class="${img.className}"`);

      // Accept if it's in the top part of the page and reasonably sized
      if (rect.width >= 40 && rect.height >= 40 && rect.top < 600) {
        console.log('[HumanUp] Photo selected (img in top area):', src.substring(0, 100));
        return src;
      }
    }
  }

  // Strategy 3: Check for background-image on divs (LinkedIn sometimes uses this)
  const topSection = document.querySelector('main section:first-of-type');
  if (topSection) {
    const divs = topSection.querySelectorAll('div, span, button, a');
    for (const el of divs) {
      const style = window.getComputedStyle(el);
      const bgImg = style.backgroundImage;
      if (bgImg && bgImg !== 'none' && bgImg.includes('licdn.com') && !bgImg.includes('ghost')) {
        const match = bgImg.match(/url\(["']?([^"')]+)["']?\)/);
        if (match?.[1]) {
          console.log('[HumanUp] Photo found via background-image:', match[1].substring(0, 100));
          return match[1];
        }
      }
    }
  }

  // Strategy 4: Check img elements with data-delayed-url (lazy loading)
  for (const img of allImgs) {
    const delayedUrl = img.getAttribute('data-delayed-url') || img.getAttribute('data-ghost-url') || '';
    if (delayedUrl && isValidProfilePhoto(delayedUrl)) {
      const rect = img.getBoundingClientRect();
      if (rect.top < 600) {
        console.log('[HumanUp] Photo found via data-delayed-url:', delayedUrl.substring(0, 100));
        return delayedUrl;
      }
    }
  }

  console.log('[HumanUp] No profile photo found.');
  return '';
}

function isValidProfilePhoto(src: string): boolean {
  if (!src) return false;
  // Accept any media.licdn.com image URL
  const isLinkedIn = src.includes('media.licdn.com') || src.includes('media-exp1.licdn.com') || src.includes('media-exp2.licdn.com');
  if (!isLinkedIn) return false;
  if (src.includes('ghost')) return false;
  if (src.includes('company-logo')) return false;
  if (src.includes('data:')) return false;
  if (src.includes('static.licdn')) return false;
  if (src.includes('aero-v1')) return false; // LinkedIn UI icons
  return true;
}

// ---------------------------------------------------------------------------
// Name utilities
// ---------------------------------------------------------------------------

function splitName(fullName: string): { prenom: string; nom: string } {
  const parts = fullName.split(/\s+/);
  if (parts.length <= 1) {
    return { prenom: parts[0] || '', nom: '' };
  }

  // Handle French particles: "de", "du", "des", "le", "la", etc.
  const particles = ['de', 'du', 'des', 'le', 'la', 'van', 'von', 'el', 'al', 'di', 'del', 'ben', 'bin'];
  if (parts.length >= 3 && particles.includes(parts[1].toLowerCase())) {
    return { prenom: parts[0], nom: parts.slice(1).join(' ') };
  }

  return { prenom: parts[0], nom: parts.slice(1).join(' ') };
}

function nameFromUrlSlug(): string {
  const match = window.location.href.match(/linkedin\.com\/in\/([^/?#]+)/);
  if (!match) return '';
  const slug = match[1].replace(/-\d+$/, '');
  return slug
    .split('-')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

// ---------------------------------------------------------------------------
// Full experience list extraction
// ---------------------------------------------------------------------------

function extractAllExperiences(): ExperienceData[] {
  const experiences: ExperienceData[] = [];

  // Strategy 1: Find section via #experience anchor
  let section: Element | null = null;
  const experienceAnchor = document.querySelector('#experience');
  if (experienceAnchor) {
    section = experienceAnchor.closest('section') || experienceAnchor.parentElement?.parentElement || null;
  }

  // Strategy 2: Find experience section by aria-label or heading text
  if (!section) {
    const allSections = document.querySelectorAll('main section');
    for (const sec of allSections) {
      const heading = sec.querySelector('h2, [role="heading"]');
      const text = heading?.textContent?.trim().toLowerCase() || '';
      if (text.includes('experience') || text.includes('expérience') || text.includes('exp\u00e9rience')) {
        section = sec;
        break;
      }
    }
  }

  // Strategy 3: Find by data attributes or class patterns
  if (!section) {
    const anchors = document.querySelectorAll('[id*="experience"], [data-section="experience"]');
    for (const anchor of anchors) {
      const sec = anchor.closest('section');
      if (sec) { section = sec; break; }
    }
  }

  if (!section) {
    console.log('[HumanUp] No experience section found in DOM');
    return experiences;
  }

  console.log('[HumanUp] Experience section found, extracting...');

  // Get all list items in the experience section
  const listItems = section.querySelectorAll('li.pvs-list__paged-list-item');

  // Fallback: try broader selector if the specific one yields nothing
  const items = listItems.length > 0
    ? listItems
    : section.querySelectorAll('li[class*="pvs-list"], li[class*="artdeco-list"]');

  for (const item of items) {
    const nestedList = item.querySelector('ul, .pvs-list__container');

    if (nestedList) {
      // Grouped layout: company name at top, roles in nested list
      let companyName = '';
      const topBold = item.querySelector(':scope > div .t-bold span[aria-hidden="true"]');
      if (topBold?.textContent?.trim()) {
        companyName = topBold.textContent.trim();
      }
      if (!companyName) {
        const companyLink = item.querySelector(':scope > div a[href*="/company/"] span[aria-hidden="true"]');
        if (companyLink?.textContent?.trim()) companyName = companyLink.textContent.trim();
      }
      // Fallback: any bold text at top level
      if (!companyName) {
        const anyBold = item.querySelector(':scope > div [class*="bold"] span');
        if (anyBold?.textContent?.trim()) companyName = anyBold.textContent.trim();
      }

      const nestedItems = nestedList.querySelectorAll('li');
      for (const nestedItem of nestedItems) {
        const roleTitle = nestedItem.querySelector('.t-bold span[aria-hidden="true"]')
          || nestedItem.querySelector('[class*="bold"] span');
        const titre = roleTitle?.textContent?.trim() || '';
        if (!titre) continue;

        const dates = extractDatesFromItem(nestedItem);
        experiences.push({
          titre,
          entreprise: companyName,
          anneeDebut: dates.anneeDebut,
          anneeFin: dates.anneeFin,
        });
      }
    } else {
      // Single role layout
      let titre = '';
      const boldSpans = item.querySelectorAll('.t-bold span[aria-hidden="true"]');
      for (const span of boldSpans) {
        const text = clean(span.textContent || '');
        if (text && text.length >= 2) { titre = text; break; }
      }
      // Fallback: any bold-like span
      if (!titre) {
        const anyBold = item.querySelector('[class*="bold"] span');
        if (anyBold?.textContent?.trim() && anyBold.textContent.trim().length >= 2) {
          titre = anyBold.textContent.trim();
        }
      }
      if (!titre) continue;

      let companyName = '';
      const normalSpans = item.querySelectorAll('.t-14.t-normal span[aria-hidden="true"]');
      for (const span of normalSpans) {
        const text = clean(span.textContent || '');
        if (text && text.length >= 2) {
          companyName = text.split(/\s*[·•]\s*/)[0].trim();
          break;
        }
      }
      if (!companyName) {
        const companyLink = item.querySelector('a[href*="/company/"] span[aria-hidden="true"]');
        if (companyLink?.textContent?.trim()) companyName = companyLink.textContent.trim();
      }

      const dates = extractDatesFromItem(item);
      experiences.push({
        titre,
        entreprise: companyName,
        anneeDebut: dates.anneeDebut,
        anneeFin: dates.anneeFin,
      });
    }
  }

  console.log(`[HumanUp] Extracted ${experiences.length} experiences`);
  return experiences;
}

function extractDatesFromItem(item: Element): { anneeDebut: number | null; anneeFin: number | null } {
  // Look for date-like text: "janv. 2020 - présent", "2018 - 2021", etc.
  // Use multiple selector strategies for robustness
  const dateSelectors = [
    '.t-14.t-normal.t-black--light span[aria-hidden="true"]',
    '.pvs-entity__caption-wrapper span[aria-hidden="true"]',
    '[class*="black--light"] span[aria-hidden="true"]',
    '.t-14 span[aria-hidden="true"]',
  ];

  for (const sel of dateSelectors) {
    const dateTexts = item.querySelectorAll(sel);
    for (const el of dateTexts) {
      const text = clean(el.textContent || '');
      // Match patterns like "janv. 2020 - mai 2023" or "2020 - Present"
      const yearMatches = text.match(/\b(20\d{2}|19\d{2})\b/g);
      if (yearMatches && yearMatches.length >= 1) {
        const anneeDebut = parseInt(yearMatches[0], 10);
        let anneeFin: number | null = null;
        if (yearMatches.length >= 2) {
          anneeFin = parseInt(yearMatches[yearMatches.length - 1], 10);
        }
        // If "présent" or "present" or "aujourd'hui" is mentioned, anneeFin = null (current)
        if (/pr[eé]sent|present|aujourd|current|actuel/i.test(text)) {
          anneeFin = null;
        }
        return { anneeDebut, anneeFin };
      }
    }
  }

  // Fallback: scan all text content in the item for year patterns
  const allText = item.textContent || '';
  const yearMatches = allText.match(/\b(20\d{2}|19\d{2})\b/g);
  if (yearMatches && yearMatches.length >= 1) {
    const anneeDebut = parseInt(yearMatches[0], 10);
    let anneeFin: number | null = null;
    if (yearMatches.length >= 2) {
      anneeFin = parseInt(yearMatches[yearMatches.length - 1], 10);
    }
    if (/pr[eé]sent|present|aujourd|current|actuel/i.test(allText)) {
      anneeFin = null;
    }
    return { anneeDebut, anneeFin };
  }

  return { anneeDebut: null, anneeFin: null };
}

// ---------------------------------------------------------------------------
// Company page extraction (linkedin.com/company/*)
// ---------------------------------------------------------------------------

function extractCompanyData(): CompanyData {
  const nom = queryText(
    'h1.org-top-card-summary__title',
    'h1.top-card-layout__title',
    '.org-top-card-summary__title span',
    'h1[data-anonymize="company-name"]',
    'main h1',
  );

  const infoItems = document.querySelectorAll('.org-top-card-summary-info-list__info-item');
  let secteur = '';
  let taille = '';
  let localisation = '';

  if (infoItems.length >= 1) secteur = infoItems[0]?.textContent?.trim() || '';
  if (infoItems.length >= 2) taille = infoItems[1]?.textContent?.trim() || '';
  if (infoItems.length >= 3) localisation = infoItems[2]?.textContent?.trim() || '';

  if (!secteur || !taille) {
    const aboutItems = document.querySelectorAll('.org-page-details__definition-term');
    const aboutValues = document.querySelectorAll('.org-page-details__definition-text');
    for (let i = 0; i < aboutItems.length; i++) {
      const label = aboutItems[i]?.textContent?.trim().toLowerCase() || '';
      const value = aboutValues[i]?.textContent?.trim() || '';
      if ((label.includes('secteur') || label.includes('industry')) && !secteur) secteur = value;
      if ((label.includes('taille') || label.includes('size') || label.includes('effectif')) && !taille) taille = value;
    }
  }

  const siteWeb = extractCompanyWebsite();
  const logoUrl = extractCompanyLogo();

  return { type: 'company', nom, secteur, taille, localisation, linkedinUrl: cleanLinkedInUrl(), siteWeb, logoUrl };
}

function extractCompanyWebsite(): string {
  const link = document.querySelector('.org-top-card-primary-actions__inner a[href*="http"]') as HTMLAnchorElement | null;
  if (link?.href) return link.href;
  const aboutLink = document.querySelector('.org-about-company-module__company-page-url a') as HTMLAnchorElement | null;
  if (aboutLink?.href) return aboutLink.href;
  const topLinks = document.querySelectorAll('.org-top-card-primary-actions a') as NodeListOf<HTMLAnchorElement>;
  for (const a of topLinks) {
    if (a.href && !a.href.includes('linkedin.com')) return a.href;
  }
  return '';
}

function extractCompanyLogo(): string {
  const selectors = [
    '.org-top-card-primary-content__logo-container img',
    'img.org-top-card-primary-content__logo',
    'main img[src*="company-logo"]',
  ];
  for (const sel of selectors) {
    const img = document.querySelector(sel) as HTMLImageElement | null;
    if (img?.src && img.src.includes('licdn.com')) return img.src;
  }
  return '';
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function cleanLinkedInUrl(): string {
  const url = window.location.href.split('?')[0].split('#')[0];
  return url.replace(/\/+$/, '');
}

function getPageData(): PageData {
  const url = window.location.href;
  if (url.includes('linkedin.com/in/')) {
    try {
      return extractPersonData();
    } catch (err) {
      console.error('[HumanUp] Error extracting person data:', err);
      return { type: 'unknown' };
    }
  }
  if (url.includes('linkedin.com/company/')) {
    try {
      return extractCompanyData();
    } catch (err) {
      console.error('[HumanUp] Error extracting company data:', err);
      return { type: 'unknown' };
    }
  }
  return { type: 'unknown' };
}

// ---------------------------------------------------------------------------
// Message listener
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener(
  (
    message: { type: string },
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: PageData) => void
  ) => {
    if (message.type === 'GET_PAGE_DATA') {
      const heading = document.querySelector(
        'h1.text-heading-xlarge, h1.org-top-card-summary__title, .pv-text-details--left-aligned h1, main section:first-of-type h1, main h1'
      );

      if (heading) {
        sendResponse(getPageData());
      } else {
        setTimeout(() => sendResponse(getPageData()), 1500);
      }
    }
    return true;
  }
);
