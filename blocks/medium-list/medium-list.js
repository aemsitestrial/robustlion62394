import { createOptimizedPicture } from '../../scripts/aem.js';
import { getAEMPublish } from '../../scripts/endpointconfig.js';

/**
 * Extract property values safely without destroying UE instrumentation
 */
function getProp(block, name, fallback = '') {
  const lowerName = name.toLowerCase();

  if (block.dataset[name] !== undefined) return block.dataset[name];
  if (block.dataset[lowerName] !== undefined) return block.dataset[lowerName];

  const attrElem = block.querySelector(`[data-aue-prop="${name}"], [data-aue-prop="${lowerName}"]`);
  if (attrElem) {
    const anchor = attrElem.matches('a') ? attrElem : attrElem.querySelector('a');
    if (anchor) return anchor.getAttribute('href') || anchor.textContent.trim();
    return attrElem.dataset.value || attrElem.textContent.trim();
  }

  const rows = [...block.children];
  const targetRow = rows.find((row) => {
    const cols = [...row.children];
    if (cols.length >= 2) {
      const key = cols[0].textContent.trim().toLowerCase().replace(/[-_]/g, '');
      return key === lowerName.replace(/[-_]/g, '');
    }
    return false;
  });

  if (targetRow) {
    const cols = [...targetRow.children];
    const link = cols[1].querySelector('a');
    return link ? (link.getAttribute('href') || link.textContent.trim()) : cols[1].textContent.trim();
  }

  return fallback;
}

function getBoolean(block, name, fallback = false) {
  const val = String(getProp(block, name, fallback)).toLowerCase().trim();
  return val === 'true' || val === 'yes' || val === '1';
}

function normalizePath(path) {
  if (!path) return '/';
  const clean = path.split('?')[0].replace(/\/+$/, '') || '/';
  if (clean === '/index') return '/';
  if (clean.startsWith('/index/')) return clean.replace(/^\/index/, '');
  return clean;
}

async function fetchQueryIndex() {
  const configuredOrigin = getAEMPublish();
  const codeOrigin = new URL(import.meta.url).origin;
  const host = configuredOrigin.includes('.adobeaemcloud.com')
    ? codeOrigin
    : configuredOrigin;

  try {
    const resp = await fetch(new URL('/query-index.json', host));
    const contentType = resp.headers.get('content-type') || '';
    if (!resp.ok || !contentType.includes('application/json')) return [];
    const data = await resp.json();
    return Array.isArray(data) ? data : (data.data || []);
  } catch (err) {
    return [];
  }
}

function parseFixedItems(block) {
  const source = block.querySelector('[data-aue-prop="fixedItems"]') || block.querySelector('ul');
  if (!source) return [];

  const links = [...source.querySelectorAll('a[href]')];
  return links.map((a) => ({
    path: a.getAttribute('href'),
    title: a.textContent.trim() || a.getAttribute('href'),
    description: a.dataset.description || '',
    image: a.querySelector('img')?.src || '',
  }));
}

function filterAndSortItems(items, config) {
  let result = items.filter((item) => item.path);

  if (config.listType === 'children') {
    const parent = normalizePath(config.parentPage || window.location.pathname);
    result = result.filter((item) => {
      const itemPath = normalizePath(item.path);
      if (itemPath === parent) return false;
      return parent === '/' ? itemPath.startsWith('/') : itemPath.startsWith(`${parent}/`);
    });
  } else if (config.listType === 'search') {
    const terms = (config.searchQuery || '').toLowerCase().split(/\s+/).filter(Boolean);
    const scopePath = config.searchIn ? normalizePath(config.searchIn) : null;

    result = result.filter((item) => {
      const text = `${item.title || ''} ${item.description || ''} ${item.path || ''}`.toLowerCase();
      const matchesText = terms.every((t) => text.includes(t));
      const matchesScope = !scopePath || normalizePath(item.path).startsWith(`${scopePath}/`);
      return matchesText && matchesScope;
    });
  } else if (config.listType === 'tags') {
    const tags = (config.tags || '').split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
    const scopePath = config.tagsParentPage ? normalizePath(config.tagsParentPage) : null;

    result = result.filter((item) => {
      const itemTags = String(item.tags || '').toLowerCase().split(',').map((t) => t.trim());
      const matchesTag = config.tagMatch === 'all'
        ? tags.every((t) => itemTags.includes(t))
        : tags.some((t) => itemTags.includes(t));
      const matchesScope = !scopePath || normalizePath(item.path).startsWith(`${scopePath}/`);
      return matchesTag && matchesScope;
    });
  }

  // Sort
  result.sort((a, b) => {
    const keyA = config.orderBy === 'modified' ? (a.lastModified || 0) : (a.title || '');
    const keyB = config.orderBy === 'modified' ? (b.lastModified || 0) : (b.title || '');
    const cmp = String(keyA).localeCompare(String(keyB), undefined, { numeric: true });
    return config.sortOrder === 'descending' ? -cmp : cmp;
  });

  // Cap
  return config.maxItems > 0 ? result.slice(0, config.maxItems) : result;
}

function renderItem(item, config) {
  const li = document.createElement('li');
  li.className = 'medium-list-item';

  const card = document.createElement('div');
  card.className = 'medium-list-card';

  if (config.displayAsTeaser && item.image) {
    const picContainer = document.createElement('div');
    picContainer.className = 'medium-list-media';
    picContainer.append(createOptimizedPicture(item.image, item.title || '', false, [{ width: '400' }]));
    card.append(picContainer);
  }

  const body = document.createElement('div');
  body.className = 'medium-list-body';

  const title = document.createElement('h3');
  title.className = 'medium-list-title';
  const link = document.createElement('a');
  link.href = normalizePath(item.path);
  link.textContent = item.title || item.name || 'Untitled';
  title.append(link);
  body.append(title);

  if (config.showDescription && item.description) {
    const desc = document.createElement('p');
    desc.className = 'medium-list-description';
    desc.textContent = item.description;
    body.append(desc);
  }

  if (config.showDate && item.lastModified) {
    const date = document.createElement('time');
    date.className = 'medium-list-date';
    const parsed = new Date(Number(item.lastModified) * 1000 || item.lastModified);
    date.textContent = !Number.isNaN(parsed.valueOf())
      ? parsed.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
      : item.lastModified;
    body.append(date);
  }

  card.append(body);
  li.append(card);
  return li;
}

export default async function decorate(block) {
  const listType = String(getProp(block, 'listType', 'children')).toLowerCase().trim();

  // Determine Max Items based on active mode
  let rawMax = getProp(block, 'maxItems', '5');
  if (listType === 'search') rawMax = getProp(block, 'maxItemsSearch', rawMax);
  if (listType === 'tags') rawMax = getProp(block, 'maxItemsTags', rawMax);

  const config = {
    listType,
    parentPage: getProp(block, 'parentPage'),
    searchQuery: getProp(block, 'searchQuery'),
    searchIn: getProp(block, 'searchIn'),
    tags: getProp(block, 'tags'),
    tagsParentPage: getProp(block, 'tagsParentPage'),
    tagMatch: getProp(block, 'tagMatch', 'any'),
    orderBy: getProp(block, 'orderBy', 'title'),
    sortOrder: getProp(block, 'sortOrder', 'ascending'),
    maxItems: Number(rawMax) || 5,
    displayAsTeaser: getBoolean(block, 'displayAsTeaser', true),
    showDescription: getBoolean(block, 'showDescription', true),
    showDate: getBoolean(block, 'showDate', false),
  };

  // 1. Preserve original UE Instrumentation DOM node
  let ueStore = block.querySelector('.medium-list-ue-store');
  if (!ueStore) {
    ueStore = document.createElement('div');
    ueStore.className = 'medium-list-ue-store';
    ueStore.style.display = 'none';
    while (block.firstElementChild) {
      ueStore.append(block.firstElementChild);
    }
  }

  // 2. Remove stale rendered markup on live re-render
  const oldList = block.querySelector('ul.medium-list-container');
  if (oldList) oldList.remove();

  // 3. Resolve Items
  let items = [];
  if (config.listType === 'fixed') {
    items = parseFixedItems(ueStore);
  } else {
    const rawIndex = await fetchQueryIndex();
    items = filterAndSortItems(rawIndex, config);
  }

  // 4. Render Clean Grid
  const ul = document.createElement('ul');
  ul.className = 'medium-list-container';

  if (!items.length) {
    const emptyLi = document.createElement('li');
    emptyLi.className = 'medium-list-empty';
    emptyLi.textContent = 'No matching pages found.';
    ul.append(emptyLi);
  } else {
    items.forEach((item) => ul.append(renderItem(item, config)));
  }

  block.append(ueStore, ul);
}
