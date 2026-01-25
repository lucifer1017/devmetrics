import { ethers } from 'ethers';
import { RootstockMetrics } from '../types/index.js';

export type Network = 'mainnet' | 'testnet';

export class RootstockService {
  private provider: ethers.JsonRpcProvider;
  private network: Network;
  private rpcUrl: string;
  private readonly RPC_TIMEOUT = 5000; // 5 seconds per RPC call (reduced for faster failures)
  private readonly MAX_DEPLOYMENT_SEARCH_BLOCKS = 10000; // Limit search to last 10k blocks (reduced)
  private readonly MAX_TRANSACTION_SEARCH_BLOCKS = 2000; // Limit transaction search (reduced)

  constructor(rpcUrl?: string, network?: Network) {
    // Priority: explicit network parameter > network from rpcUrl > default mainnet
    if (network) {
      this.network = network;
    } else if (rpcUrl) {
      this.network = this.determineNetwork(rpcUrl);
    } else {
      this.network = 'mainnet'; // Default to mainnet
    }
    
    // Get RPC URL: provided URL takes precedence over network-based URL
    if (rpcUrl) {
      this.rpcUrl = rpcUrl;
    } else {
      this.rpcUrl = this.getRpcUrlForNetwork(this.network);
    }

    this.provider = new ethers.JsonRpcProvider(this.rpcUrl);
  }

  /**
   * Execute RPC call with timeout
   */
  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number = this.RPC_TIMEOUT): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => 
        setTimeout(() => reject(new Error(`RPC call timed out after ${timeoutMs}ms`)), timeoutMs)
      )
    ]);
  }

  /**
   * Get the current network
   */
  getNetwork(): Network {
    return this.network;
  }

  /**
   * Get the RPC URL being used
   */
  getRpcUrl(): string {
    return this.rpcUrl;
  }

  /**
   * Determine network from RPC URL if not explicitly provided
   */
  private determineNetwork(rpcUrl?: string): Network {
    if (rpcUrl) {
      return rpcUrl.includes('testnet') ? 'testnet' : 'mainnet';
    }
    return 'mainnet'; // Default to mainnet
  }

  /**
   * Get RPC URL for the specified network
   */
  private getRpcUrlForNetwork(network: Network): string {
    if (network === 'testnet') {
      return process.env.ROOTSTOCK_TESTNET_RPC_URL || 'https://public-node.testnet.rsk.co';
    }
    // mainnet
    return process.env.ROOTSTOCK_MAINNET_RPC_URL || 'https://public-node.rsk.co';
  }

  async getMetrics(contractAddress: string): Promise<RootstockMetrics> {
    const TOTAL_TIMEOUT = 45000; // 45 seconds total (reduced from 90)
    
    return Promise.race([
      this.fetchMetrics(contractAddress),
      new Promise<RootstockMetrics>((_, reject) =>
        setTimeout(() => reject(new Error(`Rootstock metrics fetch timed out after ${TOTAL_TIMEOUT}ms`)), TOTAL_TIMEOUT)
      )
    ]);
  }

  private async fetchMetrics(contractAddress: string): Promise<RootstockMetrics> {
    try {
      // Validate address
      if (!ethers.isAddress(contractAddress)) {
        throw new Error(`Invalid contract address: ${contractAddress}`);
      }

      // Run operations in parallel where possible for speed
      const currentBlockPromise = this.withTimeout(this.provider.getBlockNumber(), 5000);
      
      // Get contract creation block (deployment block) - this is the slowest operation
      const deploymentBlockPromise = this.getDeploymentBlock(contractAddress);
      
      // Wait for current block first (needed for other operations)
      const currentBlock = await currentBlockPromise;
      const deploymentBlock = await deploymentBlockPromise;

      // If we have deployment block, run these in parallel
      if (deploymentBlock) {
        const [transactionCount, lastTransaction, gasUsagePatterns] = await Promise.allSettled([
          this.getTransactionCount(contractAddress, deploymentBlock),
          this.getLastTransaction(contractAddress, deploymentBlock),
          this.getGasUsagePatterns(contractAddress, deploymentBlock),
        ]);

        return {
          contractAddress,
          deploymentBlock,
          totalTransactionCount: transactionCount.status === 'fulfilled' ? transactionCount.value : 0,
          lastTransactionTimestamp: lastTransaction.status === 'fulfilled' ? lastTransaction.value : null,
          gasUsagePatterns: gasUsagePatterns.status === 'fulfilled' ? gasUsagePatterns.value : { average: 0, min: 0, max: 0 },
        };
      }

      // No deployment block found - return minimal data
      return {
        contractAddress,
        deploymentBlock: null,
        totalTransactionCount: 0,
        lastTransactionTimestamp: null,
        gasUsagePatterns: { average: 0, min: 0, max: 0 },
      };
    } catch (error: any) {
      throw new Error(`Failed to fetch Rootstock metrics: ${error.message}`);
    }
  }

  private async getDeploymentBlock(contractAddress: string): Promise<number | null> {
    try {
      const currentBlock = await this.withTimeout(this.provider.getBlockNumber(), 5000);
      
      // Limit search to recent blocks for performance
      const searchStartBlock = Math.max(0, currentBlock - this.MAX_DEPLOYMENT_SEARCH_BLOCKS);
      
      // Quick check: does contract exist now?
      const currentCode = await this.withTimeout(this.provider.getCode(contractAddress, currentBlock), 5000);
      
      if (!currentCode || currentCode === '0x') {
        // Contract doesn't exist at current block, search backwards with larger steps
        const chunkSize = 2000; // Larger chunks for faster search
        const maxChecks = 10; // Limit number of checks
        
        for (let i = 0; i < maxChecks; i++) {
          const block = currentBlock - (i * chunkSize);
          if (block < searchStartBlock) break;
          
          try {
            const code = await this.withTimeout(this.provider.getCode(contractAddress, block), 3000);
            if (code && code !== '0x') {
              // Found it, return approximate block (don't do precise binary search to save time)
              return block;
            }
          } catch {
            // Timeout or error, continue
            continue;
          }
        }
        return null;
      }
      
      // Contract exists, do a quick binary search with limited iterations
      return await this.binarySearchDeployment(contractAddress, searchStartBlock, currentBlock);
    } catch (error: any) {
      // Timeout or error - return null gracefully
      return null;
    }
  }

  private async binarySearchDeployment(
    contractAddress: string,
    low: number,
    high: number
  ): Promise<number> {
    const maxIterations = 10; // Reduced from 20 for speed
    let iterations = 0;
    
    while (low < high && iterations < maxIterations) {
      iterations++;
      const mid = Math.floor((low + high) / 2);
      
      try {
        const code = await this.withTimeout(this.provider.getCode(contractAddress, mid), 3000);
        
        if (code && code !== '0x') {
          high = mid;
        } else {
          low = mid + 1;
        }
      } catch {
        // On timeout/error, return current best guess
        return low;
      }
    }
    return low;
  }

  private async getTransactionCount(
    contractAddress: string,
    deploymentBlock: number | null
  ): Promise<number> {
    try {
      if (!deploymentBlock) return 0;

      const currentBlock = await this.withTimeout(this.provider.getBlockNumber(), 5000);
      
      // Limit search to prevent excessive RPC calls
      const searchEndBlock = Math.min(currentBlock, deploymentBlock + this.MAX_TRANSACTION_SEARCH_BLOCKS);
      
      // Use a more efficient approach: sample fewer blocks
      const sampleSize = 20; // Reduced from 100 for speed
      const step = Math.max(1, Math.floor((searchEndBlock - deploymentBlock) / sampleSize));
      let count = 0;
      let samplesChecked = 0;

      // Sample blocks to estimate transaction count
      for (let block = deploymentBlock; block <= searchEndBlock && samplesChecked < sampleSize; block += step) {
        try {
          const blockData = await this.withTimeout(this.provider.getBlock(block, true), 3000);
          if (blockData && blockData.transactions) {
            const txCount = blockData.transactions.filter(
              (tx: any) => {
                if (typeof tx === 'string') return false;
                return tx.to?.toLowerCase() === contractAddress.toLowerCase();
              }
            ).length;
            count += txCount;
          }
          samplesChecked++;
        } catch {
          // Timeout or error, continue with next block
          continue;
        }
      }

      // Estimate total: if we sampled, extrapolate
      if (samplesChecked > 0 && step > 1) {
        const avgPerBlock = count / samplesChecked;
        const totalBlocks = searchEndBlock - deploymentBlock + 1;
        return Math.round(avgPerBlock * totalBlocks);
      }

      return count;
    } catch {
      // Fallback: return 0 if we can't count
      return 0;
    }
  }

  private async getLastTransaction(
    contractAddress: string,
    deploymentBlock: number | null
  ): Promise<string | null> {
    try {
      if (!deploymentBlock) return null;

      const currentBlock = await this.withTimeout(this.provider.getBlockNumber(), 5000);
      const searchStep = 100; // Larger steps for speed
      const maxBlocksToCheck = 500; // Reduced from 1000
      const searchStartBlock = Math.max(deploymentBlock, currentBlock - maxBlocksToCheck);
      const maxChecks = 20; // Limit number of blocks to check

      // Search backwards from current block
      for (let i = 0; i < maxChecks; i++) {
        const block = currentBlock - (i * searchStep);
        if (block < searchStartBlock) break;

        try {
          const blockData = await this.withTimeout(this.provider.getBlock(block, true), 3000);
          if (blockData && blockData.transactions) {
            const relevantTx = blockData.transactions.find(
              (tx: any) => {
                if (typeof tx === 'string') return false;
                return tx.to?.toLowerCase() === contractAddress.toLowerCase();
              }
            );
            if (relevantTx) {
              return new Date(blockData.timestamp * 1000).toISOString();
            }
          }
        } catch {
          // Timeout or error, continue
          continue;
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  private async getGasUsagePatterns(
    contractAddress: string,
    deploymentBlock: number | null
  ): Promise<{ average: number; min: number; max: number }> {
    try {
      if (!deploymentBlock) {
        return { average: 0, min: 0, max: 0 };
      }

      const currentBlock = await this.withTimeout(this.provider.getBlockNumber(), 5000);
      const sampleSize = 20; // Reduced from 50 for speed
      const gasUsages: number[] = [];
      const searchStep = 50; // Larger steps
      const maxBlocksToCheck = 200; // Reduced from 500
      const maxChecks = 10; // Limit number of blocks to check

      // Sample transactions from recent blocks
      const searchStartBlock = Math.max(deploymentBlock, currentBlock - maxBlocksToCheck);
      
      for (let i = 0; i < maxChecks && gasUsages.length < sampleSize; i++) {
        const block = currentBlock - (i * searchStep);
        if (block < searchStartBlock) break;

        try {
          const blockData = await this.withTimeout(this.provider.getBlock(block, true), 3000);
          if (blockData && blockData.transactions) {
            const relevantTxs = blockData.transactions.filter(
              (tx: any) => {
                if (typeof tx === 'string') return false;
                return tx.to?.toLowerCase() === contractAddress.toLowerCase();
              }
            );
            for (const tx of relevantTxs) {
              if (gasUsages.length >= sampleSize) break;
              if (typeof tx !== 'string') {
                const txObj = tx as { gasUsed?: bigint | string | number };
                if (txObj.gasUsed) {
                  gasUsages.push(Number(txObj.gasUsed));
                }
              }
            }
          }
        } catch {
          // Timeout or error, continue
          continue;
        }
      }

      if (gasUsages.length === 0) {
        return { average: 0, min: 0, max: 0 };
      }

      const sum = gasUsages.reduce((a, b) => a + b, 0);
      const average = Math.round(sum / gasUsages.length);
      const min = Math.min(...gasUsages);
      const max = Math.max(...gasUsages);

      return { average, min, max };
    } catch {
      return { average: 0, min: 0, max: 0 };
    }
  }
}
