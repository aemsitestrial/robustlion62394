function getField(block, name, fallback = '') {
  const field = block.querySelector(`[data-aue-prop="${name}"]`);
  if (field) return field.textContent.trim() || field.dataset.value || fallback;
  return block.dataset[name] || fallback;
}

function getBoolean(block, name, fallback = false) {
  const value = getField(block, name, String(fallback)).toLowerCase();
  return value === 'true' || value === 'yes' || value === '1';
}

function getFieldValues(block, name) {
  return [...block.querySelectorAll(`[data-aue-prop="${name}"]`)]
    .map((field) => field.textContent.trim() || field.dataset.value || '')
    .filter(Boolean);
}

function getNavigationLinks(block) {
  const links = getFieldValues(block, 'navigationLink');
  const texts = getFieldValues(block, 'navigationText');
  return links.map((href, index) => ({
    href,
    text: texts[index] || href,
  }));
}

function createLink(href, text, className = '') {
  const link = document.createElement('a');
  link.href = href;
  link.textContent = text;
  if (className) link.className = className;
  return link;
}

export default function decorate(block) {
  const variant = getField(block, 'variant', 'standard').toLowerCase();
  const brandName = getField(block, 'brandName', 'Brand');
  const brandLink = getField(block, 'brandLink', '/');
  const ctaText = getField(block, 'ctaText');
  const ctaLink = getField(block, 'ctaLink');
  const showSearch = getBoolean(block, 'showSearch', true);
  const navigationLinks = getNavigationLinks(block);

  block.classList.add(`dummy-header-${variant}`);

  const header = document.createElement('header');
  header.className = 'dummy-header-inner';

  const brand = createLink(brandLink, brandName, 'dummy-header-brand');
  header.append(brand);

  const menuButton = document.createElement('button');
  menuButton.type = 'button';
  menuButton.className = 'dummy-header-menu-button';
  menuButton.setAttribute('aria-controls', 'dummy-header-navigation');
  menuButton.setAttribute('aria-expanded', 'false');
  menuButton.setAttribute('aria-label', 'Open navigation');
  menuButton.innerHTML = '<span></span><span></span><span></span>';
  header.append(menuButton);

  const nav = document.createElement('nav');
  nav.className = 'dummy-header-nav';
  nav.id = 'dummy-header-navigation';
  nav.setAttribute('aria-label', 'Primary navigation');
  navigationLinks.forEach(({ href, text }) => nav.append(createLink(href, text)));
  header.append(nav);

  menuButton.addEventListener('click', () => {
    const expanded = menuButton.getAttribute('aria-expanded') === 'true';
    menuButton.setAttribute('aria-expanded', String(!expanded));
    menuButton.setAttribute('aria-label', expanded ? 'Open navigation' : 'Close navigation');
    header.classList.toggle('dummy-header-menu-open', !expanded);
  });

  const actions = document.createElement('div');
  actions.className = 'dummy-header-actions';
  if (showSearch) {
    const search = createLink('/search', 'Search', 'dummy-header-search');
    search.setAttribute('aria-label', 'Search');
    actions.append(search);
  }
  if (ctaText && ctaLink) actions.append(createLink(ctaLink, ctaText, 'dummy-header-cta'));
  header.append(actions);

  block.replaceChildren(header);
}
