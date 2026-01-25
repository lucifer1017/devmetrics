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
    if (network) {
      this.network = network;
    } else if (rpcUrl) {
      this.network = this.determineNetwork(rpcUrl);
    } else {
      this.network = 'mainnet';
    }
    
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
    return process.env.ROOTSTOCK_MAINNET_RPC_URL || 'https://public-node.rsk.co';
  }

  async getMetrics(contractAddress: string): Promise<RootstockMetrics> {
    const TOTAL_TIMEOUT = 45000;
    
    return Promise.race([
      this.fetchMetrics(contractAddress),
      new Promise<RootstockMetrics>((_, reject) =>
        setTimeout(() => reject(new Error(`Rootstock metrics fetch timed out after ${TOTAL_TIMEOUT}ms`)), TOTAL_TIMEOUT)
      )
    ]);
  }

  private async fetchMetrics(contractAddress: string): Promise<RootstockMetrics> {
    try {
      if (!ethers.isAddress(contractAddress)) {
        throw new Error(`Invalid contract address: ${contractAddress}`);
      }

      const currentBlockPromise = this.withTimeout(this.provider.getBlockNumber(), 5000);
      const deploymentBlockPromise = this.getDeploymentBlock(contractAddress);
      
      const currentBlock = await currentBlockPromise;
      const deploymentBlock = await deploymentBlockPromise;

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
      const searchStartBlock = Math.max(0, currentBlock - this.MAX_DEPLOYMENT_SEARCH_BLOCKS);
      const currentCode = await this.withTimeout(this.provider.getCode(contractAddress, currentBlock), 5000);
      
      if (!currentCode || currentCode === '0x') {
        const chunkSize = 2000;
        const maxChecks = 10;
        
        for (let i = 0; i < maxChecks; i++) {
          const block = currentBlock - (i * chunkSize);
          if (block < searchStartBlock) break;
          
          try {
            const code = await this.withTimeout(this.provider.getCode(contractAddress, block), 3000);
            if (code && code !== '0x') {
              return block;
            }
          } catch {
            continue;
          }
        }
        return null;
      }
      
      return await this.binarySearchDeployment(contractAddress, searchStartBlock, currentBlock);
    } catch (error: any) {
      return null;
    }
  }

  private async binarySearchDeployment(
    contractAddress: string,
    low: number,
    high: number
  ): Promise<number> {
    const maxIterations = 10;
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
      const searchEndBlock = Math.min(currentBlock, deploymentBlock + this.MAX_TRANSACTION_SEARCH_BLOCKS);
      const sampleSize = 20;
      const step = Math.max(1, Math.floor((searchEndBlock - deploymentBlock) / sampleSize));
      let count = 0;
      let samplesChecked = 0;

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
          continue;
        }
      }

      if (samplesChecked > 0 && step > 1) {
        const avgPerBlock = count / samplesChecked;
        const totalBlocks = searchEndBlock - deploymentBlock + 1;
        return Math.round(avgPerBlock * totalBlocks);
      }

      return count;
    } catch {
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
      const searchStep = 100;
      const maxBlocksToCheck = 500;
      const searchStartBlock = Math.max(deploymentBlock, currentBlock - maxBlocksToCheck);
      const maxChecks = 20;

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
      const sampleSize = 20;
      const gasUsages: number[] = [];
      const searchStep = 50;
      const maxBlocksToCheck = 200;
      const maxChecks = 10;
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
