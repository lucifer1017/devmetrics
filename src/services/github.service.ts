import { Octokit } from '@octokit/rest';
import { GitHubMetrics } from '../types/index.js';

export class GitHubService {
  private octokit: Octokit;
  private hasToken: boolean;
  private tokenInvalid: boolean = false;
  private readonly API_TIMEOUT = 15000; // 15 seconds per API call
  private readonly TOTAL_TIMEOUT = 60000; // 60 seconds total for all GitHub calls

  constructor(token?: string) {
    const authToken = token || process.env.GITHUB_TOKEN;
    this.hasToken = !!authToken;
    this.octokit = new Octokit({
      auth: authToken,
      request: {
        timeout: this.API_TIMEOUT,
      },
    });
  }

  /**
   * Execute API call with timeout
   */
  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number = this.API_TIMEOUT): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => 
        setTimeout(() => reject(new Error(`GitHub API call timed out after ${timeoutMs}ms`)), timeoutMs)
      )
    ]);
  }

  /**
   * Reset to unauthenticated mode if token is invalid
   */
  private resetToUnauthenticated() {
    if (this.tokenInvalid) return; // Already reset
    this.tokenInvalid = true;
    this.hasToken = false;
    this.octokit = new Octokit(); // Create new instance without auth
  }

  /**
   * Check if a GitHub token is configured
   */
  isAuthenticated(): boolean {
    return this.hasToken;
  }

  /**
   * Get current rate limit status
   */
  async getRateLimitStatus(): Promise<{ remaining: number; limit: number; resetAt: Date } | null> {
    try {
      const { data } = await this.withTimeout(this.octokit.rateLimit.get(), 5000);
      return {
        remaining: data.rate.remaining,
        limit: data.rate.limit,
        resetAt: new Date(data.rate.reset * 1000),
      };
    } catch (error: any) {
      // If 401, token is invalid - reset and try again
      if (error.status === 401 && this.hasToken && !this.tokenInvalid) {
        this.resetToUnauthenticated();
        try {
          const { data } = await this.withTimeout(this.octokit.rateLimit.get(), 5000);
          return {
            remaining: data.rate.remaining,
            limit: data.rate.limit,
            resetAt: new Date(data.rate.reset * 1000),
          };
        } catch {
          return null;
        }
      }
      return null;
    }
  }

  async getMetrics(owner: string, repo: string): Promise<GitHubMetrics> {
    // Overall timeout for entire operation
    return Promise.race([
      this.fetchMetrics(owner, repo),
      new Promise<GitHubMetrics>((_, reject) =>
        setTimeout(() => reject(new Error(`GitHub metrics fetch timed out after ${this.TOTAL_TIMEOUT}ms`)), this.TOTAL_TIMEOUT)
      )
    ]);
  }

  private async fetchMetrics(owner: string, repo: string): Promise<GitHubMetrics> {
    try {
      // Fetch repository info with timeout
      const { data: repoData } = await this.withTimeout(
        this.octokit.repos.get({
          owner,
          repo,
        })
      );

      // Fetch commits with timeout
      const { data: commits } = await this.withTimeout(
        this.octokit.repos.listCommits({
          owner,
          repo,
          per_page: 1,
        })
      );

      // Fetch open issues with timeout
      const { data: issues } = await this.withTimeout(
        this.octokit.issues.listForRepo({
          owner,
          repo,
          state: 'open',
          per_page: 1,
        })
      );

      // Fetch open pull requests count with timeout
      const { data: pullRequests } = await this.withTimeout(
        this.octokit.pulls.list({
          owner,
          repo,
          state: 'open',
          per_page: 1,
        })
      );

      // Get total counts
      const issuesCount = repoData.open_issues_count || 0;
      
      // Get PR count with timeout
      // Note: Search API counts as 1 request but gives accurate count
      // Without token, we use a simpler approach to save API calls
      let prsCount = 0;
      if (this.hasToken) {
        // With token: use search API for accurate count
        try {
          const { data: prSearch } = await this.withTimeout(
            this.octokit.search.issuesAndPullRequests({
              q: `repo:${owner}/${repo} type:pr state:open`,
              per_page: 1,
            })
          );
          prsCount = prSearch.total_count || 0;
        } catch {
          // Fallback: estimate from repo data if available
          // Note: repoData doesn't have separate PR count, so we use a basic estimate
          prsCount = pullRequests.length > 0 ? pullRequests.length : 0;
        }
      } else {
        // Without token: use minimal approach - just check if there are any PRs
        // This saves API calls (search API might be more expensive)
        prsCount = pullRequests.length > 0 ? pullRequests.length : 0;
        // Note: This is an estimate, not exact count, but saves rate limit
      }

      // Get contributors count with timeout
      // If no token, limit requests to stay within 60/hour limit
      let contributorsCount = 0;
      try {
        if (this.hasToken) {
          // With token: get more accurate count
          const { data: allContributors } = await this.withTimeout(
            this.octokit.repos.listContributors({
              owner,
              repo,
              per_page: 100,
            })
          );
          contributorsCount = allContributors.length;
          // If we got 100, there might be more, but we'll use this as an estimate
        } else {
          // Without token: use minimal requests, just get a sample
          const { data: contributors } = await this.withTimeout(
            this.octokit.repos.listContributors({
              owner,
              repo,
              per_page: 30, // Smaller sample to save API calls
            })
          );
          contributorsCount = contributors.length;
        }
      } catch {
        contributorsCount = 0;
      }

      return {
        stars: repoData.stargazers_count || 0,
        lastCommitDate: commits[0]?.commit.committer?.date || null,
        openIssuesCount: issuesCount,
        pullRequestsCount: prsCount,
        contributorCount: contributorsCount,
        repository: `${owner}/${repo}`,
      };
    } catch (error: any) {
      // Handle invalid/expired token (401)
      if (error.status === 401) {
        if (this.hasToken && !this.tokenInvalid) {
          // Token is invalid, fallback to unauthenticated mode
          this.resetToUnauthenticated();
          // Retry the request without authentication
          try {
            return await this.getMetrics(owner, repo);
          } catch (retryError: any) {
            // If retry also fails, throw original error
            throw new Error(`GitHub token is invalid or expired. Falling back to unauthenticated mode (60 requests/hour limit). Original error: ${error.message}`);
          }
        } else {
          throw new Error(`GitHub API authentication failed: ${error.message}`);
        }
      }
      
      if (error.status === 404) {
        throw new Error(`Repository ${owner}/${repo} not found`);
      }
      
      if (error.status === 403) {
        const rateLimitInfo = error.response?.headers?.['x-ratelimit-remaining'];
        const resetTime = error.response?.headers?.['x-ratelimit-reset'];
        let message = 'GitHub API rate limit exceeded.';
        
        if (this.hasToken && !this.tokenInvalid) {
          message += ' You have a token configured but still hit the limit (5,000/hour).';
        } else {
          message += ' Without a token, you are limited to 60 requests/hour.';
          message += ' Add a valid GITHUB_TOKEN to your .env file for 5,000 requests/hour.';
        }
        
        if (resetTime) {
          const resetDate = new Date(parseInt(resetTime) * 1000);
          message += ` Rate limit resets at: ${resetDate.toLocaleString()}`;
        }
        
        throw new Error(message);
      }
      
      throw new Error(`Failed to fetch GitHub metrics: ${error.message}`);
    }
  }

}
