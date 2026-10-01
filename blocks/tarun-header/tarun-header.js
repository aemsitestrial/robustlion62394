import { createOptimizedPicture } from '../../scripts/aem.js';

/**
 * Safely extracts property elements or child values
 * @param {Element} block The block container element
 * @param {string} name Property name
 * @param {string} fallback Default string value
 * @returns {string} Resolved image source URL or text string
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

  // 2. Table row scanning
  const rows = [...block.children];
  const targetRow = rows.find((row) => {
    const cols = [...row.children];
    if (cols.length >= 2) {
      const key = cols[0].textContent.trim().toLowerCase().replace(/[-_]/g, '');
      return key === lower.replace(/[-_]/g, '');
    }
    return false;
  });

  if (targetRow) {
    const cols = [...targetRow.children];
    const img = cols[1].querySelector('img');
    if (img) return img.src;
    const anchor = cols[1].querySelector('a');
    if (anchor) return anchor.getAttribute('href') || anchor.textContent.trim();
    return cols[1].textContent.trim();
  }

  return fallback;
}

/**
 * Main decorator for the basic Tarun Header block
 * @param {Element} block The block container element
 */
export default function decorate(block) {
  const config = {
    tcsLogo: getProp(block, 'tcsLogo'),
    tcsLogoLink: getProp(block, 'tcsLogoLink', '/'),
    tataLogo: getProp(block, 'tataLogo'),
    tataLogoLink: getProp(block, 'tataLogoLink', 'https://www.tata.com'),
  };

  // Extract Menu Content
  const menuSource = block.querySelector('[data-aue-prop="menu"]') || block.querySelector('ul');
  let navList = document.createElement('ul');
  navList.className = 'tarun-nav-list';

  if (menuSource) {
    const ul = menuSource.querySelector('ul') || menuSource;
    if (ul.tagName === 'UL') {
      navList = ul.cloneNode(true);
      navList.className = 'tarun-nav-list';
      navList.querySelectorAll(':scope > li').forEach((li) => {
        if (li.querySelector('ul')) {
          li.classList.add('has-submenu');
        }
      });
    } else {
      menuSource.querySelectorAll('a[href]').forEach((link) => {
        const item = document.createElement('li');
        item.append(link.cloneNode(true));
        navList.append(item);
      });
    }
  }

  // Clear Block Content
  block.textContent = '';

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
