import { createOptimizedPicture } from '../../scripts/aem.js';
import {
  getDecision,
  getTargetConfig,
  sendPropositionDisplay,
  setPersonalizationAttributes,
} from '../../scripts/target-personalization.js';

const INDEX_SOURCES = ['/query-index.json', '/sitemap.json'];

function getElementValue(element) {
  return (
    element.dataset.value
    || element.getAttribute('value')
    || element.textContent.trim()
  );
}

function getField(block, name, fallback = '') {
  const prop = block.querySelector(`[data-aue-prop="${name}"]`);
  if (prop) return getElementValue(prop);
  if (block.dataset[name] !== undefined) return block.dataset[name];
  const row = [...block.children].find(
    (child) => child.dataset?.field === name,
  );
  return row ? getElementValue(row) : fallback;
}

function getFieldValues(block, name) {
  const values = [...block.querySelectorAll(`[data-aue-prop="${name}"]`)]
    .map(getElementValue)
    .filter(Boolean);
  if (values.length) return values;
  const value = getField(block, name);
  return value ? [value] : [];
}

function normalizeListType(value) {
  const normalized = value.toLowerCase().trim();
  const labels = {
    'child pages': 'children',
    'fixed list': 'fixed',
    search: 'search',
    tags: 'tags',
  };
  return labels[normalized] || normalized;
}

function getBoolean(block, name, fallback = false) {
  const value = getField(block, name, String(fallback)).toLowerCase();
  return value === 'true' || value === 'yes' || value === '1';
}

function normalizePath(path) {
  if (!path) return '/';
  try {
    return (
      new URL(path, window.location.origin).pathname.replace(/\/+$/, '') || '/'
    );
  } catch (error) {
    return path.split('?')[0].replace(/\/+$/, '') || '/';
  }
}

function getItems(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}

async function loadIndex() {
  const responses = await Promise.all(
    INDEX_SOURCES.map(async (source) => {
      try {
        const response = await fetch(source);
        return response.ok ? response.json() : null;
      } catch (error) {
        return null;
      }
    }),
  );
  const data = responses.find((response) => response);
  if (data) return getItems(data);
  return [];
}

function getPath(item) {
  return item.path || item.url || item.href || item.link || '';
}

function getTitle(item) {
  return item.title || item.name || item.navigationTitle || 'Untitled';
}

function getDescription(item) {
  return item.description || item.excerpt || item.abstract || '';
}

function getModified(item) {
  return (
    item.lastModified
    || item.modified
    || item.date
    || item.lastModifiedDate
    || ''
  );
}

function getTags(item) {
  const tags = item.tags || item.tag || item.keywords || '';
  return Array.isArray(tags)
    ? tags
    : String(tags)
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
}

function getImage(item) {
  return item.image || item.imageUrl || item.thumbnail || '';
}

function getContentTags(item) {
  return getTags(item).map((tag) => tag.toLowerCase());
}

function formatDate(value, format) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  const months = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  const shortMonths = months.map((month) => month.slice(0, 3));
  const tokens = {
    yyyy: date.getFullYear(),
    yy: String(date.getFullYear()).slice(-2),
    MMMM: months[date.getMonth()],
    MMM: shortMonths[date.getMonth()],
    MM: String(date.getMonth() + 1).padStart(2, '0'),
    M: date.getMonth() + 1,
    dd: String(date.getDate()).padStart(2, '0'),
    d: date.getDate(),
  };
  return format.replace(
    /yyyy|MMMM|MMM|MM|dd|yy|M|d/g,
    (token) => tokens[token],
  );
}

function matchesParent(item, parentPage, childDepth) {
  const path = normalizePath(getPath(item));
  const parent = normalizePath(parentPage);
  if (parent === '/') return path !== '/';
  if (!path.startsWith(`${parent}/`)) return false;
  const depth = path
    .slice(parent.length + 1)
    .split('/')
    .filter(Boolean).length;
  return depth <= childDepth;
}

function filterItems(items, config) {
  const parentPage = config.parentPage
    || config.searchIn
    || config.tagsParentPage
    || normalizePath(window.location.pathname);
  let result = items.filter((item) => getPath(item));

  if (config.listType === 'children') {
    result = result.filter((item) => matchesParent(item, parentPage, config.childDepth));
  } else if (config.listType === 'search') {
    const terms = config.searchQuery.toLowerCase().split(/\s+/).filter(Boolean);
    result = result.filter((item) => {
      const haystack = `${getTitle(item)} ${getDescription(item)} ${getPath(item)}`.toLowerCase();
      return (
        terms.every((term) => haystack.includes(term))
        && matchesParent(item, parentPage, Number.MAX_SAFE_INTEGER)
      );
    });
  } else if (config.listType === 'tags') {
    const tags = config.tags
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
    result = result.filter((item) => {
      const itemTags = getTags(item);
      const matches = config.tagMatch === 'all'
        ? tags.every((tag) => itemTags.includes(tag))
        : tags.some((tag) => itemTags.includes(tag));
      return (
        matches && matchesParent(item, parentPage, Number.MAX_SAFE_INTEGER)
      );
    });
  }

  result.sort((left, right) => {
    const a = config.orderBy === 'modified' ? getModified(left) : getTitle(left);
    const b = config.orderBy === 'modified' ? getModified(right) : getTitle(right);
    const comparison = String(a).localeCompare(String(b), undefined, {
      numeric: true,
    });
    return config.sortOrder === 'descending' ? -comparison : comparison;
  });

  return config.maxItems > 0 ? result.slice(0, config.maxItems) : result;
}

function filterPersonalizedItems(items, proposition) {
  const sourcePath = proposition.sourcePath && normalizePath(proposition.sourcePath);
  const contentTags = Array.isArray(proposition.contentTags)
    ? proposition.contentTags.map((tag) => String(tag).toLowerCase())
    : [];
  const matches = items.filter((item) => {
    const path = normalizePath(getPath(item));
    const hasSource = !sourcePath || path === sourcePath || path.startsWith(`${sourcePath}/`);
    const tags = getContentTags(item);
    const hasTags = !contentTags.length || contentTags.every((tag) => tags.includes(tag));
    return hasSource && hasTags;
  });
  return proposition.maxItems > 0
    ? matches.slice(0, proposition.maxItems)
    : matches;
}

function getFixedItems(block) {
  const source = block.querySelector('[data-aue-prop="fixedItems"]') || block;
  const authoredLinks = [...source.querySelectorAll('a[href]')];
  if (authoredLinks.length) {
    return authoredLinks.map((link) => ({
      path: link.href,
      title: link.textContent.trim() || link.href,
      description: link.dataset.description || '',
      target: link.target,
      image: link.querySelector('img')?.src || '',
    }));
  }

  const links = getFieldValues(block, 'fixedLink');
  const texts = getFieldValues(block, 'fixedText');
  const targets = getFieldValues(block, 'fixedTarget');
  return links.map((path, index) => ({
    path,
    title: texts[index] || path,
    target: targets[index] || '',
  }));
}

function renderItem(item, config) {
  const li = document.createElement('li');
  li.className = 'list-item';
  const content = document.createElement('div');
  content.className = 'list-item-content';

  if (config.displayAsTeaser && getImage(item)) {
    content.append(
      createOptimizedPicture(getImage(item), getTitle(item), false, [
        { width: '300' },
      ]),
    );
  }

  const title = document.createElement('h3');
  if (config.linkItems && getPath(item)) {
    const link = document.createElement('a');
    link.href = getPath(item);
    link.textContent = getTitle(item);
    if (item.target) link.target = item.target;
    title.append(link);
  } else {
    title.textContent = getTitle(item);
  }
  content.append(title);

  if (config.showDescription && getDescription(item)) {
    const description = document.createElement('p');
    description.className = 'list-item-description';
    description.textContent = getDescription(item);
    content.append(description);
  }

  if (config.showDate && getModified(item)) {
    const date = document.createElement('time');
    date.className = 'list-item-date';
    const parsedDate = new Date(getModified(item));
    date.dateTime = Number.isNaN(parsedDate.valueOf())
      ? getModified(item)
      : parsedDate.toISOString();
    date.textContent = formatDate(getModified(item), config.dateFormat);
    content.append(date);
  }

  li.append(content);
  return li;
}

function renderList(block, items, config, status = null, decision = null) {
  const list = document.createElement('ul');
  list.className = 'list-items';
  items.forEach((item) => list.append(renderItem(item, config)));
  block.replaceChildren(list);

  setPersonalizationAttributes(
    block,
    config.personalizationEnabled,
    status,
    decision?.data?.persona,
  );
}

async function buildDefaultList(block, config) {
  if (['fixed', 'static'].includes(config.listType)) {
    return getFixedItems(block);
  }
  return filterItems(await loadIndex(), config);
}

export default async function decorate(block) {
  const config = {
    listType: normalizeListType(getField(block, 'listType', 'children')),
    parentPage: getField(block, 'parentPage'),
    searchIn: getField(block, 'searchIn'),
    tagsParentPage: getField(block, 'tagsParentPage'),
    childDepth: Math.max(1, Number(getField(block, 'childDepth', '1')) || 1),
    searchQuery: getField(block, 'searchQuery'),
    tags: getField(block, 'tags'),
    tagMatch: getField(block, 'tagMatch', 'any'),
    orderBy: getField(block, 'orderBy', 'title'),
    sortOrder: getField(block, 'sortOrder', 'ascending'),
    maxItems: Number(getField(block, 'maxItems', '0')) || 0,
    linkItems: getBoolean(block, 'linkItems', true),
    showDescription: getBoolean(block, 'showDescription'),
    showDate: getBoolean(block, 'showDate'),
    displayAsTeaser: getBoolean(block, 'displayAsTeaser'),
    dateFormat: getField(block, 'dateFormat', 'MMMM d, yyyy'),
    personalizationEnabled: getBoolean(block, 'personalizationEnabled'),
    ...getTargetConfig('list'),
  };
  const defaultItems = await buildDefaultList(block, config);
  const id = getField(block, 'id');
  if (id) block.id = id;
  renderList(block, defaultItems, config, 'fallback');

  if (!config.personalizationEnabled) return;

  const decision = await getDecision(config);
  const personalizedItems = decision
    ? filterPersonalizedItems(defaultItems, decision.data)
    : [];
  if (!decision || !personalizedItems.length) return;

  renderList(block, personalizedItems, config, 'personalized', decision);
  await sendPropositionDisplay(decision);
}
