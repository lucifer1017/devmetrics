#!/usr/bin/env node

import { Command } from 'commander';
import dotenv from 'dotenv';
import chalk from 'chalk';
import { GitHubService } from './services/github.service.js';
import { RootstockService, Network } from './services/rootstock.service.js';
import { validateRepo, validateContractAddress } from './utils/validation.js';
import { formatReport } from './formatters/index.js';
import { DevMetricsReport, OutputFormat } from './types/index.js';
import { validateRpcUrl } from './utils/rpc-url.js';

process.env.DOTENV_CONFIG_QUIET = 'true';
dotenv.config({ quiet: true });

const program = new Command();
const collectOption = (value: string, previous: string[]): string[] => [...previous, value];

program
  .name('devmetrics')
  .description('CLI tool that aggregates GitHub and Rootstock on-chain data for dApp developer health reports')
  .version('1.0.0')
  .option('-r, --repo <repo>', 'GitHub repository in format owner/repo (can be used multiple times)', collectOption, [])
  .option('-c, --contract <address>', 'Rootstock contract address (can be used multiple times)', collectOption, [])
  .option('-f, --format <format>', 'Output format: table, json, or markdown', 'table')
  .option('--ci', 'CI/CD mode: outputs JSON format', false)
  .option('--github-token <token>', 'GitHub personal access token')
  .option('--network <network>', 'Rootstock network: mainnet or testnet', 'mainnet')
  .option('--rpc-url <url>', 'Rootstock RPC URL (overrides network setting)')
  .option('--allow-private-rpc', 'Allow private/loopback RPC hosts (metadata targets remain blocked)', false)
  .option('--max-pairs <number>', 'Maximum repo/contract pairs to process (hard cap: 25)')
  .parse(process.argv);

interface Options {
  repo: string[];
  contract: string[];
  format?: string;
  ci?: boolean;
  githubToken?: string;
  network?: string;
  rpcUrl?: string;
  allowPrivateRpc?: boolean;
  maxPairs?: string;
}

async function main() {
  const options = program.opts<Options>();
  const HARD_MAX_PAIRS = 25;
  const allowPrivateRpc = options.allowPrivateRpc === true || process.argv.includes('--allow-private-rpc');

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

  const repos = options.repo ?? [];
  const contracts = options.contract ?? [];

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

  let maxPairs = HARD_MAX_PAIRS;
  if (options.maxPairs) {
    const parsed = Number.parseInt(options.maxPairs, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      console.error(chalk.red('Error: --max-pairs must be a positive integer'));
      process.exit(1);
    }
    if (parsed > HARD_MAX_PAIRS) {
      console.error(chalk.red(`Error: --max-pairs cannot exceed ${HARD_MAX_PAIRS}`));
      process.exit(1);
    }
    maxPairs = parsed;
  }

  if (pairs.length > maxPairs) {
    console.error(
      chalk.red(
        `Error: Too many repo/contract combinations (${pairs.length}); max is ${maxPairs}. Run in smaller chunks.`
      )
    );
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

  const effectiveRpcUrl =
    options.rpcUrl ||
    (network === 'testnet'
      ? process.env.ROOTSTOCK_TESTNET_RPC_URL || 'https://public-node.testnet.rsk.co'
      : process.env.ROOTSTOCK_MAINNET_RPC_URL || 'https://public-node.rsk.co');

  try {
    await validateRpcUrl(effectiveRpcUrl, { allowPrivateRpc });
  } catch (error: any) {
    console.error(chalk.red(`Error: ${error.message}`));
    process.exit(1);
  }

  if (options.githubToken) {
    const token = options.githubToken.trim();
    const tokenPattern = /^[A-Za-z0-9_]+$/;
    if (token.length < 20 || token.length > 255 || !tokenPattern.test(token)) {
      console.error(chalk.red('Error: --github-token appears malformed. Use a valid token or GITHUB_TOKEN env var.'));
      process.exit(1);
    }
    if (!options.ci) {
      console.error(chalk.yellow('Warning: --github-token can be exposed in process lists/shell history. Prefer GITHUB_TOKEN env var.'));
    }
  }

  const githubService = new GitHubService(options.githubToken, !!options.ci);
  const rootstockService = new RootstockService(options.rpcUrl, network, allowPrivateRpc);

  if (outputFormat === 'table') {
    console.log(chalk.cyan(`🌐 Rootstock Network: ${chalk.bold(rootstockService.getNetwork().toUpperCase())}`));
    console.log(chalk.gray(`   RPC URL: ${rootstockService.getRedactedRpcUrl()}\n`));
  }

  const initialAuthStatus = githubService.isAuthenticated();
  if (!initialAuthStatus && outputFormat === 'table') {
    console.log(chalk.yellow('\n⚠️  No GitHub token detected. Using unauthenticated mode (60 requests/hour limit).'));
    console.log(chalk.yellow('   For 5,000 requests/hour, add a valid GITHUB_TOKEN to your .env file.\n'));
  }

  if (outputFormat === 'table') {
    // Skip pre-flight rate-limit request to avoid noisy auth logs and extra API usage.
  }

  const reports: DevMetricsReport[] = [];
  const errors: Array<{ pair: { repo: string; contract: string }; error: string }> = [];

  const restoreConsoleFns = options.ci
    ? (() => {
        const originalLog = console.log;
        const originalWarn = console.warn;
        const originalError = console.error;
        const originalInfo = console.info;
        const originalDebug = console.debug;

        const noop = () => {};
        console.log = noop;
        console.warn = noop;
        console.error = noop;
        console.info = noop;
        console.debug = noop;

        return () => {
          console.log = originalLog;
          console.warn = originalWarn;
          console.error = originalError;
          console.info = originalInfo;
          console.debug = originalDebug;
        };
      })()
    : null;

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

  if (options.ci) {
    restoreConsoleFns?.();
    console.log(
      JSON.stringify(
        {
          reports,
          errors,
          meta: {
            network,
            pairCount: pairs.length,
            successCount: reports.length,
            errorCount: errors.length,
            generatedAt: new Date().toISOString(),
          },
        },
        null,
        2
      )
    );

    if (reports.length > 0 && errors.length === 0) process.exit(0);
    if (reports.length > 0 && errors.length > 0) process.exit(2);
    process.exit(1);
  } else {
    restoreConsoleFns?.();
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
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(chalk.red('Fatal error:'), message);
  process.exit(1);
});
