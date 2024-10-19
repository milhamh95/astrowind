import type { PaginateFunction } from 'astro';
import { getCollection } from 'astro:content';
import type { CollectionEntry } from 'astro:content';
import type { PortfolioPost } from '~/types';
import { APP_BLOG, APP_PORTFOLIO } from 'astrowind:config';
import { cleanSlug, trimSlash, BLOG_BASE, POST_PERMALINK_PATTERN, CATEGORY_BASE, TAG_BASE } from './permalinks';

const generatePermalink = async ({
  id,
  slug,
  publishDate,
  category,
}: {
  id: string;
  slug: string;
  publishDate: Date;
  category: string | undefined;
}) => {
  const year = String(publishDate.getFullYear()).padStart(4, '0');
  const month = String(publishDate.getMonth() + 1).padStart(2, '0');
  const day = String(publishDate.getDate()).padStart(2, '0');
  const hour = String(publishDate.getHours()).padStart(2, '0');
  const minute = String(publishDate.getMinutes()).padStart(2, '0');
  const second = String(publishDate.getSeconds()).padStart(2, '0');

  const permalink = POST_PERMALINK_PATTERN.replace('%slug%', slug)
    .replace('%id%', id)
    .replace('%category%', category || '')
    .replace('%year%', year)
    .replace('%month%', month)
    .replace('%day%', day)
    .replace('%hour%', hour)
    .replace('%minute%', minute)
    .replace('%second%', second);

  return permalink
    .split('/')
    .map((el) => trimSlash(el))
    .filter((el) => !!el)
    .join('/');
};

const getNormalizedPost = async (post: CollectionEntry<'post'>): Promise<PortfolioPost> => {
  const { id, slug: rawSlug = '', data } = post;
  const { Content, remarkPluginFrontmatter } = await post.render();

  const {
    publishDate: rawPublishDate = new Date(),
    updateDate: rawUpdateDate,
    title,
    excerpt,
    image,
    tags: rawTags = [],
    category: rawCategory,
    author,
    draft = false,
    metadata = {},
  } = data;

  const slug = cleanSlug(rawSlug); // cleanSlug(rawSlug.split('/').pop());
  const publishDate = new Date(rawPublishDate);
  const updateDate = rawUpdateDate ? new Date(rawUpdateDate) : undefined;

  const category = rawCategory
    ? {
        slug: cleanSlug(rawCategory),
        title: rawCategory,
      }
    : undefined;

  const tags = rawTags.map((tag: string) => ({
    slug: cleanSlug(tag),
    title: tag,
  }));

  return {
    id: id,
    slug: slug,
    permalink: await generatePermalink({ id, slug, publishDate, category: category?.slug }),

    publishDate: publishDate,
    updateDate: updateDate,

    title: title,
    excerpt: excerpt,
    image: image,

    category: category,
    tags: tags,
    author: author,

    draft: draft,

    metadata,

    Content: Content,
    // or 'content' in case you consume from API

    readingTime: remarkPluginFrontmatter?.readingTime,
  };
};

const load = async function (): Promise<Array<PortfolioPost>> {
  const posts = await getCollection('post');
  const normalizedPosts = posts.map(async (post) => await getNormalizedPost(post));

  const results = (await Promise.all(normalizedPosts))
    .sort((a, b) => b.publishDate.valueOf() - a.publishDate.valueOf())
    .filter((post) => !post.draft);

  return results;
};

let _portfolioPosts: Array<PortfolioPost>;

export const isPortfolioEnabled = APP_PORTFOLIO.isEnabled;
export const isRelatedPortfolioPostsEnabled = APP_PORTFOLIO.isRelatedPortfolioPostsEnabled;
export const isPortfolioListRouteEnabled = APP_PORTFOLIO.list.isEnabled;
export const isPortfolioPostRouteEnabled = APP_PORTFOLIO.post.isEnabled;
export const isPortfolioCategoryRouteEnabled = APP_PORTFOLIO.category.isEnabled;
export const isPortfolioTagRouteEnabled = APP_PORTFOLIO.tag.isEnabled;

export const portfolioListRobots = APP_PORTFOLIO.list.robots;
export const portfolioPostRobots = APP_PORTFOLIO.post.robots;
export const portfolioCategoryRobots = APP_PORTFOLIO.category.robots;
export const portfolioTagRobots = APP_PORTFOLIO.tag.robots;

export const portfolioPostsPerPage = APP_PORTFOLIO?.postsPerPage;

/** */
export const fetchPortfolioPosts = async (): Promise<Array<PortfolioPost>> => {
  if (!_portfolioPosts) {
    _portfolioPosts = await load();
  }

  return _portfolioPosts;
};

/** */
export const findPortfolioPostsBySlugs = async (slugs: Array<string>): Promise<Array<PortfolioPost>> => {
  if (!Array.isArray(slugs)) return [];

  const posts = await fetchPortfolioPosts();

  return slugs.reduce(function (r: Array<PortfolioPost>, slug: string) {
    posts.some(function (post: PortfolioPost) {
      return slug === post.slug && r.push(post);
    });
    return r;
  }, []);
};

/** */
export const findPortfolioPostsByIds = async (ids: Array<string>): Promise<Array<PortfolioPost>> => {
  if (!Array.isArray(ids)) return [];

  const posts = await fetchPortfolioPosts();

  return ids.reduce(function (r: Array<PortfolioPost>, id: string) {
    posts.some(function (post: PortfolioPost) {
      return id === post.id && r.push(post);
    });
    return r;
  }, []);
};

/** */
export const findLatestPortfolioPosts = async ({ count }: { count?: number }): Promise<Array<PortfolioPost>> => {
  const _count = count || 4;
  const posts = await fetchPortfolioPosts();

  return posts ? posts.slice(0, _count) : [];
};

/** */
export const getStaticPathsPortfolioList = async ({ paginate }: { paginate: PaginateFunction }) => {
  if (!isPortfolioEnabled || !isPortfolioListRouteEnabled) return [];
  return paginate(await fetchPortfolioPosts(), {
    params: { blog: BLOG_BASE || undefined },
    pageSize: portfolioPostsPerPage,
  });
};

/** */
export const getStaticPathsPortfolioPost = async () => {
  if (!isPortfolioEnabled || !isPortfolioPostRouteEnabled) return [];
  return (await fetchPortfolioPosts()).flatMap((post) => ({
    params: {
      blog: post.permalink,
    },
    props: { post },
  }));
};

/** */
export const getStaticPathsPortfolioCategory = async ({ paginate }: { paginate: PaginateFunction }) => {
  if (!isPortfolioEnabled || !isPortfolioCategoryRouteEnabled) return [];

  const posts = await fetchPortfolioPosts();
  const categories = {};
  posts.map((post) => {
    if (post.category?.slug) {
      categories[post.category?.slug] = post.category;
    }
  });

  return Array.from(Object.keys(categories)).flatMap((categorySlug) =>
    paginate(
      posts.filter((post) => post.category?.slug && categorySlug === post.category?.slug),
      {
        params: { category: categorySlug, blog: CATEGORY_BASE || undefined },
        pageSize: portfolioPostsPerPage,
        props: { category: categories[categorySlug] },
      }
    )
  );
};

/** */
export const getStaticPathsPortfolioTag = async ({ paginate }: { paginate: PaginateFunction }) => {
  if (!isPortfolioEnabled || !isPortfolioTagRouteEnabled) return [];

  const posts = await fetchPortfolioPosts();
  const tags = {};
  posts.map((post) => {
    if (Array.isArray(post.tags)) {
      post.tags.map((tag) => {
        tags[tag?.slug] = tag;
      });
    }
  });

  return Array.from(Object.keys(tags)).flatMap((tagSlug) =>
    paginate(
      posts.filter((post) => Array.isArray(post.tags) && post.tags.find((elem) => elem.slug === tagSlug)),
      {
        params: { tag: tagSlug, blog: TAG_BASE || undefined },
        pageSize: portfolioPostsPerPage,
        props: { tag: tags[tagSlug] },
      }
    )
  );
};

/** */
export async function getRelatedPortfolioPosts(originalPost: PortfolioPost, maxResults: number = 4): Promise<PortfolioPost[]> {
  const allPosts = await fetchPortfolioPosts();
  const originalTagsSet = new Set(originalPost.tags ? originalPost.tags.map((tag) => tag.slug) : []);

  const postsWithScores = allPosts.reduce((acc: { post: PortfolioPost; score: number }[], iteratedPost: PortfolioPost) => {
    if (iteratedPost.slug === originalPost.slug) return acc;

    let score = 0;
    if (iteratedPost.category && originalPost.category && iteratedPost.category.slug === originalPost.category.slug) {
      score += 5;
    }

    if (iteratedPost.tags) {
      iteratedPost.tags.forEach((tag) => {
        if (originalTagsSet.has(tag.slug)) {
          score += 1;
        }
      });
    }

    acc.push({ post: iteratedPost, score });
    return acc;
  }, []);

  postsWithScores.sort((a, b) => b.score - a.score);

  const selectedPosts: PortfolioPost[] = [];
  let i = 0;
  while (selectedPosts.length < maxResults && i < postsWithScores.length) {
    selectedPosts.push(postsWithScores[i].post);
    i++;
  }

  return selectedPosts;
}
