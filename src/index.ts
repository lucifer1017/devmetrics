#!/usr/bin/env node

import { Command } from 'commander';
import dotenv from 'dotenv';
import chalk from 'chalk';
import { GitHubService } from './services/github.service.js';
import { RootstockService, Network } from './services/rootstock.service.js';
import { validateRepo, validateContractAddress } from './utils/validation.js';
import { formatReport } from './formatters/index.js';
import { DevMetricsReport, OutputFormat } from './types/index.js';

dotenv.config();

const program = new Command();

program
  .name('devmetrics')
  .description('CLI tool that aggregates GitHub and Rootstock on-chain data for dApp developer health reports')
  .version('1.0.0')
  .option('-r, --repo <repo>', 'GitHub repository in format owner/repo (can be used multiple times)')
  .option('-c, --contract <address>', 'Rootstock contract address (can be used multiple times)')
  .option('-f, --format <format>', 'Output format: table, json, or markdown', 'table')
  .option('--ci', 'CI/CD mode: outputs JSON format', false)
  .option('--github-token <token>', 'GitHub personal access token')
  .option('--network <network>', 'Rootstock network: mainnet or testnet', 'mainnet')
  .option('--rpc-url <url>', 'Rootstock RPC URL (overrides network setting)')
  .parse(process.argv);

interface Options {
  repo?: string | string[];
  contract?: string | string[];
  format?: string;
  ci?: boolean;
  githubToken?: string;
  network?: string;
  rpcUrl?: string;
}

async function main() {
  const options = program.opts<Options>();

  if (options.network && !['mainnet', 'testnet'].includes(options.network.toLowerCase())) {
    console.error(chalk.red(`Invalid network: ${options.network}. Must be 'mainnet' or 'testnet'`));
    process.exit(1);
  }
  const network: Network = (options.network?.toLowerCase() as Network) || 'mainnet';

  let outputFormat: OutputFormat = 'table';
  if (options.ci) {
    outputFormat = 'json';
  } else if (options.format) {
    const validFormats: OutputFormat[] = ['table', 'json', 'markdown'];
    if (validFormats.includes(options.format as OutputFormat)) {
      outputFormat = options.format as OutputFormat;
    } else {
      console.error(chalk.red(`Invalid format: ${options.format}. Must be one of: ${validFormats.join(', ')}`));
      process.exit(1);
    }
  }

  const repos = Array.isArray(options.repo) ? options.repo : options.repo ? [options.repo] : [];
  const contracts = Array.isArray(options.contract) 
    ? options.contract 
    : options.contract 
    ? [options.contract] 
    : [];

  if (repos.length === 0) {
    console.error(chalk.red('Error: At least one repository (--repo) is required'));
    program.help();
    process.exit(1);
  }

  if (contracts.length === 0) {
    console.error(chalk.red('Error: At least one contract address (--contract) is required'));
    program.help();
    process.exit(1);
  }

  const pairs: Array<{ repo: string; contract: string }> = [];
  
  if (repos.length === contracts.length) {
    for (let i = 0; i < repos.length; i++) {
      pairs.push({ repo: repos[i], contract: contracts[i] });
    }
  } else if (contracts.length === 1) {
    for (const repo of repos) {
      pairs.push({ repo, contract: contracts[0] });
    }
  } else if (repos.length === 1) {
    for (const contract of contracts) {
      pairs.push({ repo: repos[0], contract });
    }
  } else {
    console.error(chalk.red('Error: Number of repositories and contracts must match, or one must be singular'));
    process.exit(1);
  }

  const validationErrors: string[] = [];
  for (const pair of pairs) {
    const repoValidation = validateRepo(pair.repo);
    if (!repoValidation.valid) {
      validationErrors.push(`Repository "${pair.repo}": ${repoValidation.error}`);
    }

    const contractValidation = validateContractAddress(pair.contract);
    if (!contractValidation.valid) {
      validationErrors.push(`Contract "${pair.contract}": ${contractValidation.error}`);
    }
  }

  if (validationErrors.length > 0) {
    console.error(chalk.red('Validation errors:'));
    validationErrors.forEach(error => console.error(chalk.red(`  - ${error}`)));
    process.exit(1);
  }

  const githubService = new GitHubService(options.githubToken);
  const rootstockService = new RootstockService(options.rpcUrl, network);

  if (outputFormat === 'table') {
    console.log(chalk.cyan(`🌐 Rootstock Network: ${chalk.bold(rootstockService.getNetwork().toUpperCase())}`));
    console.log(chalk.gray(`   RPC URL: ${rootstockService.getRpcUrl()}\n`));
  }

  const initialAuthStatus = githubService.isAuthenticated();
  if (!initialAuthStatus && outputFormat === 'table') {
    console.log(chalk.yellow('\n⚠️  No GitHub token detected. Using unauthenticated mode (60 requests/hour limit).'));
    console.log(chalk.yellow('   For 5,000 requests/hour, add a valid GITHUB_TOKEN to your .env file.\n'));
  }

  if (outputFormat === 'table') {
    try {
      const rateLimit = await githubService.getRateLimitStatus();
      if (rateLimit) {
        const percentage = ((rateLimit.remaining / rateLimit.limit) * 100).toFixed(1);
        const color = rateLimit.remaining < rateLimit.limit * 0.1 ? chalk.red : 
                     rateLimit.remaining < rateLimit.limit * 0.3 ? chalk.yellow : chalk.green;
        console.log(color(`📊 GitHub API: ${rateLimit.remaining}/${rateLimit.limit} requests remaining (${percentage}%)`));
        if (rateLimit.remaining < rateLimit.limit * 0.2) {
          console.log(chalk.yellow(`   Rate limit resets at: ${rateLimit.resetAt.toLocaleString()}`));
        }
      }
    } catch {
    }
  }

  const reports: DevMetricsReport[] = [];
  const errors: Array<{ pair: { repo: string; contract: string }; error: string }> = [];

  for (const pair of pairs) {
    try {
      if (!outputFormat || outputFormat === 'table') {
        console.log(chalk.blue(`\n📊 Fetching metrics for ${pair.repo}...`));
      }

      const [owner, repo] = pair.repo.split('/');

      let githubMetrics;
      try {
        if (outputFormat === 'table') {
          process.stdout.write(chalk.gray('   Fetching GitHub data... '));
        }
        githubMetrics = await githubService.getMetrics(owner, repo);
        if (outputFormat === 'table') {
          console.log(chalk.green('✓'));
        }
      } catch (error: any) {
        if (outputFormat === 'table') {
          console.log(chalk.red('✗'));
        }
        throw error;
      }

      let rootstockMetrics;
      try {
        if (outputFormat === 'table') {
          process.stdout.write(chalk.gray('   Fetching Rootstock data... '));
        }
        rootstockMetrics = await rootstockService.getMetrics(pair.contract);
        if (outputFormat === 'table') {
          console.log(chalk.green('✓'));
        }
      } catch (error: any) {
        if (outputFormat === 'table') {
          console.log(chalk.red('✗'));
        }
        throw error;
      }

      const report: DevMetricsReport = {
        repository: pair.repo,
        contractAddress: pair.contract,
        github: githubMetrics,
        rootstock: rootstockMetrics,
        timestamp: new Date().toISOString(),
      };

      reports.push(report);
    } catch (error: any) {
      errors.push({
        pair,
        error: error.message || 'Unknown error',
      });
    }
  }

  if (reports.length > 0) {
    const output = formatReport(reports, outputFormat);
    console.log(output);
  }

  if (errors.length > 0) {
    if (outputFormat === 'json') {
      console.error(JSON.stringify({ errors }, null, 2));
    } else {
      console.error(chalk.red('\n❌ Errors encountered:'));
      errors.forEach(({ pair, error }) => {
        console.error(chalk.red(`  ${pair.repo} / ${pair.contract}: ${error}`));
      });
    }
    process.exit(1);
  }

  if (reports.length === 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(chalk.red('Fatal error:'), error.message);
  process.exit(1);
});
