import { ethers } from 'ethers';
import { RootstockMetrics } from '../types';

export type Network = 'mainnet' | 'testnet';

export class RootstockService {
  private provider: ethers.JsonRpcProvider;
  private network: Network;
  private rpcUrl: string;

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
    try {
      // Validate address
      if (!ethers.isAddress(contractAddress)) {
        throw new Error(`Invalid contract address: ${contractAddress}`);
      }

      // Get contract creation block (deployment block)
      const deploymentBlock = await this.getDeploymentBlock(contractAddress);

      // Get transaction count
      const transactionCount = await this.getTransactionCount(contractAddress, deploymentBlock);

      // Get last transaction timestamp
      const lastTransaction = await this.getLastTransaction(contractAddress, deploymentBlock);

      // Get gas usage patterns
      const gasUsagePatterns = await this.getGasUsagePatterns(
        contractAddress,
        deploymentBlock
      );

      return {
        contractAddress,
        deploymentBlock,
        totalTransactionCount: transactionCount,
        lastTransactionTimestamp: lastTransaction,
        gasUsagePatterns,
      };
    } catch (error: any) {
      throw new Error(`Failed to fetch Rootstock metrics: ${error.message}`);
    }
  }

  private async getDeploymentBlock(contractAddress: string): Promise<number | null> {
    try {
      // Get the first transaction to this contract
      // This is a simplified approach - in production you might use contract creation transaction
      const currentBlock = await this.provider.getBlockNumber();
      
      // Search backwards from current block
      // For efficiency, we'll check in chunks
      const chunkSize = 10000;
      let startBlock = Math.max(0, currentBlock - chunkSize);
      
      while (startBlock >= 0) {
        const code = await this.provider.getCode(contractAddress, startBlock);
        if (code && code !== '0x') {
          // Contract exists at this block, search more precisely
          return await this.binarySearchDeployment(contractAddress, startBlock, currentBlock);
        }
        startBlock = Math.max(0, startBlock - chunkSize);
      }
      
      return null;
    } catch {
      return null;
    }
  }

  private async binarySearchDeployment(
    contractAddress: string,
    low: number,
    high: number
  ): Promise<number> {
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      const code = await this.provider.getCode(contractAddress, mid);
      
      if (code && code !== '0x') {
        high = mid;
      } else {
        low = mid + 1;
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

      const currentBlock = await this.provider.getBlockNumber();
      let count = 0;
      const batchSize = 1000;

      // Count transactions in batches
      for (let block = deploymentBlock; block <= currentBlock; block += batchSize) {
        const endBlock = Math.min(block + batchSize - 1, currentBlock);
        const blockNumbers = Array.from(
          { length: endBlock - block + 1 },
          (_, i) => block + i
        );

        const blocks = await Promise.all(
          blockNumbers.map(b => this.provider.getBlock(b, true))
        );

        for (const blockData of blocks) {
          if (blockData && blockData.transactions) {
            count += blockData.transactions.filter(
              (tx: any) => {
                if (typeof tx === 'string') return false;
                return tx.to?.toLowerCase() === contractAddress.toLowerCase();
              }
            ).length;
          }
        }
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

      const currentBlock = await this.provider.getBlockNumber();
      const searchStep = 100;

      // Search backwards from current block
      for (let block = currentBlock; block >= deploymentBlock; block -= searchStep) {
        const startBlock = Math.max(block - searchStep + 1, deploymentBlock);
        const blockNumbers = Array.from(
          { length: block - startBlock + 1 },
          (_, i) => block - i
        );

        for (const blockNum of blockNumbers) {
          try {
            const blockData = await this.provider.getBlock(blockNum, true);
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

      const currentBlock = await this.provider.getBlockNumber();
      const sampleSize = 100; // Sample last N transactions
      const gasUsages: number[] = [];
      const searchStep = 10;

      // Sample transactions
      for (let block = currentBlock; block >= deploymentBlock && gasUsages.length < sampleSize; block -= searchStep) {
        try {
          const blockData = await this.provider.getBlock(block, true);
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
