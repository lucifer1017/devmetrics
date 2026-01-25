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

# Pass GitHub token via command line (alternative to .env)
npm run dev -- --repo owner/repo --contract 0x... --github-token your_token_here

# Use testnet instead of mainnet (default)
npm run dev -- --repo owner/repo --contract 0x... --network testnet

# Use custom RPC URL (overrides network setting)
npm run dev -- --repo owner/repo --contract 0x... --rpc-url https://custom-rpc-url.com
```

## Environment Variables

Create a `.env` file in the project root:

```
GITHUB_TOKEN=your_github_token_here
ROOTSTOCK_MAINNET_RPC_URL=https://public-node.rsk.co
ROOTSTOCK_TESTNET_RPC_URL=https://public-node.testnet.rsk.co
```

**Note:** If you don't set these, the tool uses the default public RPC nodes.

### Getting a GitHub Token

**Yes, GitHub tokens are tied to your personal GitHub account** (or organization account). Here's how to create one:

1. **Go to GitHub Settings:**
   - Visit: https://github.com/settings/tokens
   - Or: GitHub → Your Profile → Settings → Developer settings → Personal access tokens → Tokens (classic)

2. **Create a New Token:**
   - Click "Generate new token" → "Generate new token (classic)"
   - Give it a descriptive name (e.g., "Rootstock Dev Metrics CLI")
   - Set expiration (30 days, 90 days, or no expiration)

3. **Select Permissions:**
   For this tool, you need:
   - ✅ **repo** (Full control of private repositories) - if analyzing private repos
   - ✅ **public_repo** (Access public repositories) - if analyzing public repos only
   - ✅ **read:org** (Read org and team membership) - if analyzing organization repos

   **Note:** For public repositories only, you can use a token with just `public_repo` scope.

4. **Generate and Copy:**
   - Click "Generate token"
   - **IMPORTANT:** Copy the token immediately - you won't see it again!
   - Paste it into your `.env` file

5. **Security Best Practices:**
   - Never commit your `.env` file to Git (it's already in `.gitignore`)
   - Use different tokens for different projects
   - Revoke tokens you no longer use
   - Use fine-grained tokens (newer option) for better security

### Token vs No Token

The tool works in **two modes**:

**🔓 Without Token (Unauthenticated Mode):**
- ✅ Works out of the box - no setup needed
- ⚠️ Limited to **60 requests/hour**
- 📊 Optimized to use minimal API calls
- 💡 Good for: Single repo analysis, occasional use
- ⚠️ You'll see a warning message when running

**🔐 With Token (Authenticated Mode):**
- ✅ **5,000 requests/hour** (83x more!)
- 📊 More accurate metrics (uses search API for PR counts)
- 💡 Good for: Batch analysis, CI/CD pipelines, frequent use
- 🎯 Recommended for production use

**The tool automatically detects if you have a token and adjusts accordingly!**
