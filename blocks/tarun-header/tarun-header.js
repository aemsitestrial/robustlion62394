import { createOptimizedPicture } from '../../scripts/aem.js';

/**
 * Helper to safely extract property elements or child values
 */
function getProp(block, name, fallback = '') {
  const lower = name.toLowerCase();

  // 1. Direct dataset or data-aue-prop lookup
  if (block.dataset[name] !== undefined) return block.dataset[name];
  if (block.dataset[lower] !== undefined) return block.dataset[lower];
  const attrElem = block.querySelector(`[data-aue-prop="${name}"], [data-aue-prop="${lower}"]`);
  if (attrElem) {
    const img = attrElem.matches('img') ? attrElem : attrElem.querySelector('picture img, img');
    if (img) return img.src;
    const anchor = attrElem.querySelector('a');
    if (anchor) return anchor.getAttribute('href') || anchor.textContent.trim();
    return attrElem.dataset.value || attrElem.textContent.trim();
  }

  // 2. Table row fallback scanning
  const rows = [...block.children];
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const cols = [...row.children];
    if (cols.length >= 2) {
      const key = cols[0].textContent.trim().toLowerCase().replace(/[-_]/g, '');
      if (key === lower.replace(/[-_]/g, '')) {
        const img = cols[1].querySelector('img');
        if (img) return img.src;
        const anchor = cols[1].querySelector('a');
        if (anchor) return anchor.getAttribute('href') || anchor.textContent.trim();
        return cols[1].textContent.trim();
      }
    }
  }

  return fallback;
}

export default function decorate(block) {
  // 1. Extract Basic Properties
  const config = {
    headerVariant: getProp(block, 'headerVariant', 'standard').toLowerCase(),
    tcsLogo: getProp(block, 'tcsLogo'),
    tcsLogoLink: getProp(block, 'tcsLogoLink', '/'),
    tataLogo: getProp(block, 'tataLogo'),
    tataLogoLink: getProp(block, 'tataLogoLink', 'https://www.tata.com'),
  };

  // 2. Extract Menu Content
  const menuSource = block.querySelector('[data-aue-prop="menu"]') || block.querySelector('ul');
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
    document.body.style.overflowY = expanded ? '' : 'hidden';
  });
  hamburgerWrapper.append(hamburgerButton);

  // Assemble
  nav.append(hamburgerWrapper, brandPrimary, navSections, brandSecondary);
  navWrapper.append(nav);
  block.append(navWrapper);
}
