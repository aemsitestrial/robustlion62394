import { createOptimizedPicture } from '../../scripts/aem.js';

/**
 * Helper to safely extract property elements or child values
 */
function getProp(block, name, fallback = '') {
  const lower = name.toLowerCase();
  const fieldOrder = ['headerVariant', 'tcsLogo', 'tcsLogoLink', 'tataLogo', 'tataLogoLink', 'menu'];

  const getValue = (element) => {
    if (!element) return '';
    const image = element.matches('img') ? element : element.querySelector('picture img, img');
    if (image) return image.getAttribute('src') || image.src;
    const anchor = element.matches('a') ? element : element.querySelector('a');
    if (anchor) return anchor.getAttribute('href') || anchor.textContent.trim();
    return element.dataset.value || element.textContent.trim();
  };

  // 1. Direct dataset or data-aue-prop lookup
  if (block.dataset[name] !== undefined) return block.dataset[name];
  if (block.dataset[lower] !== undefined) return block.dataset[lower];
  const attrElem = block.querySelector(`[data-aue-prop="${name}"], [data-aue-prop="${lower}"]`);
  if (attrElem) return getValue(attrElem);

  // 2. Table row fallback scanning
  const rows = [...block.children];
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const cols = [...row.children];
    if (cols.length >= 2) {
      const key = cols[0].textContent.trim().toLowerCase().replace(/[-_]/g, '');
      if (key === lower.replace(/[-_]/g, '')) {
        return getValue(cols[1]);
      }
    }
  }

  // 3. Published Universal Editor content stores model fields in row order.
  const fieldIndex = fieldOrder.indexOf(name);
  if (fieldIndex >= 0 && rows[fieldIndex]) {
    const cols = [...rows[fieldIndex].children];
    return getValue(cols.length > 1 ? cols[1] : rows[fieldIndex]) || fallback;
  }

  return fallback;
}

function normalizeVariant(value) {
  const normalized = String(value).trim().toLowerCase().replace(/\s+/g, '-');
  return ['standard', 'compact', 'dark', 'centered'].includes(normalized)
    ? normalized
    : 'standard';
}

export default function decorate(block) {
  // 1. Extract Basic Properties
  const config = {
    headerVariant: normalizeVariant(getProp(block, 'headerVariant', 'standard')),
    tcsLogo: getProp(block, 'tcsLogo'),
    tcsLogoLink: getProp(block, 'tcsLogoLink', '/'),
    tataLogo: getProp(block, 'tataLogo'),
    tataLogoLink: getProp(block, 'tataLogoLink', 'https://www.tata.com'),
  };
  const supportedVariants = ['standard', 'compact', 'dark', 'centered'];
  if (!supportedVariants.includes(config.headerVariant)) config.headerVariant = 'standard';

  // 2. Extract Menu Content
  const menuRow = [...block.children][5];
  const menuSource = block.querySelector('[data-aue-prop="menu"]')
    || (menuRow && (menuRow.children[1] || menuRow))
    || block.querySelector('ul');
  let navList = document.createElement('ul');
  navList.className = 'tarun-nav-list';

  if (menuSource) {
    const ul = menuSource.querySelector('ul') || menuSource;
    if (ul.tagName === 'UL') {
      navList = ul.cloneNode(true);
      navList.className = 'tarun-nav-list';
    } else {
      menuSource.querySelectorAll('a[href]').forEach((link) => {
        const item = document.createElement('li');
        item.append(link.cloneNode(true));
        navList.append(item);
      });
    }
  }

  // 3. Rebuild Clean Block DOM
  block.textContent = '';
  block.classList.remove('variant-standard', 'variant-compact', 'variant-dark', 'variant-centered');
  block.classList.add(`variant-${config.headerVariant}`);
  block.dataset.variant = config.headerVariant;

  const navWrapper = document.createElement('div');
  navWrapper.className = 'tarun-nav-wrapper';

  const nav = document.createElement('nav');
  nav.id = 'tarun-nav';
  nav.setAttribute('aria-expanded', 'false');

  // TCS Logo
  const brandPrimary = document.createElement('div');
  brandPrimary.className = 'nav-brand-primary';
  const primaryAnchor = document.createElement('a');
  primaryAnchor.href = config.tcsLogoLink;

  if (config.tcsLogo) {
    primaryAnchor.append(createOptimizedPicture(
      config.tcsLogo,
      'Tata Consultancy Services',
      false,
      [{ width: '300' }],
    ));
  } else {
    primaryAnchor.textContent = 'TCS';
  }
  brandPrimary.append(primaryAnchor);

  // Navigation Links
  const navSections = document.createElement('div');
  navSections.className = 'nav-sections';
  navSections.append(navList);

  // Tata Logo
  const brandSecondary = document.createElement('div');
  brandSecondary.className = 'nav-brand-secondary';
  const secondaryAnchor = document.createElement('a');
  secondaryAnchor.href = config.tataLogoLink;
  secondaryAnchor.target = '_blank';
  secondaryAnchor.rel = 'noopener noreferrer';

  if (config.tataLogo) {
    secondaryAnchor.append(createOptimizedPicture(
      config.tataLogo,
      'TATA Group',
      false,
      [{ width: '160' }],
    ));
  } else {
    secondaryAnchor.textContent = 'TATA';
  }
  brandSecondary.append(secondaryAnchor);

  // Mobile Hamburger Toggle
  const hamburgerWrapper = document.createElement('div');
  hamburgerWrapper.className = 'nav-hamburger';
  const hamburgerButton = document.createElement('button');
  hamburgerButton.type = 'button';
  hamburgerButton.setAttribute('aria-controls', 'tarun-nav');
  hamburgerButton.setAttribute('aria-label', 'Open menu');
  hamburgerButton.setAttribute('aria-expanded', 'false');
  hamburgerButton.innerHTML = '<span class="nav-hamburger-icon"></span>';
  hamburgerButton.addEventListener('click', () => {
    const expanded = nav.getAttribute('aria-expanded') === 'true';
    nav.setAttribute('aria-expanded', expanded ? 'false' : 'true');
    hamburgerButton.setAttribute('aria-expanded', expanded ? 'false' : 'true');
    hamburgerButton.setAttribute('aria-label', expanded ? 'Open menu' : 'Close menu');
    document.body.style.overflowY = !expanded || window.innerWidth >= 1025 ? '' : 'hidden';
  });
  hamburgerWrapper.append(hamburgerButton);

  // Assemble
  nav.append(hamburgerWrapper, brandPrimary, navSections, brandSecondary);
  navWrapper.append(nav);
  block.append(navWrapper);
}
