/**
 * Utility helper to extract property values from Universal Editor dataset or child elements
 */
function getProp(block, name, fallback = '') {
  const lower = name.toLowerCase();

  // 1. Direct dataset lookup
  if (block.dataset[name] !== undefined) return block.dataset[name];
  if (block.dataset[lower] !== undefined) return block.dataset[lower];

  // 2. data-aue-prop attribute lookup
  const attrElem = block.querySelector(`[data-aue-prop="${name}"], [data-aue-prop="${lower}"]`);
  if (attrElem) {
    const img = attrElem.querySelector('img');
    if (img) return img.src;
    const anchor = attrElem.querySelector('a');
    if (anchor) return anchor.getAttribute('href') || anchor.textContent.trim();
    return attrElem.dataset.value || attrElem.getAttribute('value') || attrElem.textContent.trim();
  }

  // 3. Fallback scanning for decorated table/child rows
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

/**
 * Toggles mobile navigation drawer state and manages body scroll locking
 */
function toggleMobileMenu(nav, button, forceExpanded = null) {
  const isExpanded = forceExpanded !== null
    ? forceExpanded
    : nav.getAttribute('aria-expanded') !== 'true';

  nav.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');
  button.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');
  button.setAttribute('aria-label', isExpanded ? 'Close navigation' : 'Open navigation');

  document.body.style.overflowY = (isExpanded && window.innerWidth < 1025) ? 'hidden' : '';
}

/**
 * Extracts and parses the nested parent-child navigation tree from DOM
 */
function parseNavTree(block) {
  const navContainer = document.createElement('ul');
  navContainer.className = 'tarun-nav-parents';

  // Find authored navigation items container or lists
  const authoredTree = block.querySelector('[data-aue-prop="navItems"]') || block.querySelector('ul');

  if (authoredTree) {
    const parentLis = authoredTree.querySelectorAll(':scope > li');
    parentLis.forEach((li) => {
      const parentLi = li.cloneNode(true);
      const childUl = parentLi.querySelector('ul');

      if (childUl) {
        childUl.className = 'tarun-nav-children';
        parentLi.classList.add('has-submenu');
        parentLi.setAttribute('aria-expanded', 'false');
      }

      navContainer.append(parentLi);
    });
  } else {
    // Fallback if links exist as standalone anchors
    const anchors = [...block.querySelectorAll('a')];
    anchors.forEach((a) => {
      const li = document.createElement('li');
      li.append(a.cloneNode(true));
      navContainer.append(li);
    });
  }

  return navContainer;
}

/**
 * Decorates the self-contained Tarun Header component
 */
export default function decorate(block) {
  // 1. Extract Config Fields from tarun-header.json schema
  const config = {
    tcsLogo: getProp(block, 'tcsLogo'),
    tcsLogoAlt: getProp(block, 'tcsLogoAlt', 'Tata Consultancy Services'),
    tcsLogoLink: getProp(block, 'tcsLogoLink', '/'),
    tataLogo: getProp(block, 'tataLogo'),
    tataLogoAlt: getProp(block, 'tataLogoAlt', 'TATA Group'),
    tataLogoLink: getProp(block, 'tataLogoLink', 'https://www.tata.com'),
    enableSearch: getProp(block, 'enableSearch', 'true') === 'true',
    ctaLabel: getProp(block, 'ctaLabel'),
    ctaLink: getProp(block, 'ctaLink', '#'),
    ctaTarget: getProp(block, 'ctaTarget', '_self'),
    isSticky: getProp(block, 'isSticky', 'true') === 'true',
    headerTheme: getProp(block, 'headerTheme', 'light').toLowerCase(),
  };

  const navTree = parseNavTree(block);

  // 2. Apply Theme & Sticky Modifier Classes
  block.textContent = '';
  if (config.isSticky) block.classList.add('is-sticky');
  if (config.headerTheme !== 'light') block.classList.add(`theme-${config.headerTheme}`);

  // 3. Create Shell Elements
  const navWrapper = document.createElement('div');
  navWrapper.className = 'tarun-nav-wrapper';

  const nav = document.createElement('nav');
  nav.id = 'tarun-nav';
  nav.setAttribute('aria-expanded', 'false');

  // --- BRAND PRIMARY (TCS LOGO) ---
  const brandPrimary = document.createElement('div');
  brandPrimary.className = 'nav-brand-primary';
  const primaryAnchor = document.createElement('a');
  primaryAnchor.href = config.tcsLogoLink;
  primaryAnchor.setAttribute('aria-label', config.tcsLogoAlt);

  if (config.tcsLogo) {
    const img = document.createElement('img');
    img.src = config.tcsLogo;
    img.alt = config.tcsLogoAlt;
    primaryAnchor.append(img);
  } else {
    primaryAnchor.textContent = 'TCS';
  }
  brandPrimary.append(primaryAnchor);

  // --- NAVIGATION SECTIONS ---
  const navSections = document.createElement('div');
  navSections.className = 'nav-sections';

  if (navTree) {
    // Bind Desktop & Mobile Dropdown/Accordion Behavior
    navTree.querySelectorAll(':scope > li.has-submenu').forEach((parentLi) => {
      parentLi.setAttribute('tabindex', '0');

      // Desktop Hover / Click Toggle
      parentLi.addEventListener('click', (e) => {
        const expanded = parentLi.getAttribute('aria-expanded') === 'true';

        if (window.innerWidth >= 1025) {
          navTree.querySelectorAll('.has-submenu').forEach((item) => item.setAttribute('aria-expanded', 'false'));
          parentLi.setAttribute('aria-expanded', expanded ? 'false' : 'true');
          e.stopPropagation();
        } else {
          // Mobile Accordion Toggle
          parentLi.setAttribute('aria-expanded', expanded ? 'false' : 'true');
          e.stopPropagation();
        }
      });

      // Keyboard Accessibility (Enter / Space)
      parentLi.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          const expanded = parentLi.getAttribute('aria-expanded') === 'true';
          parentLi.setAttribute('aria-expanded', expanded ? 'false' : 'true');
        }
      });
    });

    navSections.append(navTree);
  }

  // --- UTILITIES (SEARCH & CTA) ---
  const navUtilities = document.createElement('div');
  navUtilities.className = 'nav-utilities';

  // Search Icon Toggle
  if (config.enableSearch) {
    const searchBtn = document.createElement('button');
    searchBtn.type = 'button';
    searchBtn.className = 'tarun-search-toggle';
    searchBtn.setAttribute('aria-label', 'Toggle Search');
    searchBtn.innerHTML = '<span class="search-icon">🔍</span>';
    navUtilities.append(searchBtn);
  }

  // Primary CTA Button
  if (config.ctaLabel) {
    const ctaBtn = document.createElement('a');
    ctaBtn.className = 'tarun-header-cta';
    ctaBtn.href = config.ctaLink;
    ctaBtn.textContent = config.ctaLabel;
    ctaBtn.target = config.ctaTarget;
    if (config.ctaTarget === '_blank') {
      ctaBtn.rel = 'noopener noreferrer';
    }
    navUtilities.append(ctaBtn);
  }

  // --- BRAND SECONDARY (TATA LOGO) ---
  const brandSecondary = document.createElement('div');
  brandSecondary.className = 'nav-brand-secondary';
  const secondaryAnchor = document.createElement('a');
  secondaryAnchor.href = config.tataLogoLink;
  secondaryAnchor.target = '_blank';
  secondaryAnchor.rel = 'noopener noreferrer';
  secondaryAnchor.setAttribute('aria-label', config.tataLogoAlt);

  if (config.tataLogo) {
    const img = document.createElement('img');
    img.src = config.tataLogo;
    img.alt = config.tataLogoAlt;
    secondaryAnchor.append(img);
  } else {
    secondaryAnchor.textContent = 'TATA';
  }
  brandSecondary.append(secondaryAnchor);

  // --- MOBILE HAMBURGER BUTTON ---
  const hamburgerWrapper = document.createElement('div');
  hamburgerWrapper.className = 'nav-hamburger';
  const hamburgerButton = document.createElement('button');
  hamburgerButton.type = 'button';
  hamburgerButton.setAttribute('aria-controls', 'tarun-nav');
  hamburgerButton.setAttribute('aria-label', 'Open navigation');
  hamburgerButton.setAttribute('aria-expanded', 'false');
  hamburgerButton.innerHTML = '<span class="nav-hamburger-icon"></span>';

  hamburgerButton.addEventListener('click', () => toggleMobileMenu(nav, hamburgerButton));
  hamburgerWrapper.append(hamburgerButton);

  // --- GLOBAL KEYBOARD ESCAPE LISTENER ---
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const openDrop = navSections.querySelector('.has-submenu[aria-expanded="true"]');
      if (openDrop) {
        openDrop.setAttribute('aria-expanded', 'false');
        openDrop.focus();
      } else if (nav.getAttribute('aria-expanded') === 'true') {
        toggleMobileMenu(nav, hamburgerButton, false);
        hamburgerButton.focus();
      }
    }
  });

  // 4. Assemble Final Header Shell
  nav.append(hamburgerWrapper, brandPrimary, navSections, navUtilities, brandSecondary);
  navWrapper.append(nav);
  block.append(navWrapper);
}
