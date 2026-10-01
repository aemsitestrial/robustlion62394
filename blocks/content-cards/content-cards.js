import { createOptimizedPicture } from '../../scripts/aem.js';
import { moveInstrumentation } from '../../scripts/scripts.js';

function getCellText(cell) {
  if (!cell) return '';
  return cell.querySelector('p, div, a, span')?.textContent?.trim() || cell.textContent?.trim() || '';
}

function renderImageCell(cell, className) {
  const picture = cell?.querySelector('picture');
  if (!picture) return null;

  const img = picture.querySelector('img');
  if (!img) return null;

  const optimizedPic = createOptimizedPicture(img.src, img.alt, false, [{ width: '750' }]);
  moveInstrumentation(img, optimizedPic.querySelector('img'));
  picture.replaceWith(optimizedPic);

  const wrapper = document.createElement('div');
  wrapper.className = className;
  wrapper.append(optimizedPic);
  return wrapper;
}

function getLinkCell(buttonLinkCell) {
  if (!buttonLinkCell) return null;
  return buttonLinkCell.querySelector('a');
}

export default function decorate(block) {
  const isArticleVariant = block.classList.contains('article-cards');
  const ul = document.createElement('ul');
  ul.className = 'content-cards-grid';

  [...block.children].forEach((row) => {
    const li = document.createElement('li');
    li.className = 'content-card-item';

    moveInstrumentation(row, li);

    const cells = [...row.children];
    if (cells.length > 0) {
      const imageCell = cells[0] || null;
      const categoryCell = cells[1] || null;
      const topicCell = cells[2] || null;
      const publishedDateCell = cells[3] || null;
      const titleCell = cells[4] || null;
      const descriptionCell = cells[5] || null;
      const statsCell = cells[6] || null;
      const buttonLinkCell = cells[7] || null;

      if (isArticleVariant) {
        if (imageCell && imageCell.querySelector('picture')) {
          const imageWrapper = renderImageCell(imageCell, 'card-image-banner');
          if (imageWrapper) li.append(imageWrapper);
        } else {
          li.classList.add('is-featured-report');
        }

        const category = getCellText(categoryCell);
        const topic = getCellText(topicCell);
        const pubDate = getCellText(publishedDateCell);

        if (category || topic || pubDate) {
          const metaContainer = document.createElement('div');
          metaContainer.className = 'card-meta-bar';

          const tagsWrapper = document.createElement('div');
          tagsWrapper.className = 'meta-tags-wrapper';

          if (category) {
            const catSpan = document.createElement('span');
            catSpan.className = 'meta-category-badge';
            catSpan.textContent = category;
            moveInstrumentation(categoryCell, catSpan);
            tagsWrapper.append(catSpan);
          }

          if (topic) {
            const topicSpan = document.createElement('span');
            topicSpan.className = 'meta-topic-text';
            topicSpan.textContent = topic;
            moveInstrumentation(topicCell, topicSpan);
            tagsWrapper.append(topicSpan);
          }

          metaContainer.append(tagsWrapper);

          if (pubDate) {
            const pubDateDiv = document.createElement('div');
            pubDateDiv.className = 'meta-pubdate-text';
            pubDateDiv.textContent = pubDate;
            moveInstrumentation(publishedDateCell, pubDateDiv);
            metaContainer.append(pubDateDiv);
          }

          li.append(metaContainer);
        }

        const titleText = getCellText(titleCell);
        if (titleText) {
          const h3 = document.createElement('h3');
          h3.className = 'card-headline';
          h3.textContent = titleText;
          moveInstrumentation(titleCell, h3);
          li.append(h3);
        }

        if (descriptionCell && descriptionCell.childNodes.length > 0) {
          const descDiv = document.createElement('div');
          descDiv.className = 'card-description-body';
          moveInstrumentation(descriptionCell, descDiv);
          descDiv.append(...descriptionCell.childNodes);
          li.append(descDiv);
        }

        const link = getLinkCell(buttonLinkCell);
        if (link) {
          link.className = li.classList.contains('is-featured-report') ? 'card-button-dark' : 'card-link-arrow';
          moveInstrumentation(buttonLinkCell, link);
          li.append(link);
        }

        if (statsCell && statsCell.childNodes.length > 0) {
          const authorDiv = document.createElement('div');
          authorDiv.className = 'card-author-footer';
          moveInstrumentation(statsCell, authorDiv);
          authorDiv.append(...statsCell.childNodes);
          li.append(authorDiv);
        }
      } else {
        const topContent = document.createElement('div');
        topContent.className = 'card-content-top';

        if (imageCell && imageCell.querySelector('picture')) {
          const imageWrapper = renderImageCell(imageCell, 'card-image-banner');
          if (imageWrapper) topContent.append(imageWrapper);
        }

        const categoryText = getCellText(categoryCell);
        if (categoryText) {
          const categoryDiv = document.createElement('div');
          categoryDiv.className = 'card-category-tag';
          categoryDiv.textContent = categoryText;
          moveInstrumentation(categoryCell, categoryDiv);
          topContent.append(categoryDiv);
        }

        const titleText = getCellText(titleCell) || categoryText;
        if (titleText) {
          const h3 = document.createElement('h3');
          h3.className = 'card-headline';
          h3.textContent = titleText;
          moveInstrumentation(titleCell || categoryCell, h3);
          topContent.append(h3);
        }

        if (descriptionCell && descriptionCell.childNodes.length > 0) {
          const descDiv = document.createElement('div');
          descDiv.className = 'card-description-body';
          moveInstrumentation(descriptionCell, descDiv);
          descDiv.append(...descriptionCell.childNodes);
          topContent.append(descDiv);
        }

        const bottomContent = document.createElement('div');
        bottomContent.className = 'card-content-bottom';

        if (statsCell && statsCell.childNodes.length > 0) {
          const statsDiv = document.createElement('div');
          statsDiv.className = 'card-stats-list';
          moveInstrumentation(statsCell, statsDiv);
          statsDiv.append(...statsCell.childNodes);
          bottomContent.append(statsDiv);
        }

        const link = getLinkCell(buttonLinkCell);
        if (link) {
          link.className = 'card-button-outline';
          moveInstrumentation(buttonLinkCell, link);
          bottomContent.append(link);
        }

        li.append(topContent, bottomContent);
      }
    }

    ul.append(li);
  });

  block.replaceChildren(ul);
}
