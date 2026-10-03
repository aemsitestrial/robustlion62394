import { createOptimizedPicture } from '../../scripts/aem.js';
import { getAEMPublish } from '../../scripts/endpointconfig.js';

/**
 * Extract property values safely without destroying UE instrumentation
 */
function getProp(block, name, fallback = '') {
  const lowerName = name.toLowerCase();
  const normalizedName = lowerName.replace(/[-_\s]/g, '');
  const roots = [block, ...block.querySelectorAll('.medium-list-ue-store')];
  const fieldOrder = [
    'listType',
    'parentPage',
    'maxItems',
    'orderBy',
    'sortOrder',
    'fixedItems',
    'searchQuery',
    'searchIn',
    'maxItemsSearch',
    'tags',
    'tagsParentPage',
    'tagMatch',
    'maxItemsTags',
    'displayAsTeaser',
    'showDescription',
    'showDate',
  ];

  const readValue = (element) => {
    if (!element) return '';
    const image = element.matches('img') ? element : element.querySelector('picture img, img');
    if (image) return image.getAttribute('src') || image.src;
    const anchor = element.matches('a') ? element : element.querySelector('a[href]');
    if (anchor) return anchor.getAttribute('href') || anchor.textContent.trim();
    return element.dataset.value
      || element.getAttribute('value')
      || element.value
      || element.textContent.trim();
  };

  if (block.dataset[name] !== undefined) return block.dataset[name];
  if (block.dataset[lowerName] !== undefined) return block.dataset[lowerName];

  const propertyElements = roots.flatMap((root) => {
    const descendants = [...root.querySelectorAll('[data-aue-prop]')];
    if (root.matches('[data-aue-prop]')) descendants.unshift(root);
    return descendants;
  });
  const propertyElement = propertyElements.find(
    (element) => element.getAttribute('data-aue-prop').toLowerCase() === lowerName,
  );
  if (propertyElement) {
    const value = readValue(propertyElement);
    if (value) return value;
  }

  // Support labeled key-value rows in authored markup and the hidden UE store.
  const rows = roots.flatMap((root) => [...root.children])
    .filter((row) => !row.classList.contains('medium-list-container'));
  const aliases = {
    parentpage: ['parentpagepath'],
    searchin: ['searchinpath'],
    tagsparentpage: ['parentpagepath', 'tagparentpagepath'],
  };
  const acceptableNames = [normalizedName, ...(aliases[normalizedName] || [])];
  const targetRow = rows.find((row) => {
    const cols = [...row.children];
    const key = cols[0]?.textContent.trim().toLowerCase().replace(/[-_\s]/g, '');
    return cols.length >= 2 && acceptableNames.includes(key);
  });

  if (targetRow) {
    const cols = [...targetRow.children];
    const value = readValue(cols[1]);
    if (value) return value;
  }

  // Universal Editor may serialize model values as unlabeled rows, in schema order.
  const fieldIndex = fieldOrder.indexOf(name);
  if (fieldIndex >= 0) {
    const stores = [...block.querySelectorAll('.medium-list-ue-store')];
    const storedRows = stores.length
      ? stores.flatMap((store) => [...store.children])
      : [...block.children].filter((child) => !child.matches('ul.medium-list-container'));
    const row = storedRows[fieldIndex];
    if (row) {
      const cells = [...row.children];
      const valueCell = cells.length > 1 ? cells[1] : cells[0] || row;
      const value = readValue(valueCell);
      if (value) return value;
    }
  }

  return fallback;
}

function getBoolean(block, name, fallback = false) {
  const val = String(getProp(block, name, fallback)).toLowerCase().trim();
  return val === 'true' || val === 'yes' || val === '1';
}

function normalizePath(path) {
  if (!path) return '/';
  let pathname;
  try {
    pathname = new URL(String(path).trim(), window.location.origin).pathname;
  } catch (error) {
    [pathname] = String(path).split(/[?#]/);
  }

  const clean = pathname.replace(/\/+$/, '') || '/';
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
      if (parent !== '/' && !itemPath.startsWith(`${parent}/`)) return false;

      const relativePath = parent === '/'
        ? itemPath.replace(/^\/+/, '')
        : itemPath.slice(parent.length + 1);
      return relativePath.split('/').filter(Boolean).length === 1;
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
    const rawDate = item.lastModified;
    const numericTimestamp = typeof rawDate === 'number'
      || /^\d+(\.\d+)?$/.test(String(rawDate).trim());
    const timestamp = numericTimestamp
      ? Number(rawDate) * (Number(rawDate) < 1e12 ? 1000 : 1)
      : rawDate;
    const parsed = new Date(timestamp);
    if (!Number.isNaN(parsed.valueOf())) {
      date.dateTime = parsed.toISOString();
      date.textContent = parsed.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } else {
      date.textContent = String(rawDate);
    }
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
