# Rootstock Dev Metrics CLI

A CLI tool that aggregates GitHub and Rootstock on-chain data for any dApp into a single developer health report.

## Installation

```bash
npm install
npm run build
```

## Usage

```bash
# Analyze a single repository and contract
npm run dev -- --repo owner/repo --contract 0x...

# Batch analysis
npm run dev -- --repo owner/repo1 --contract 0x... --repo owner/repo2 --contract 0x...

# CI/CD mode (JSON output)
npm run dev -- --repo owner/repo --contract 0x... --ci

# Custom output format
npm run dev -- --repo owner/repo --contract 0x... --format markdown
```

## Environment Variables

Create a `.env` file:

```
GITHUB_TOKEN=your_github_token_here
ROOTSTOCK_RPC_URL=https://public-node.rsk.co
```
