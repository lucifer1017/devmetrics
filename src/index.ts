#!/usr/bin/env node

import { Command } from 'commander';
import dotenv from 'dotenv';
import chalk from 'chalk';
import { GitHubService } from './services/github.service';
import { RootstockService } from './services/rootstock.service';
import { validateRepo, validateContractAddress } from './utils/validation';
import { formatReport } from './formatters';
import { DevMetricsReport, OutputFormat } from './types';

// Load environment variables
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
  .option('--rpc-url <url>', 'Rootstock RPC URL')
  .parse(process.argv);

interface Options {
  repo?: string | string[];
  contract?: string | string[];
  format?: string;
  ci?: boolean;
  githubToken?: string;
  rpcUrl?: string;
}

async function main() {
  const options = program.opts<Options>();

  // Determine output format
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

  // Parse repositories and contracts
  const repos = Array.isArray(options.repo) ? options.repo : options.repo ? [options.repo] : [];
  const contracts = Array.isArray(options.contract) 
    ? options.contract 
    : options.contract 
    ? [options.contract] 
    : [];

  // Validate inputs
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

  // Support batch analysis: if multiple repos/contracts, pair them or use single contract for all
  const pairs: Array<{ repo: string; contract: string }> = [];
  
  if (repos.length === contracts.length) {
    // Pair them up
    for (let i = 0; i < repos.length; i++) {
      pairs.push({ repo: repos[i], contract: contracts[i] });
    }
  } else if (contracts.length === 1) {
    // Use single contract for all repos
    for (const repo of repos) {
      pairs.push({ repo, contract: contracts[0] });
    }
  } else if (repos.length === 1) {
    // Use single repo for all contracts
    for (const contract of contracts) {
      pairs.push({ repo: repos[0], contract });
    }
  } else {
    console.error(chalk.red('Error: Number of repositories and contracts must match, or one must be singular'));
    process.exit(1);
  }

  // Validate all inputs
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

  // Initialize services
  const githubService = new GitHubService(options.githubToken);
  const rootstockService = new RootstockService(options.rpcUrl);

  // Fetch metrics for all pairs
  const reports: DevMetricsReport[] = [];
  const errors: Array<{ pair: { repo: string; contract: string }; error: string }> = [];

  for (const pair of pairs) {
    try {
      if (!outputFormat || outputFormat === 'table') {
        console.log(chalk.blue(`\n📊 Fetching metrics for ${pair.repo}...`));
      }

      // Parse repo
      const [owner, repo] = pair.repo.split('/');

      // Fetch GitHub metrics
      const githubMetrics = await githubService.getMetrics(owner, repo);

      // Fetch Rootstock metrics
      const rootstockMetrics = await rootstockService.getMetrics(pair.contract);

      // Create report
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

  // Output results
  if (reports.length > 0) {
    const output = formatReport(reports, outputFormat);
    console.log(output);
  }

  // Output errors if any
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

// Run the CLI
main().catch((error) => {
  console.error(chalk.red('Fatal error:'), error.message);
  process.exit(1);
});
