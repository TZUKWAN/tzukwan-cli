import chalk from 'chalk';
import ora from 'ora';
import boxen from 'boxen';
import { displayError, displayTable, displayInfo } from '../ui/display.js';

export type SearchSource = 'arxiv' | 'pubmed' | 'semantic-scholar' | 'openalex' | 'all';

export interface SearchResult {
  id: string;
  title: string;
  authors: string[];
  abstract: string;
  year: number;
  source: string;
  url: string;
  citationCount?: number;
  pdfUrl?: string;
  journal?: string;
  doi?: string;
}

export interface DatasetResult {
  name: string;
  description: string;
  category: string;
  url: string;
  format?: string;
  size?: string;
  license?: string;
}

export interface SearchOptions {
  source?: SearchSource;
  limit?: number;
  year?: number;
  sort?: 'relevance' | 'date' | 'citations';
}

type SearchModule = {
  searchLiterature: (query: string, opts: SearchOptions) => Promise<SearchResult[]>;
  searchDatasets: (query: string, opts: { limit?: number }) => Promise<DatasetResult[]>;
  listDatasetCategories: () => Promise<Record<string, string[]>>;
};

/**
 * Load the research search module dynamically.
 */
async function loadSearch(): Promise<SearchModule> {
  try {
    const research = await import('@tzukwan/research') as unknown as SearchModule;
    return research;
  } catch {
    const notAvailable = (name: string): never => {
      throw new Error(`@tzukwan/research module not yet available (${name}). Please build the research package first.`);
    };
    return {
      searchLiterature: async () => notAvailable('searchLiterature'),
      searchDatasets: async () => notAvailable('searchDatasets'),
      listDatasetCategories: async () => notAvailable('listDatasetCategories'),
    };
  }
}

/**
 * Format and display a list of search results.
 */
function displaySearchResults(results: SearchResult[], query: string): void {
  if (results.length === 0) {
    displayInfo(`No results found for: ${query}`);
    return;
  }

  console.log(
    '\n' +
      boxen(
        chalk.bold.white(`Search results for: `) +
          chalk.cyan(query) +
          chalk.gray(`  (${results.length} found)`),
        {
          padding: { top: 0, bottom: 0, left: 1, right: 1 },
          borderColor: 'cyan',
          borderStyle: 'round',
        }
      )
  );

  results.forEach((result, i) => {
    console.log();
    console.log(
      chalk.bold.white(`${i + 1}. `) +
        chalk.bold.white(result.title)
    );

    const authors = result.authors ?? [];
    const authorStr =
      authors.slice(0, 3).join(', ') + (authors.length > 3 ? ' et al.' : '');
    console.log(
      chalk.gray('   Authors: ') +
        chalk.cyan(authorStr) +
        chalk.gray('  ·  Year: ') +
        chalk.white(result.year) +
        chalk.gray('  ·  Source: ') +
        chalk.yellow(result.source)
    );

    if (result.citationCount !== undefined) {
      console.log(chalk.gray('   Citations: ') + chalk.white(result.citationCount));
    }

    if (result.journal) {
      console.log(chalk.gray('   Journal: ') + chalk.white(result.journal));
    }

    if (result.abstract) {
      const abstract = result.abstract ?? '';
      const excerpt = abstract.slice(0, 200).trimEnd();
      const dots = abstract.length > 200 ? '...' : '';
      console.log(chalk.gray('   ' + excerpt + dots));
    }

    console.log(chalk.gray('   URL: ') + chalk.underline.blue(result.url));
  });

  console.log();
}

/**
 * Main literature search command handler.
 */
export async function searchLiterature(query: string, options: SearchOptions = {}): Promise<void> {
  if (!query) {
    displayError('Search query is required. Example: tzukwan search "neural scaling laws"');
    throw new Error('Search query is required.');
  }

  const spinner = ora({
    text: chalk.cyan(`Searching ${options.source ?? 'all'} sources for: ${chalk.bold(query)}`),
    color: 'cyan',
  }).start();

  try {
    const search = await loadSearch();

    const results = await search.searchLiterature(query, {
      source: options.source ?? 'all',
      limit: options.limit ?? 10,
      sort: options.sort ?? 'relevance',
      year: options.year,
    });

    spinner.stop();
    displaySearchResults(results, query);
  } catch (err) {
    spinner.fail(chalk.red('Search failed'));
    displayError(String(err));
    process.exitCode = 1;
  }
}

/**
 * Dataset search command handler.
 */
export async function searchDatasets(query: string, options: { limit?: number } = {}): Promise<void> {
  if (!query) {
    displayError('Search query is required. Example: tzukwan dataset search "image classification"');
    throw new Error('Search query is required.');
  }

  const spinner = ora({
    text: chalk.cyan(`Searching datasets for: ${chalk.bold(query)}`),
    color: 'cyan',
  }).start();

  try {
    const search = await loadSearch();

    const results = await search.searchDatasets(query, {
      limit: options.limit ?? 20,
    });

    spinner.stop();

    if (results.length === 0) {
      displayInfo(`No datasets found for: ${query}`);
      return;
    }

    console.log(
      '\n' +
        boxen(
          chalk.bold.white(`Dataset results for: `) +
            chalk.cyan(query) +
            chalk.gray(`  (${results.length} found)`),
          {
            padding: { top: 0, bottom: 0, left: 1, right: 1 },
            borderColor: 'green',
            borderStyle: 'round',
          }
        )
    );

    displayTable(
      ['Name', 'Category', 'Format', 'License', 'Description'],
      results.map((d) => [
        d.name.slice(0, 30),
        d.category.slice(0, 20),
        d.format ?? '-',
        d.license ?? '-',
        (d.description ?? '').slice(0, 50) + ((d.description ?? '').length > 50 ? '...' : ''),
      ])
    );

    // Show URLs for top results
    console.log(chalk.bold.white('Dataset URLs:'));
    results.slice(0, 10).forEach((d, i) => {
      console.log(
        `  ${chalk.cyan(i + 1 + '.')} ` +
          chalk.bold.white(d.name) +
          chalk.gray(' → ') +
          chalk.underline.blue(d.url)
      );
    });
    console.log();
  } catch (err) {
    spinner.fail(chalk.red('Dataset search failed'));
    displayError(String(err));
    process.exitCode = 1;
  }
}

/**
 * List dataset categories command handler.
 */
export async function listDatasets(field?: string): Promise<void> {
  const spinner = ora({
    text: chalk.cyan('Loading dataset categories...'),
    color: 'cyan',
  }).start();

  try {
    const search = await loadSearch();
    const categories = await search.listDatasetCategories();

    spinner.stop();

    console.log('\n' + chalk.bold.cyan('📊 Awesome Public Datasets Categories') + '\n');

    const categoryEntries = field
      ? Object.entries(categories).filter(([category]) => {
          const cat = category.toLowerCase();
          const f = field.toLowerCase();
          return cat === f || cat.includes(f) || f.includes(cat) ||
                 cat.split(/[\s\/]+/).some((part) => part === f || part.startsWith(f));
        })
      : Object.entries(categories);

    for (const [category, datasets] of categoryEntries) {
      console.log(
        chalk.bold.white(category) + chalk.gray(` (${datasets.length} datasets)`)
      );
      datasets.slice(0, 5).forEach((ds) => {
        console.log(chalk.gray('  • ') + chalk.white(ds));
      });
      if (datasets.length > 5) {
        console.log(chalk.gray(`  ... and ${datasets.length - 5} more`));
      }
      console.log();
    }

    console.log(
      chalk.gray(`Total: ${categoryEntries.length} categories`) +
        chalk.gray(' · ') +
        chalk.gray(`Use `) +
        chalk.cyan('tzukwan dataset search <query>') +
        chalk.gray(' to search within categories')
    );
    console.log();
  } catch (err) {
    spinner.fail(chalk.red('Failed to load categories'));
    displayError(String(err));
    throw err;
  }
}
