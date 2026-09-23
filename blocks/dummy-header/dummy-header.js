function getField(block, name, fallback = '') {
  const field = block.querySelector(`[data-aue-prop="${name}"]`);
  if (field) return field.textContent.trim() || field.dataset.value || fallback;
  return block.dataset[name] || fallback;
}

function getBoolean(block, name, fallback = false) {
  const value = getField(block, name, String(fallback)).toLowerCase();
  return value === 'true' || value === 'yes' || value === '1';
}

function getRichTextLinks(block) {
  const field = block.querySelector('[data-aue-prop="navigationLinks"]');
  if (!field) return [];

  const links = [...field.querySelectorAll('a[href]')].map((link) => ({
    href: link.href,
    text: link.textContent.trim(),
  }));
  if (links.length) return links;

  return field.textContent
    .split(/\r?\n|,|;/)
    .map((text) => text.trim())
    .filter(Boolean)
    .map((text) => ({
      href: `/${text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`,
      text,
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
  const navigationLinks = getRichTextLinks(block);

  block.classList.add(`dummy-header-${variant}`);

  const header = document.createElement('header');
  header.className = 'dummy-header-inner';

  const brand = createLink(brandLink, brandName, 'dummy-header-brand');
  header.append(brand);

  const nav = document.createElement('nav');
  nav.className = 'dummy-header-nav';
  nav.setAttribute('aria-label', 'Primary navigation');
  navigationLinks.forEach(({ href, text }) => nav.append(createLink(href, text)));
  header.append(nav);

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
