# 🚀 Rootstock Dev Metrics CLI

> **One command. Two worlds. Complete insights.**  
> Aggregate GitHub and Rootstock on-chain data into a single developer health report for your dApp.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)

---

## 📋 Table of Contents

- [What is This?](#-what-is-this)
- [Why Use It?](#-why-use-it)
- [Features](#-features)
- [Installation](#-installation)
- [Quick Start](#-quick-start)
- [Usage Examples](#-usage-examples)
- [Configuration](#-configuration)
- [How It Works](#-how-it-works)
- [Testing the Project](#-testing-the-project)
- [Troubleshooting](#-troubleshooting)
- [Project Structure](#-project-structure)

---

## 🎯 What is This?

**Rootstock Dev Metrics CLI** is a powerful command-line tool that bridges the gap between your GitHub repository and Rootstock blockchain data. Instead of jumping between multiple dashboards, run a single command to get a comprehensive health report of your dApp.

### The Problem It Solves

- ❌ **Before:** Check GitHub for commits, then Rootstock explorer for transactions, then calculate metrics manually
- ✅ **After:** One command gives you everything in a beautiful, formatted report

---

## 💡 Why Use It?

### For Developers
- **Quick Health Checks:** Instantly see if your dApp is active and maintained
- **Batch Analysis:** Analyze multiple repos/contracts in one go
- **CI/CD Integration:** JSON output perfect for automation pipelines

### For Project Managers
- **Activity Monitoring:** Track development activity and on-chain usage
- **Maintenance Status:** See last commits and transactions at a glance
- **Team Insights:** Contributor counts and engagement metrics

### For Auditors
- **Comprehensive Reports:** Get both code and blockchain activity in one place
- **Export Options:** Markdown format perfect for documentation
- **Historical Data:** Track deployment blocks and transaction patterns

---

## ✨ Features

### 🔗 Dual-Source Data Aggregation
- **GitHub Metrics:** Stars, commits, issues, PRs, contributors
- **Rootstock Metrics:** Deployment block, transactions, gas usage patterns

### 🌐 Network Support
- **Mainnet & Testnet:** Switch between networks with a simple flag
- **Custom RPC URLs:** Use your own RPC endpoints

### 📊 Multiple Output Formats
- **Table:** Beautiful terminal tables with colors (default)
- **JSON:** Perfect for CI/CD and automation
- **Markdown:** Ready for documentation and reports

### 🔐 Smart Authentication
- **Works Without Token:** 60 requests/hour (unauthenticated)
- **With Token:** 5,000 requests/hour (authenticated)
- **Auto-Fallback:** Invalid tokens automatically switch to unauthenticated mode

### ⚡ Production-Ready
- **Timeout Protection:** No infinite hangs - all operations have timeouts
- **Error Handling:** Graceful degradation with clear error messages
- **Progress Indicators:** Real-time feedback during data fetching
- **Batch Processing:** Analyze multiple repos/contracts efficiently

---

## 📦 Installation

### Prerequisites
- **Node.js** 18+ 
- **npm** or **yarn**

### Setup Steps

1. **Clone or download the project**
   ```bash
   cd devmetrics
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Build the project**
   ```bash
   npm run build
   ```

4. **Configure environment (optional)**
   ```bash
   cp .env.example .env
   # Edit .env with your GitHub token and RPC URLs
   ```

---

## 🚀 Quick Start

### Basic Usage

```bash
# Analyze a single repository and contract
node dist/index.js --repo owner/repo --contract 0xYourContractAddress

# Example with real data
node dist/index.js --repo lucifer1017/rskattestation --contract 0xe022df9f57b611675B6b713307E7563D0c9abC74 --network testnet
```

### What You'll See

```
🌐 Rootstock Network: TESTNET
   RPC URL: https://public-node.testnet.rsk.co

📊 GitHub API: 54/60 requests remaining (90.0%)

📊 Fetching metrics for lucifer1017/rskattestation...
   Fetching GitHub data... ✓
   Fetching Rootstock data... ✓

📊 Report for lucifer1017/rskattestation
Contract: 0xe022df9f57b611675B6b713307E7563D0c9abC74
Generated: 1/25/2026, 4:46:11 PM

┌─────────────────┬───────────┐
│ GitHub Metrics  │ Value     │
├─────────────────┼───────────┤
│ ⭐ Stars        │ 0         │
│ 📝 Last Commit  │ 1/12/2026 │
│ 🐛 Open Issues  │ 0         │
│ 🔀 Open PRs     │ 0         │
│ 👥 Contributors │ 1         │
└─────────────────┴───────────┘

┌───────────────────────┬─────────┐
│ Rootstock Metrics     │ Value   │
├───────────────────────┼─────────┤
│ 📦 Deployment Block   │ 7269281 │
│ 📊 Total Transactions │ 0       │
│ ⏰ Last Transaction   │ N/A     │
│ ⛽ Avg Gas Usage      │ 0       │
└───────────────────────┴─────────┘
```

---

## 📖 Usage Examples

### 1. Basic Analysis (Mainnet)
```bash
node dist/index.js --repo owner/repo --contract 0xYourContractAddress
```

### 2. Testnet Analysis
```bash
node dist/index.js --repo owner/repo --contract 0xYourContractAddress --network testnet
```

### 3. JSON Output (CI/CD)
```bash
node dist/index.js --repo owner/repo --contract 0xYourContractAddress --format json

# Or use the --ci flag
node dist/index.js --repo owner/repo --contract 0xYourContractAddress --ci
```

### 4. Markdown Output
```bash
node dist/index.js --repo owner/repo --contract 0xYourContractAddress --format markdown
```

### 5. Batch Analysis
```bash
# Multiple repos with one contract
node dist/index.js \
  --repo owner/repo1 \
  --repo owner/repo2 \
  --contract 0xYourContractAddress

# Multiple contracts with one repo
node dist/index.js \
  --repo owner/repo \
  --contract 0xContract1 \
  --contract 0xContract2

# Paired analysis
node dist/index.js \
  --repo owner/repo1 --contract 0xContract1 \
  --repo owner/repo2 --contract 0xContract2
```

### 6. With GitHub Token
```bash
# Via environment variable (recommended)
export GITHUB_TOKEN=your_token_here
node dist/index.js --repo owner/repo --contract 0xYourContractAddress

# Via command line
node dist/index.js --repo owner/repo --contract 0xYourContractAddress --github-token your_token_here
```

### 7. Custom RPC URL
```bash
node dist/index.js --repo owner/repo --contract 0xYourContractAddress --rpc-url https://your-custom-rpc.com
```

---

## ⚙️ Configuration

### Environment Variables

Create a `.env` file in the project root (copy from `.env.example`):

```env
# GitHub Personal Access Token (optional but recommended)
# Get one at: https://github.com/settings/tokens
GITHUB_TOKEN=ghp_your_token_here

# Rootstock RPC URLs (optional, defaults to public nodes)
ROOTSTOCK_MAINNET_RPC_URL=https://public-node.rsk.co
ROOTSTOCK_TESTNET_RPC_URL=https://public-node.testnet.rsk.co
```

### Getting a GitHub Token

1. Visit [GitHub Settings → Tokens](https://github.com/settings/tokens)
2. Click "Generate new token (classic)"
3. Name it (e.g., "Dev Metrics CLI")
4. Select scopes:
   - `public_repo` for public repositories
   - `repo` for private repositories
5. Generate and copy the token
6. Add to `.env` file

**Why use a token?**
- **Without token:** 60 requests/hour (good for occasional use)
- **With token:** 5,000 requests/hour (perfect for batch analysis)

---

## 🔧 How It Works

### Architecture Overview

```
┌─────────────────┐
│   CLI Input     │  (commander.js)
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
┌───▼───┐ ┌───▼──────┐
│ GitHub│ │ Rootstock│  (Parallel fetching)
│Service│ │ Service  │
└───┬───┘ └───┬──────┘
    │         │
    └────┬────┘
         │
┌────────▼────────┐
│  Formatters     │  (Table/JSON/Markdown)
└────────┬────────┘
         │
┌────────▼────────┐
│  Terminal Output│
└─────────────────┘
```

### Data Flow

1. **Input Validation:** Validates repo format and contract addresses using Zod
2. **Parallel Fetching:** 
   - GitHub API calls (with timeout protection)
   - Rootstock RPC calls (with optimized block searching)
3. **Data Aggregation:** Combines metrics into a unified report
4. **Formatting:** Converts to requested output format
5. **Display:** Shows results with progress indicators

### Key Technologies

- **TypeScript:** Type-safe development
- **Commander.js:** CLI argument parsing
- **Octokit:** GitHub API client
- **Ethers.js:** Rootstock/Ethereum JSON-RPC client
- **Chalk:** Terminal colors
- **CLI-Table3:** Beautiful table formatting
- **Zod:** Input validation

---

## 🧪 Testing the Project

### Test Setup

1. **Build the project**
   ```bash
   npm run build
   ```

2. **Prepare test data**
   - Choose a public GitHub repository (e.g., `facebook/react`)
   - Get a Rootstock contract address (from [explorer.rootstock.io](https://explorer.rootstock.io))

### Test Scenarios

#### Test 1: Basic Functionality
```bash
node dist/index.js --repo facebook/react --contract 0x0000000000000000000000000000000000000000
```
**Expected:** Should fetch GitHub metrics and attempt Rootstock metrics

#### Test 2: Testnet Network
```bash
node dist/index.js --repo owner/repo --contract 0xYourTestnetContract --network testnet
```
**Expected:** Should use testnet RPC and show "TESTNET" in output

#### Test 3: JSON Output
```bash
node dist/index.js --repo owner/repo --contract 0xYourContract --format json
```
**Expected:** Should output valid JSON

#### Test 4: Markdown Output
```bash
node dist/index.js --repo owner/repo --contract 0xYourContract --format markdown
```
**Expected:** Should output formatted Markdown

#### Test 5: Error Handling
```bash
# Invalid repo format
node dist/index.js --repo invalid-format --contract 0x0000000000000000000000000000000000000000

# Invalid contract address
node dist/index.js --repo owner/repo --contract invalid123

# Missing arguments
node dist/index.js
```
**Expected:** Should show clear error messages

#### Test 6: Help Command
```bash
node dist/index.js --help
```
**Expected:** Should display usage information

### Real-World Test Example

```bash
# Using the provided test data
node dist/index.js \
  --repo lucifer1017/rskattestation \
  --contract 0xe022df9f57b611675B6b713307E7563D0c9abC74 \
  --network testnet
```

**What to verify:**
- ✅ GitHub data fetches successfully
- ✅ Rootstock data fetches (may show N/A if contract has no activity)
- ✅ Progress indicators show (✓ or ✗)
- ✅ Table format displays correctly
- ✅ No timeouts or hangs

---

## 🐛 Troubleshooting

### Issue: "GitHub API rate limit exceeded"

**Solution:**
- Add a valid `GITHUB_TOKEN` to your `.env` file
- Wait for the rate limit to reset (shown in error message)
- The tool automatically falls back to unauthenticated mode if token is invalid

### Issue: "Rootstock metrics fetch timed out"

**Possible causes:**
- RPC node is slow or unresponsive
- Contract is very old (searches last 10k blocks)
- Network connectivity issues

**Solutions:**
- Try a different RPC URL: `--rpc-url https://alternative-rpc.com`
- Check your internet connection
- The tool will timeout gracefully after 45 seconds

### Issue: "Repository not found"

**Solutions:**
- Verify the repo format: `owner/repo` (not a URL)
- Check if the repository is public (or you have access)
- Ensure you have a valid GitHub token if it's a private repo

### Issue: "Invalid contract address"

**Solutions:**
- Ensure address starts with `0x`
- Address must be exactly 42 characters (0x + 40 hex chars)
- Check if you're using the correct network (mainnet vs testnet)

### Issue: Build errors

**Solutions:**
```bash
# Clean and rebuild
rm -rf dist node_modules
npm install
npm run build
```

---

## 📁 Project Structure

```
devmetrics/
├── src/
│   ├── index.ts                 # CLI entry point
│   ├── services/
│   │   ├── github.service.ts    # GitHub API integration
│   │   └── rootstock.service.ts # Rootstock RPC integration
│   ├── formatters/
│   │   ├── index.ts             # Formatter router
│   │   ├── table.formatter.ts   # Table output
│   │   ├── json.formatter.ts    # JSON output
│   │   └── markdown.formatter.ts # Markdown output
│   ├── utils/
│   │   └── validation.ts        # Input validation (Zod)
│   └── types/
│       └── index.ts              # TypeScript type definitions
├── dist/                         # Compiled JavaScript (generated)
├── .env.example                  # Environment variables template
├── .gitignore                    # Git ignore rules
├── package.json                  # Dependencies and scripts
├── tsconfig.json                 # TypeScript configuration
└── README.md                     # This file
```

---

## 🎓 Understanding the Metrics

### GitHub Metrics

- **⭐ Stars:** Repository popularity indicator
- **📝 Last Commit:** Most recent code activity
- **🐛 Open Issues:** Active problems/feature requests
- **🔀 Open PRs:** Pending code contributions
- **👥 Contributors:** Team size and collaboration

### Rootstock Metrics

- **📦 Deployment Block:** When the contract was deployed
- **📊 Total Transactions:** On-chain activity volume
- **⏰ Last Transaction:** Most recent contract interaction
- **⛽ Gas Usage Patterns:** Average, min, max gas consumption

---

## 🚦 Performance

- **GitHub API:** 15s timeout per call, 60s total
- **Rootstock RPC:** 5s timeout per call, 45s total
- **Optimized Block Search:** Limited to last 10k blocks for deployment
- **Parallel Execution:** Transaction count, last transaction, and gas patterns fetched simultaneously

---

## 📝 License

MIT License - feel free to use this project for your own needs!

---

## 🤝 Contributing

This is a focused CLI tool, but suggestions and improvements are welcome!

---

## 📧 Support

For issues or questions:
1. Review the error messages (they're designed to be helpful!)
2. Ensure you're using the latest version

---

**Made with ❤️ for the Rootstock ecosystem**

*One command to rule them all. One command to find them. One command to bring them all and in the metrics bind them.* 🧙‍♂️
