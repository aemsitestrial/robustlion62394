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
    'childDepth',
    'maxItems',
    'fixedItems',
    'searchQuery',
    'searchIn',
    'maxItemsSearch',
    'tagsParentPage',
    'tagsChildDepth',
    'tags',
    'tagMatch',
    'tagResultType',
    'maxItemsTags',
    'title',
    'description',
    'viewAllText',
    'viewAllLink',
    'linkItems',
    'orderBy',
    'sortOrder',
    'cardColor',
    'listStyle',
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

  const rows = roots.flatMap((root) => [...root.children])
    .filter((row) => !row.classList.contains('medium-list-container') && !row.classList.contains('medium-list-header'));
  const aliases = {
    parentpage: ['parentpagepath'],
    searchin: ['searchinpath'],
    tagsparentpage: ['parentpagepath', 'tagparentpagepath'],
    viewalllink: ['viewallpath'],
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

  const fieldIndex = fieldOrder.indexOf(name);
  if (fieldIndex >= 0) {
    const stores = [...block.querySelectorAll('.medium-list-ue-store')];
    const storedRows = stores.length
      ? stores.flatMap((store) => [...store.children])
      : [...block.children].filter((child) => !child.matches('ul.medium-list-container') && !child.matches('.medium-list-header'));
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
    const targetDepth = Number(config.childDepth) || 1;

    result = result.filter((item) => {
      const itemPath = normalizePath(item.path);
      if (itemPath === parent) return false;
      if (parent !== '/' && !itemPath.startsWith(`${parent}/`)) return false;

      const relativePath = parent === '/'
        ? itemPath.replace(/^\/+/, '')
        : itemPath.slice(parent.length + 1);

      const depth = relativePath.split('/').filter(Boolean).length;
      return depth >= 1 && depth <= targetDepth;
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
    const rawTags = Array.isArray(config.tags) ? config.tags.join(',') : String(config.tags || '');
    const authoredTags = rawTags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
    const scopePath = config.tagsParentPage ? normalizePath(config.tagsParentPage) : null;
    const targetDepth = Number(config.tagsChildDepth) || 1;

    const candidateItems = result.filter((item) => {
      const itemPath = normalizePath(item.path);
      if (scopePath && !itemPath.startsWith(`${scopePath}/`)) return false;

      if (scopePath) {
        const relativePath = scopePath === '/'
          ? itemPath.replace(/^\/+/, '')
          : itemPath.slice(scopePath.length + 1);
        const depth = relativePath.split('/').filter(Boolean).length;
        if (depth < 1 || depth > targetDepth) return false;
      }

      const itemTags = String(item.tags || '').toLowerCase().split(',').map((t) => t.trim());
      return config.tagMatch === 'all'
        ? authoredTags.every((t) => itemTags.some((it) => it.includes(t)))
        : authoredTags.some((t) => itemTags.some((it) => it.includes(t)));
    });

    if (config.tagResultType === '1-each' && authoredTags.length > 0) {
      const uniqueByTag = [];
      const usedPaths = new Set();

      authoredTags.forEach((tag) => {
        const matchingItem = candidateItems.find((item) => {
          if (usedPaths.has(item.path)) return false;
          const itemTags = String(item.tags || '').toLowerCase().split(',').map((t) => t.trim());
          return itemTags.some((it) => it.includes(tag));
        });

        if (matchingItem) {
          usedPaths.add(matchingItem.path);
          uniqueByTag.push({
            ...matchingItem,
            primaryTag: tag,
          });
        }
      });
      result = uniqueByTag;
    } else {
      result = candidateItems;
    }
  }

  // Common Sort
  result.sort((a, b) => {
    const keyA = config.orderBy === 'modified' ? (a.lastModified || 0) : (a.title || '');
    const keyB = config.orderBy === 'modified' ? (b.lastModified || 0) : (b.title || '');
    const cmp = String(keyA).localeCompare(String(keyB), undefined, { numeric: true });
    return config.sortOrder === 'descending' ? -cmp : cmp;
  });

  // Cap
  return config.maxItems > 0 ? result.slice(0, config.maxItems) : result;
}

function renderItem(item, config, index = 0) {
  const li = document.createElement('li');
  li.className = 'medium-list-item';

  const isHero = config.listStyle === 'hero-card' && index === 0;
  if (isHero) li.classList.add('hero-item');

  const card = document.createElement('div');
  card.className = 'medium-list-card';

  // Apply Card Theme Color or Fallback Blue if Image is Missing
  let effectiveColor = config.cardColor;
  if (!item.image && config.cardColor === 'grey') {
    effectiveColor = 'blue';
  }
  card.classList.add(`card-color-${effectiveColor}`);

  // 1. Top Media Rendering
  if (config.listStyle === 'card-2col-tm-scroll' || config.listStyle === 'default' || isHero) {
    if (item.image) {
      const picContainer = document.createElement('div');
      picContainer.className = 'medium-list-media';
      picContainer.append(createOptimizedPicture(item.image, item.title || '', false, [{ width: '800' }]));
      card.append(picContainer);
    } else {
      card.classList.add('no-image');
    }
  } else if (config.listStyle === 'card-m-scroll') {
    if (item.image) {
      const picContainer = document.createElement('div');
      picContainer.className = 'medium-list-media';
      picContainer.append(createOptimizedPicture(item.image, item.title || '', false, [{ width: '600' }]));
      card.append(picContainer);
    } else {
      card.classList.add('no-image');
    }
  }

  // 2. Body Container
  const body = document.createElement('div');
  body.className = 'medium-list-body';

  // Eyebrow Tag Header (Pipe separated for Card-2Col, single for others)
  const rawTags = item.primaryTag || String(item.tags || '');
  if (rawTags) {
    const eyebrow = document.createElement('span');
    eyebrow.className = 'medium-list-eyebrow';
    const tagList = rawTags
      .split(',')
      .map((t) => t.trim().replace(/^.*:/, '').toUpperCase())
      .filter(Boolean);

    if (config.listStyle === 'card-2col-tm-scroll') {
      eyebrow.textContent = tagList.join(' | ');
    } else {
      eyebrow.textContent = tagList[0] || '';
    }
    body.append(eyebrow);
  }

  // Title
  const title = document.createElement('h3');
  title.className = 'medium-list-title';
  if (config.linkItems) {
    const link = document.createElement('a');
    link.href = normalizePath(item.path);
    link.textContent = item.title || item.name || 'Untitled';
    title.append(link);
  } else {
    title.textContent = item.title || item.name || 'Untitled';
  }
  body.append(title);

  // Description
  if (config.showDescription && item.description) {
    const desc = document.createElement('p');
    desc.className = 'medium-list-description';
    desc.textContent = item.description;
    body.append(desc);
  }

  // Modification Date
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

  // CTA
  if (config.linkItems && (config.listStyle === 'card-m-scroll' || isHero)) {
    const cta = document.createElement('a');
    cta.className = 'medium-list-cta';
    cta.href = normalizePath(item.path);
    cta.innerHTML = 'Explore &rarr;';
    body.append(cta);
  }

  card.append(body);
  li.append(card);
  return li;
}

export default async function decorate(block) {
  const listType = String(getProp(block, 'listType', 'children')).toLowerCase().trim();

  let rawMax = getProp(block, 'maxItems', '5');
  if (listType === 'search') rawMax = getProp(block, 'maxItemsSearch', rawMax);
  if (listType === 'tags') rawMax = getProp(block, 'maxItemsTags', rawMax);

  const config = {
    listType,
    parentPage: getProp(block, 'parentPage'),
    childDepth: getProp(block, 'childDepth', '1'),
    searchQuery: getProp(block, 'searchQuery'),
    searchIn: getProp(block, 'searchIn'),
    tagsParentPage: getProp(block, 'tagsParentPage'),
    tagsChildDepth: getProp(block, 'tagsChildDepth', '1'),
    tags: getProp(block, 'tags'),
    tagMatch: getProp(block, 'tagMatch', 'any'),
    tagResultType: getProp(block, 'tagResultType', 'all'),
    title: getProp(block, 'title'),
    description: getProp(block, 'description'),
    viewAllText: getProp(block, 'viewAllText'),
    viewAllLink: getProp(block, 'viewAllLink'),
    linkItems: getBoolean(block, 'linkItems', true),
    orderBy: getProp(block, 'orderBy', 'title'),
    sortOrder: getProp(block, 'sortOrder', 'ascending'),
    cardColor: getProp(block, 'cardColor', 'grey').toLowerCase(),
    listStyle: getProp(block, 'listStyle', 'default').toLowerCase(),
    maxItems: Number(rawMax) || 5,
    showDescription: getBoolean(block, 'showDescription', true),
    showDate: getBoolean(block, 'showDate', false),
  };

  block.className = block.className.replace(/\blist-style-\S+/g, '').trim();
  block.classList.add(`list-style-${config.listStyle}`);

  let ueStore = block.querySelector('.medium-list-ue-store');
  if (!ueStore) {
    ueStore = document.createElement('div');
    ueStore.className = 'medium-list-ue-store';
    ueStore.style.display = 'none';
    while (block.firstElementChild) {
      ueStore.append(block.firstElementChild);
    }
  }

  // Clear Stale Elements
  const oldHeader = block.querySelector('.medium-list-header');
  if (oldHeader) oldHeader.remove();
  const oldList = block.querySelector('ul.medium-list-container');
  if (oldList) oldList.remove();

  // 1. Render Universal Header Lockup
  if (config.title || config.viewAllText) {
    const header = document.createElement('div');
    header.className = 'medium-list-header';

    const titleGroup = document.createElement('div');
    titleGroup.className = 'medium-list-header-group';

    if (config.title) {
      const h2 = document.createElement('h2');
      h2.className = 'medium-list-main-title';
      h2.textContent = config.title;
      titleGroup.append(h2);
    }

    if (config.description) {
      const desc = document.createElement('div');
      desc.className = 'medium-list-header-description';
      desc.innerHTML = config.description;
      titleGroup.append(desc);
    }
    header.append(titleGroup);

    if (config.viewAllText && config.viewAllLink) {
      const viewAll = document.createElement('a');
      viewAll.className = 'medium-list-view-all';
      viewAll.href = normalizePath(config.viewAllLink);
      viewAll.innerHTML = `${config.viewAllText} &rarr;`;
      header.append(viewAll);
    }

    block.append(header);
  }

  // 2. Resolve & Filter Items
  let items = [];
  if (config.listType === 'fixed') {
    items = parseFixedItems(ueStore);
  } else {
    const rawIndex = await fetchQueryIndex();
    items = filterAndSortItems(rawIndex, config);
  }

  // 3. Render Card Grid
  const ul = document.createElement('ul');
  ul.className = 'medium-list-container';

  if (!items.length) {
    const emptyLi = document.createElement('li');
    emptyLi.className = 'medium-list-empty';
    emptyLi.textContent = 'No matching pages found.';
    ul.append(emptyLi);
  } else {
    items.forEach((item, index) => ul.append(renderItem(item, config, index)));
  }

  block.append(ueStore, ul);
}
